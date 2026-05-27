// Task #2537 — Workflows Replit family checks.
import path from "path";
import type { AppIntegrityCheck } from "../types";
import { walkFiles, readSafe, pathExists } from "../fs-helpers";

interface WorkflowSection { name: string; commands: string[]; }

async function parseReplit(root: string): Promise<{ raw: string; workflows: WorkflowSection[]; runButton: string | null }> {
  const raw = (await readSafe(path.join(root, ".replit"))) ?? "";
  const workflows: WorkflowSection[] = [];
  const lines = raw.split("\n");
  let current: WorkflowSection | null = null;
  let runButton: string | null = null;
  for (const l of lines) {
    const trimmed = l.trim();
    if (/^runButton\s*=/.test(trimmed)) {
      const m = trimmed.match(/=\s*"([^"]+)"/);
      if (m) runButton = m[1];
    }
    if (/^\[\[workflows\.workflow\]\]/.test(trimmed)) {
      if (current) workflows.push(current);
      current = { name: "", commands: [] };
      continue;
    }
    if (current) {
      const mn = trimmed.match(/^name\s*=\s*"([^"]+)"/);
      if (mn) current.name = mn[1];
      const mc = trimmed.match(/^(?:args|command)\s*=\s*"([^"]+)"/);
      if (mc) current.commands.push(mc[1]);
    }
  }
  if (current) workflows.push(current);
  return { raw, workflows, runButton };
}

const workflowScriptMissing: AppIntegrityCheck = {
  id: "workflows/script-missing",
  family: "workflows",
  name: "Workflow referenzia script inesistente",
  severity: "high",
  cost: "cheap",
  description: "Comandi workflow che invocano `bash scripts/X.sh` o `node scripts/X.js` senza file corrispondente.",
  async query(ctx) {
    const { workflows } = await parseReplit(ctx.projectRoot);
    const hits: { pk: string; data: Record<string, unknown> }[] = [];
    const re = /(?:bash|sh|node|npx tsx|tsx|python|python3)\s+(scripts\/[A-Za-z0-9._\-/]+)/g;
    for (const w of workflows) {
      for (const cmd of w.commands) {
        let m: RegExpExecArray | null;
        while ((m = re.exec(cmd))) {
          const p = path.join(ctx.projectRoot, m[1]);
          if (!(await pathExists(p))) {
            hits.push({ pk: `${w.name}:${m[1]}`, data: { workflow: w.name, script: m[1], command: cmd } });
          }
        }
        re.lastIndex = 0;
      }
    }
    return { ok: hits.length === 0, count: hits.length, sample: hits.slice(0, 10) };
  },
};

const scriptReferencedNotExisting: AppIntegrityCheck = {
  id: "workflows/script-referenced-not-existing",
  family: "workflows",
  name: "Riferimento scripts/X.sh nel codice senza file",
  severity: "medium",
  cost: "medium",
  description: "Codice (server/scripts/replit.md) referenzia `scripts/X.sh|.ts|.js` mancante.",
  async query(ctx) {
    const files = await walkFiles(ctx.projectRoot, {
      extensions: [".ts", ".tsx", ".js", ".sh", ".md"],
      includeDirs: ["server", "scripts", "app", "lib"],
    });
    const re = /(scripts\/[A-Za-z0-9._\-/]+\.(?:sh|ts|js|mjs|cjs))/g;
    const hits: { pk: string; data: Record<string, unknown> }[] = [];
    const seen = new Set<string>();
    for (const f of files) {
      const txt = await readSafe(f.absPath);
      if (!txt) continue;
      let m: RegExpExecArray | null;
      while ((m = re.exec(txt))) {
        if (seen.has(m[1])) continue;
        seen.add(m[1]);
        if (!(await pathExists(path.join(ctx.projectRoot, m[1])))) {
          hits.push({ pk: m[1], data: { script: m[1], referencedIn: f.relPath } });
        }
      }
      re.lastIndex = 0;
    }
    return { ok: hits.length === 0, count: hits.length, sample: hits.slice(0, 10) };
  },
};

const duplicateWorkflowNames: AppIntegrityCheck = {
  id: "workflows/duplicate-names",
  family: "workflows",
  name: "Workflow con nome duplicato",
  severity: "high",
  cost: "cheap",
  description: "Due o più workflow `[[workflows.workflow]]` con stesso `name`.",
  async query(ctx) {
    const { workflows } = await parseReplit(ctx.projectRoot);
    const map = new Map<string, number>();
    for (const w of workflows) map.set(w.name, (map.get(w.name) ?? 0) + 1);
    const dups = Array.from(map.entries()).filter(([, n]) => n > 1);
    return {
      ok: dups.length === 0, count: dups.length,
      sample: dups.map(([k, n]) => ({ pk: k, data: { name: k, occurrences: n } })),
    };
  },
};

const workflowWithoutName: AppIntegrityCheck = {
  id: "workflows/without-name",
  family: "workflows",
  name: "Workflow senza nome",
  severity: "high",
  cost: "cheap",
  description: "Sezione `[[workflows.workflow]]` priva di `name = \"...\"`.",
  async query(ctx) {
    const { workflows } = await parseReplit(ctx.projectRoot);
    const noname = workflows.filter((w) => !w.name);
    return {
      ok: noname.length === 0, count: noname.length,
      sample: noname.map((w, i) => ({ pk: `workflow-${i}`, data: { index: i } })),
    };
  },
};

const runButtonValid: AppIntegrityCheck = {
  id: "workflows/run-button-valid",
  family: "workflows",
  name: "runButton referenzia workflow esistente",
  severity: "high",
  cost: "cheap",
  description: "Se `runButton = \"X\"` è dichiarato, deve esistere un `[[workflows.workflow]]` con quel nome.",
  async query(ctx) {
    const { workflows, runButton } = await parseReplit(ctx.projectRoot);
    if (!runButton) return { ok: true, count: 0, sample: [], details: { note: "runButton non definito" } };
    const names = new Set(workflows.map((w) => w.name));
    if (!names.has(runButton)) {
      return { ok: false, count: 1, sample: [{ pk: runButton, data: { runButton, available: Array.from(names) } }] };
    }
    return { ok: true, count: 0, sample: [] };
  },
};

const replitWorkflowsPresent: AppIntegrityCheck = {
  id: "workflows/replit-section-present",
  family: "workflows",
  name: ".replit contiene sezione workflows",
  severity: "medium",
  cost: "cheap",
  description: "Verifica che .replit definisca almeno un workflow.",
  async query(ctx) {
    const { workflows, raw } = await parseReplit(ctx.projectRoot);
    if (!raw) return { ok: false, count: 1, sample: [{ pk: ".replit", data: { reason: "file .replit mancante" } }] };
    if (workflows.length === 0) return { ok: false, count: 1, sample: [{ pk: "workflows", data: { reason: "Nessun workflow definito" } }] };
    return { ok: true, count: 0, sample: [], details: { workflowCount: workflows.length } };
  },
};

const pack: AppIntegrityCheck[] = [
  workflowScriptMissing,
  scriptReferencedNotExisting,
  duplicateWorkflowNames,
  workflowWithoutName,
  runButtonValid,
  replitWorkflowsPresent,
];
export default pack;
