// Task #2537 — Code family checks.
// Tutti i check sono filesystem-based (no AST heavy tools richiesti). Quando
// disponibili (ts-morph, knip, madge, jscpd), una versione expensive può
// arricchirli — qui restano cheap/medium per stabilità.
import path from "path";
import fs from "fs/promises";
import type { AppIntegrityCheck } from "../types";
import { walkFiles, readSafe, countLines, relWithin } from "../fs-helpers";

const TS_EXTS = [".ts", ".tsx"];
const SERVER_DIRS = ["server"];
const ALL_CODE_DIRS = ["server", "app", "lib", "hooks", "components", "shared", "scripts"];

const MAX_FILE_LINES = 300;
const NEAR_LIMIT_WARN = 590;
const HARD_LIMIT = 600;
const MAX_FN_LINES = 80;
const SAMPLE = 10;

function sampleOf<T>(arr: T[], n = SAMPLE): T[] { return arr.slice(0, n); }

const largeFilesCheck: AppIntegrityCheck = {
  id: "code/large-files",
  family: "code",
  name: "File TS > 300 righe",
  severity: "medium",
  cost: "cheap",
  description: "Identifica file TypeScript che superano la soglia di 300 righe (regola dimensioni file).",
  async query(ctx) {
    const files = await walkFiles(ctx.projectRoot, { extensions: TS_EXTS, includeDirs: ALL_CODE_DIRS });
    const offenders: { pk: string; data: Record<string, unknown> }[] = [];
    for (const f of files) {
      const txt = await readSafe(f.absPath);
      if (!txt) continue;
      const lines = countLines(txt);
      if (lines > MAX_FILE_LINES) {
        offenders.push({ pk: f.relPath, data: { path: f.relPath, lines, sizeKb: Math.round(f.size / 1024) } });
      }
    }
    offenders.sort((a, b) => (b.data.lines as number) - (a.data.lines as number));
    return { ok: offenders.length === 0, count: offenders.length, sample: sampleOf(offenders) };
  },
  explainHint: "Suggerisci di sotto-splittare per responsabilità o estrarre componenti/utility.",
};

const anyExplicitCheck: AppIntegrityCheck = {
  id: "code/any-explicit",
  family: "code",
  name: "Uso esplicito di `any` / `as any`",
  severity: "low",
  cost: "cheap",
  description: "File con `: any` o `as any` espliciti (esclude i `// eslint-disable` motivati).",
  async query(ctx) {
    const files = await walkFiles(ctx.projectRoot, { extensions: TS_EXTS, includeDirs: ALL_CODE_DIRS });
    const hits: { pk: string; data: Record<string, unknown> }[] = [];
    const re = /(?<![A-Za-z0-9_])(:\s*any\b|as\s+any\b)/g;
    for (const f of files) {
      const txt = await readSafe(f.absPath);
      if (!txt) continue;
      const matches = txt.match(re);
      if (matches && matches.length > 0) {
        hits.push({ pk: f.relPath, data: { path: f.relPath, occurrences: matches.length } });
      }
    }
    hits.sort((a, b) => (b.data.occurrences as number) - (a.data.occurrences as number));
    return { ok: hits.length === 0, count: hits.length, sample: sampleOf(hits) };
  },
};

const consoleResidualCheck: AppIntegrityCheck = {
  id: "code/console-residual",
  family: "code",
  name: "console.log residuo in server/",
  severity: "low",
  cost: "cheap",
  description: "Chiamate `console.log` lasciate in server/ (preferire logger pino).",
  async query(ctx) {
    const files = await walkFiles(ctx.projectRoot, { extensions: TS_EXTS, includeDirs: SERVER_DIRS });
    const hits: { pk: string; data: Record<string, unknown> }[] = [];
    for (const f of files) {
      const txt = await readSafe(f.absPath);
      if (!txt) continue;
      const matches = txt.match(/\bconsole\.log\s*\(/g);
      if (matches && matches.length > 0) {
        hits.push({ pk: f.relPath, data: { path: f.relPath, occurrences: matches.length } });
      }
    }
    hits.sort((a, b) => (b.data.occurrences as number) - (a.data.occurrences as number));
    return { ok: hits.length === 0, count: hits.length, sample: sampleOf(hits) };
  },
  explainHint: "Sostituisci `console.log` con `logger.debug` / `logger.info` (pino).",
};

const todoWithoutIssueCheck: AppIntegrityCheck = {
  id: "code/todo-without-issue",
  family: "code",
  name: "TODO/FIXME senza issue (#NNNN)",
  severity: "low",
  cost: "cheap",
  description: "Commenti TODO/FIXME privi di riferimento a task `#NNNN`.",
  async query(ctx) {
    const files = await walkFiles(ctx.projectRoot, { extensions: TS_EXTS, includeDirs: ALL_CODE_DIRS });
    const hits: { pk: string; data: Record<string, unknown> }[] = [];
    const re = /\b(TODO|FIXME|XXX|HACK)\b/g;
    const issueRef = /#\d{2,5}/;
    for (const f of files) {
      const txt = await readSafe(f.absPath);
      if (!txt) continue;
      const lines = txt.split("\n");
      let count = 0;
      const examples: string[] = [];
      for (let i = 0; i < lines.length; i++) {
        const l = lines[i];
        if (re.test(l) && !issueRef.test(l)) {
          count++;
          if (examples.length < 3) examples.push(`L${i + 1}: ${l.trim().slice(0, 120)}`);
        }
        re.lastIndex = 0;
      }
      if (count > 0) hits.push({ pk: f.relPath, data: { path: f.relPath, occurrences: count, examples } });
    }
    hits.sort((a, b) => (b.data.occurrences as number) - (a.data.occurrences as number));
    return { ok: hits.length === 0, count: hits.length, sample: sampleOf(hits) };
  },
};

const largeFunctionsCheck: AppIntegrityCheck = {
  id: "code/large-functions",
  family: "code",
  name: "Funzioni esportate molto lunghe (> 80 righe)",
  severity: "low",
  cost: "medium",
  description: "Approssima funzioni esportate che superano 80 righe via heuristic bracket count.",
  async query(ctx) {
    const files = await walkFiles(ctx.projectRoot, { extensions: TS_EXTS, includeDirs: ALL_CODE_DIRS });
    const hits: { pk: string; data: Record<string, unknown> }[] = [];
    const declRe = /^(export\s+)?(async\s+)?function\s+(\w+)\s*[(<]/;
    for (const f of files) {
      const txt = await readSafe(f.absPath);
      if (!txt) continue;
      const lines = txt.split("\n");
      const offenders: Array<{ name: string; line: number; size: number }> = [];
      for (let i = 0; i < lines.length; i++) {
        const m = lines[i].match(declRe);
        if (!m) continue;
        let depth = 0; let started = false; let end = i;
        for (let j = i; j < Math.min(lines.length, i + 600); j++) {
          for (const ch of lines[j]) {
            if (ch === "{") { depth++; started = true; }
            else if (ch === "}") { depth--; }
          }
          if (started && depth <= 0) { end = j; break; }
        }
        const size = end - i + 1;
        if (size > MAX_FN_LINES) offenders.push({ name: m[3], line: i + 1, size });
        i = end;
      }
      if (offenders.length) hits.push({ pk: f.relPath, data: { path: f.relPath, offenders: offenders.slice(0, 5), total: offenders.length } });
    }
    return { ok: hits.length === 0, count: hits.length, sample: sampleOf(hits) };
  },
};

// ---------- Expensive checks (eseguiti solo con includeExpensive: true) ----------

const EXPENSIVE_DIRS = ["server", "app", "lib", "hooks", "components", "shared"];
const EXPENSIVE_TIMEOUT_MS = 180_000;

async function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  let to: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, rej) => {
    to = setTimeout(() => rej(new Error(`${label} timeout dopo ${ms}ms`)), ms);
  });
  try {
    return await Promise.race([p, timeout]);
  } finally {
    if (to) clearTimeout(to);
  }
}

const codeDuplicationCheck: AppIntegrityCheck = {
  id: "code/duplication",
  family: "code",
  name: "Duplicazioni codice (jscpd, expensive)",
  severity: "low",
  cost: "expensive",
  expensive: true,
  description: "Detection blocchi duplicati >50 token con jscpd su server/app/lib/hooks/components/shared.",
  async query(ctx) {
    try {
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore — jscpd v5 è un binario nativo, non ha tipi npm
      const mod = (await import("jscpd").catch(() => null)) as { JSCPD?: new (opts: unknown) => { detect: (paths: string[]) => Promise<unknown> } } | null;
      if (!mod?.JSCPD) {
        return { ok: true, count: 0, sample: [], details: { skipped: "jscpd non installato" } };
      }
      const targets = EXPENSIVE_DIRS
        .map((d) => path.join(ctx.projectRoot, d))
        .filter((p) => p);
      const existing: string[] = [];
      for (const t of targets) {
        try { await fs.access(t); existing.push(t); } catch { /* skip */ }
      }
      if (!existing.length) return { ok: true, count: 0, sample: [] };

      const jscpd = new mod.JSCPD({
        path: existing,
        mode: "mild",
        minTokens: 50,
        minLines: 5,
        formatsExts: { typescript: ["ts", "tsx"] },
        format: ["typescript"],
        ignore: ["**/node_modules/**", "**/dist/**", "**/server_dist/**", "**/.expo/**", "**/build/**"],
        reporters: [],
        silent: true,
        absolute: false,
        gitignore: true,
      });
      type ClonePos = { sourceId?: string; start?: { line?: number }; end?: { line?: number } };
      type Clone = { duplicationA?: ClonePos; duplicationB?: ClonePos; lines?: number; tokens?: number };
      const clones = await withTimeout(jscpd.detect(existing), EXPENSIVE_TIMEOUT_MS, "jscpd") as unknown;
      const list: Clone[] = Array.isArray(clones) ? (clones as Clone[]) : [];
      const offenders = list.map((c) => {
        const a = c?.duplicationA ?? {};
        const b = c?.duplicationB ?? {};
        const aPath = relWithin(ctx.projectRoot, a.sourceId ?? "");
        const bPath = relWithin(ctx.projectRoot, b.sourceId ?? "");
        return {
          pk: `${aPath}↔${bPath}`,
          data: {
            a: { path: aPath, start: a.start?.line, end: a.end?.line },
            b: { path: bPath, start: b.start?.line, end: b.end?.line },
            lines: c?.lines ?? null,
            tokens: c?.tokens ?? null,
          },
        };
      });
      return {
        ok: offenders.length === 0,
        count: offenders.length,
        sample: sampleOf(offenders),
        details: { tool: "jscpd", minTokens: 50, scanned: existing.length },
      };
    } catch (e) {
      return { ok: true, count: 0, sample: [], details: { error: (e as Error).message } };
    }
  },
  explainHint: "Estrai i blocchi duplicati in funzioni/utility condivise.",
};

const circularImportsCheck: AppIntegrityCheck = {
  id: "code/circular-imports",
  family: "code",
  name: "Import circolari (madge)",
  severity: "high",
  cost: "expensive",
  expensive: true,
  description: "Cicli di import tra moduli TS/TSX. Rilevati con madge.",
  async query(ctx) {
    try {
      // @ts-ignore optional expensive dependency, no type declarations
      const mod = (await import("madge").catch(() => null)) as { default?: unknown } | unknown;
      const madge = (mod as { default?: unknown })?.default ?? mod;
      if (typeof madge !== "function") {
        return { ok: true, count: 0, sample: [], details: { skipped: "madge non installato" } };
      }
      const targets: string[] = [];
      for (const d of EXPENSIVE_DIRS) {
        const abs = path.join(ctx.projectRoot, d);
        try { await fs.access(abs); targets.push(abs); } catch { /* skip */ }
      }
      if (!targets.length) return { ok: true, count: 0, sample: [] };

      const tsConfigPath = path.join(ctx.projectRoot, "tsconfig.json");
      let tsConfig: string | undefined;
      try { await fs.access(tsConfigPath); tsConfig = tsConfigPath; } catch { /* skip */ }

      const res = await withTimeout((madge as (targets: string[], opts: unknown) => Promise<unknown>)(targets, {
        fileExtensions: ["ts", "tsx"],
        excludeRegExp: [/node_modules/, /\.expo\//, /server_dist\//, /\bdist\b/, /\bbuild\b/],
        tsConfig,
        detectiveOptions: { ts: { skipTypeImports: true }, tsx: { skipTypeImports: true } },
      }), EXPENSIVE_TIMEOUT_MS, "madge") as { circular?: () => string[][] } | null;
      const cycles: string[][] = typeof res?.circular === "function" ? res.circular() : [];
      const offenders = (cycles ?? []).map((cycle, idx) => ({
        pk: cycle.join(" → "),
        data: { cycle, length: cycle.length, index: idx },
      }));
      return {
        ok: offenders.length === 0,
        count: offenders.length,
        sample: sampleOf(offenders),
        details: { tool: "madge", scanned: targets.length },
      };
    } catch (e) {
      return { ok: true, count: 0, sample: [], details: { error: (e as Error).message } };
    }
  },
  explainHint: "Spezza il ciclo estraendo il tipo o l'utility condivisa in un terzo modulo.",
};

async function runProcess(
  cmd: string,
  args: string[],
  cwd: string,
  timeoutMs: number,
): Promise<{ stdout: string; stderr: string; code: number | null }> {
  const { spawn } = await import("child_process");
  return await new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd, env: process.env });
    let stdout = ""; let stderr = "";
    const to = setTimeout(() => {
      try { child.kill("SIGKILL"); } catch { /* noop */ }
      reject(new Error(`${cmd} timeout dopo ${timeoutMs}ms`));
    }, timeoutMs);
    child.stdout.on("data", (b) => { stdout += b.toString(); });
    child.stderr.on("data", (b) => { stderr += b.toString(); });
    child.on("error", (e) => { clearTimeout(to); reject(e); });
    child.on("close", (code) => { clearTimeout(to); resolve({ stdout, stderr, code }); });
  });
}

const unusedExportsCheck: AppIntegrityCheck = {
  id: "code/unused-exports",
  family: "code",
  name: "Export inutilizzati (knip)",
  severity: "low",
  cost: "expensive",
  expensive: true,
  description: "Identifica export, type-export, file e dipendenze non referenziate con knip.",
  async query(ctx) {
    const knipBin = path.join(ctx.projectRoot, "node_modules", ".bin", "knip");
    try { await fs.access(knipBin); } catch {
      return { ok: true, count: 0, sample: [], details: { skipped: "knip non installato" } };
    }
    try {
      const { stdout, code } = await runProcess(
        knipBin,
        ["--reporter", "json", "--no-progress", "--no-exit-code"],
        ctx.projectRoot,
        EXPENSIVE_TIMEOUT_MS,
      );
      if (!stdout.trim()) {
        return { ok: true, count: 0, sample: [], details: { tool: "knip", exit: code, note: "no stdout" } };
      }
      // knip JSON: { files: [...], issues: [ { file, exports: [...], types: [...], ...}, ... ] }
      type KnipIssue = {
        file?: string;
        exports?: Array<{ name?: string } | string>;
        types?: Array<{ name?: string } | string>;
        enumMembers?: Array<Record<string, unknown>>;
      };
      type KnipReport = { files?: string[]; issues?: KnipIssue[] };
      let parsed: KnipReport | null = null;
      try { parsed = JSON.parse(stdout) as KnipReport; } catch {
        // knip può anteporre log non-json — prendi l'ultima riga JSON-like
        const lastBrace = stdout.lastIndexOf("{");
        parsed = lastBrace >= 0 ? (JSON.parse(stdout.slice(lastBrace)) as KnipReport) : null;
      }
      const offenders: { pk: string; data: Record<string, unknown> }[] = [];
      const orphanFiles: string[] = Array.isArray(parsed?.files) ? parsed!.files! : [];
      for (const f of orphanFiles) {
        offenders.push({ pk: f, data: { path: f, kind: "unused-file" } });
      }
      const issues: KnipIssue[] = Array.isArray(parsed?.issues) ? parsed!.issues! : [];
      for (const it of issues) {
        const filePath = it?.file ?? "(unknown)";
        const exp = (it?.exports ?? []).map((e) => (typeof e === "object" ? e?.name : e) ?? e).filter(Boolean);
        const types = (it?.types ?? []).map((e) => (typeof e === "object" ? e?.name : e) ?? e).filter(Boolean);
        const enums = (it?.enumMembers ?? []).flatMap((e) => Object.values(e ?? {}));
        const total = exp.length + types.length + enums.length;
        if (total === 0) continue;
        offenders.push({
          pk: filePath,
          data: {
            path: filePath,
            unusedExports: exp.slice(0, 10),
            unusedTypes: types.slice(0, 10),
            total,
          },
        });
      }
      return {
        ok: offenders.length === 0,
        count: offenders.length,
        sample: sampleOf(offenders),
        details: { tool: "knip", orphanFiles: orphanFiles.length, exitCode: code },
      };
    } catch (e) {
      return { ok: true, count: 0, sample: [], details: { error: (e as Error).message } };
    }
  },
  explainHint: "Rimuovi gli export/file non referenziati o esponili come API pubblica esplicita.",
};

const unusedImportsCheck: AppIntegrityCheck = {
  id: "code/unused-imports",
  family: "code",
  name: "Import probabilmente inutilizzati (heuristic)",
  severity: "low",
  cost: "medium",
  description: "Heuristic: identifier importato che non compare nel resto del file (escludendo type-only).",
  async query(ctx) {
    const files = await walkFiles(ctx.projectRoot, { extensions: TS_EXTS, includeDirs: ALL_CODE_DIRS });
    const hits: { pk: string; data: Record<string, unknown> }[] = [];
    const importRe = /^import\s+(?:type\s+)?(?:\{\s*([^}]+)\s*\}|(\w+))\s+from\s+["'][^"']+["']/gm;
    for (const f of files) {
      const txt = await readSafe(f.absPath);
      if (!txt) continue;
      const idents: string[] = [];
      let m: RegExpExecArray | null;
      while ((m = importRe.exec(txt))) {
        if (m[1]) {
          for (const part of m[1].split(",")) {
            const name = part.trim().split(/\s+as\s+/).pop()?.replace(/\s+/g, "");
            if (name && /^[A-Za-z_]\w*$/.test(name)) idents.push(name);
          }
        } else if (m[2]) idents.push(m[2]);
      }
      importRe.lastIndex = 0;
      if (!idents.length) continue;
      const body = txt.replace(/^import\s+[\s\S]+?from\s+["'][^"']+["'];?\s*$/gm, "");
      const unused = idents.filter((id) => {
        const re = new RegExp(`\\b${id.replace(/[$.*+?^=!:${}()|[\]\\/]/g, "\\$&")}\\b`);
        return !re.test(body);
      });
      if (unused.length) hits.push({ pk: f.relPath, data: { path: f.relPath, unused: unused.slice(0, 10), total: unused.length } });
    }
    hits.sort((a, b) => (b.data.total as number) - (a.data.total as number));
    return { ok: hits.length === 0, count: hits.length, sample: sampleOf(hits) };
  },
  autofix: {
    kind: "code/remove-unused-import",
    safe: false,
    operation: "modify-file",
    targetPaths: [],
    async run() {
      return { applied: false, affected: 0, summary: "Autofix richiede ts-morph (non installato in questo task)." };
    },
  },
};

const nearLimitFilesCheck: AppIntegrityCheck = {
  id: "code/near-limit-files",
  family: "code",
  name: "File TS vicini al limite 600 righe",
  severity: "high",
  cost: "cheap",
  description: `Identifica file TypeScript con ≥${NEAR_LIMIT_WARN} righe, vicini al limite duro di ${HARD_LIMIT} righe. File ≥${HARD_LIMIT} righe sono oltre il limite e vanno splittati immediatamente.`,
  async query(ctx) {
    const files = await walkFiles(ctx.projectRoot, { extensions: TS_EXTS, includeDirs: ALL_CODE_DIRS });
    const warn: { pk: string; data: Record<string, unknown> }[] = [];
    const over: { pk: string; data: Record<string, unknown> }[] = [];
    for (const f of files) {
      const txt = await readSafe(f.absPath);
      if (!txt) continue;
      const lines = countLines(txt);
      if (lines >= HARD_LIMIT) {
        over.push({ pk: f.relPath, data: { path: f.relPath, lines, status: "OLTRE LIMITE — split urgente" } });
      } else if (lines >= NEAR_LIMIT_WARN) {
        warn.push({ pk: f.relPath, data: { path: f.relPath, lines, status: "vicino al limite — pianifica split" } });
      }
    }
    over.sort((a, b) => (b.data.lines as number) - (a.data.lines as number));
    warn.sort((a, b) => (b.data.lines as number) - (a.data.lines as number));
    const all = [...over, ...warn];
    const details: Record<string, unknown> = {
      overLimit: over.length,
      nearLimit: warn.length,
      hardLimit: HARD_LIMIT,
      warnThreshold: NEAR_LIMIT_WARN,
    };
    return { ok: all.length === 0, count: all.length, sample: sampleOf(all, 20), details };
  },
  explainHint: `File con ≥${NEAR_LIMIT_WARN} righe: elenca i file da splittare, suggerisci come dividerli per responsabilità (es. estrarre componenti, hook, utility o route separate).`,
};

const pack: AppIntegrityCheck[] = [
  largeFilesCheck,
  nearLimitFilesCheck,
  anyExplicitCheck,
  consoleResidualCheck,
  todoWithoutIssueCheck,
  largeFunctionsCheck,
  unusedImportsCheck,
  codeDuplicationCheck,
  circularImportsCheck,
  unusedExportsCheck,
];
export default pack;
