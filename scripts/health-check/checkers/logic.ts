// Task #4825 — Checker logica: anti-pattern noti (incl. loop React Navigation BikerLink).
import { listSourceFiles, safeRead, offsetToLine, lineSnippet } from "../scan-utils";
import type { CheckResult, Severity } from "../types";

interface Pattern {
  id: string;
  re: RegExp;
  severity: Severity;
  description: string;
  /** Solo per file il cui path matcha (es. _layout). */
  pathHint?: RegExp;
}

// Pattern derivati dalla memoria del progetto (loop setOptions, deps router, ecc.).
const PATTERNS: Pattern[] = [
  {
    id: "LG-router-deps",
    re: /useEffect\([^)]*\}\s*,\s*\[[^\]]*\brouter\b[^\]]*\]\s*\)/s,
    severity: "warning",
    description: "router nelle deps di useEffect che fa router.replace/push → rischio loop 'Maximum update depth'",
  },
  {
    id: "LG-inline-taboptions",
    re: /tabBarIcon\s*=\s*\{\s*\(/,
    severity: "warning",
    description: "tabBarIcon con funzione inline → setOptions ad ogni render (usa useCallback)",
    pathHint: /_layout\.tsx$/,
  },
  {
    id: "LG-nested-screenoptions",
    re: /screenOptions=\{\{[^}]*\w+Style:\s*\{/s,
    severity: "warning",
    description: "screenOptions con oggetto annidato inline → nuovo riferimento ogni render (usa useMemo)",
  },
  {
    id: "LG-usestate-no-type",
    re: /useState\(\s*\[\s*\]\s*\)/,
    severity: "info",
    description: "useState([]) senza annotazione di tipo esplicita",
  },
  {
    id: "LG-console-log",
    re: /^\s*console\.log\(/m,
    severity: "info",
    description: "console.log residuo nel codice",
    pathHint: /^app\//,
  },
  {
    id: "LG-promise-all-db",
    re: /Promise\.all\(/,
    severity: "info",
    description: "Promise.all — verificare che non saturi il pool DB (usa withBgDbSlot per job background)",
    pathHint: /^server\//,
  },
];

export async function runLogic(): Promise<CheckResult[]> {
  const out: CheckResult[] = [];
  for (const f of listSourceFiles(["app", "server", "components", "hooks", "lib"])) {
    const text = safeRead(f.abs);
    if (!text) continue;
    for (const p of PATTERNS) {
      if (p.pathHint && !p.pathHint.test(f.rel)) continue;
      const re = new RegExp(p.re.source, p.re.flags.includes("g") ? p.re.flags : p.re.flags + "g");
      let m: RegExpExecArray | null;
      let count = 0;
      while ((m = re.exec(text)) !== null && count < 5) {
        const line = offsetToLine(text, m.index);
        out.push({
          checkId: p.id,
          category: "logic",
          severity: p.severity,
          file: f.rel,
          line,
          description: p.description,
          evidence: lineSnippet(text, line),
        });
        count++;
        if (!re.global) break;
      }
    }
  }
  return out;
}
