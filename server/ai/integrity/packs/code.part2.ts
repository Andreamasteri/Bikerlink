import path from "path";
import fs from "fs/promises";
import os from "os";
import { promisify } from "util";
import { execFile } from "child_process";
import type { AppIntegrityCheck } from "../types";
import { relWithin } from "../fs-helpers";

const execFileAsync = promisify(execFile);

const EXPENSIVE_DIRS = ["server", "app", "lib", "hooks", "components", "shared"];
const EXPENSIVE_TIMEOUT_MS = 180_000;

function sampleOf<T>(arr: T[], n = 10): T[] { return arr.slice(0, n); }

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

export const codeDuplicationCheck: AppIntegrityCheck = {
  id: "code/duplication",
  family: "code",
  name: "Duplicazioni codice (jscpd, expensive)",
  severity: "low",
  cost: "expensive",
  expensive: true,
  description: "Detection blocchi duplicati >50 token con jscpd su server/app/lib/hooks/components/shared.",
  async query(ctx) {
    try {
      const jscpdBin = path.join(ctx.projectRoot, "node_modules", ".bin", "jscpd");
      try { await fs.access(jscpdBin); } catch {
        return { ok: true, count: 0, sample: [], details: { skipped: "jscpd non installato" } };
      }

      const targets = EXPENSIVE_DIRS
        .map((d) => path.join(ctx.projectRoot, d))
        .filter(Boolean);
      const existing: string[] = [];
      for (const t of targets) {
        try { await fs.access(t); existing.push(t); } catch { /* skip */ }
      }
      if (!existing.length) return { ok: true, count: 0, sample: [] };

      const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "jscpd-"));
      try {
        const args = [
          ...existing,
          "--min-tokens", "50",
          "--min-lines", "5",
          "--mode", "mild",
          "--format", "typescript",
          "--formats-exts", "typescript:ts,tsx",
          "--ignore", "**/node_modules/**,**/dist/**,**/server_dist/**,**/.expo/**,**/build/**",
          "--reporters", "json",
          "--output", tmpDir,
          "--no-colors",
        ];

        await withTimeout(
          execFileAsync(jscpdBin, args, { cwd: ctx.projectRoot }).catch((err: NodeJS.ErrnoException & { code?: number }) => {
            if (typeof err.code === "number" && err.code > 0) return;
            throw err;
          }),
          EXPENSIVE_TIMEOUT_MS,
          "jscpd",
        );

        const reportPath = path.join(tmpDir, "jscpd-report.json");
        let report: unknown;
        try {
          const raw = await fs.readFile(reportPath, "utf-8");
          report = JSON.parse(raw);
        } catch {
          return { ok: true, count: 0, sample: [], details: { skipped: "report jscpd non generato" } };
        }

        type FileRef = { name?: string; start?: number; end?: number };
        type Duplicate = { firstFile?: FileRef; secondFile?: FileRef; lines?: number; tokens?: number };
        type Report = { duplicates?: Duplicate[] };

        const list: Duplicate[] = (report as Report)?.duplicates ?? [];
        const offenders = list.map((c) => {
          const a = c?.firstFile ?? {};
          const b = c?.secondFile ?? {};
          const aPath = relWithin(ctx.projectRoot, a.name ?? "");
          const bPath = relWithin(ctx.projectRoot, b.name ?? "");

          const aTop = aPath.split("/")[0] ?? "";
          const bTop = bPath.split("/")[0] ?? "";
          const familyHint: "same" | "cross" = aTop === bTop ? "same" : "cross";

          const aSegs = aPath.split("/").slice(0, -1);
          const bSegs = bPath.split("/").slice(0, -1);
          const commonSegs: string[] = [];
          for (let i = 0; i < Math.min(aSegs.length, bSegs.length); i++) {
            if (aSegs[i] === bSegs[i]) commonSegs.push(aSegs[i]!);
            else break;
          }
          const suggestedExtract = commonSegs.length
            ? `${commonSegs.join("/")}/shared.ts`
            : familyHint === "same"
            ? `${aTop}/shared.ts`
            : null;

          return {
            pk: `${aPath}↔${bPath}`,
            data: {
              a: { path: aPath, start: a.start, end: a.end },
              b: { path: bPath, start: b.start, end: b.end },
              lines: c?.lines ?? null,
              tokens: c?.tokens ?? null,
              family_hint: familyHint,
              suggested_extract: suggestedExtract,
            },
          };
        });

        return {
          ok: offenders.length === 0,
          count: offenders.length,
          sample: sampleOf(offenders),
          details: { tool: "jscpd@5", minTokens: 50, scanned: existing.length },
        };
      } finally {
        await fs.rm(tmpDir, { recursive: true, force: true });
      }
    } catch (e) {
      return { ok: true, count: 0, sample: [], details: { error: (e as Error).message } };
    }
  },
  explainHint: "Estrai i blocchi duplicati in funzioni/utility condivise.",
};

export const circularImportsCheck: AppIntegrityCheck = {
  id: "code/circular-imports",
  family: "code",
  name: "Import circolari (madge)",
  severity: "high",
  cost: "expensive",
  expensive: true,
  description: "Cicli di import tra moduli TS/TSX. Rilevati con madge.",
  async query(ctx) {
    try {
      // @ts-ignore — madge non ha @types
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

export const unusedExportsCheck: AppIntegrityCheck = {
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
      type KnipIssue = {
        file?: string;
        exports?: Array<{ name?: string } | string>;
        types?: Array<{ name?: string } | string>;
        enumMembers?: Array<Record<string, unknown>>;
      };
      type KnipReport = { files?: string[]; issues?: KnipIssue[] };
      let parsed: KnipReport | null = null;
      try { parsed = JSON.parse(stdout) as KnipReport; } catch {
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
