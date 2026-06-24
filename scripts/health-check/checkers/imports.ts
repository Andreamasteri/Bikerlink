// Task #4825 — Checker import: rileva import relativi rotti (file inesistente).
// Gli alias (@/, @shared/) sono risolti dai tsconfig; qui si validano i relativi.
import { existsSync } from "fs";
import { dirname, resolve } from "path";
import { listSourceFiles, safeRead, offsetToLine, lineSnippet } from "../scan-utils";
import type { CheckResult } from "../types";

const IMPORT_RE = /(?:import|export)\s[^'"]*?from\s+['"](\.[^'"]+)['"]/g;
const CANDIDATES = ["", ".ts", ".tsx", ".js", ".jsx", "/index.ts", "/index.tsx", "/index.js"];

function resolves(fromDir: string, spec: string): boolean {
  const base = resolve(fromDir, spec);
  return CANDIDATES.some((ext) => existsSync(base + ext));
}

export async function runImports(): Promise<CheckResult[]> {
  const out: CheckResult[] = [];
  for (const f of listSourceFiles()) {
    const text = safeRead(f.abs);
    if (!text) continue;
    const dir = dirname(f.abs);
    const re = new RegExp(IMPORT_RE.source, "g");
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const spec = m[1];
      if (resolves(dir, spec)) continue;
      const line = offsetToLine(text, m.index);
      out.push({
        checkId: "IM-broken",
        category: "imports",
        severity: "critical",
        file: f.rel,
        line,
        description: `Import relativo non risolvibile: '${spec}'`,
        evidence: lineSnippet(text, line),
      });
    }
  }
  return out;
}
