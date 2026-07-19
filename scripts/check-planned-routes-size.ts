/**
 * Audit dei file in server/routes/<sub-folder>/ per la soglia 450 righe.
 *
 * Per default analizza TUTTE le sotto-cartelle in AUDIT_DIRS.
 * Accetta --dir <path> per puntare a una singola cartella (relativa alla root
 * del progetto oppure assoluta).
 *
 * Blocca (exit 1) se un file supera LIMIT senza avere un file companion
 * `<nome>.next.ts` nella stessa cartella.
 *
 * Un companion già esistente non è garanzia che venga usato — la verifica è
 * solo strutturale (presenza del file). Usare questo script come gate CI/lint
 * prima di ogni merge che tocca server/routes/.
 *
 * Soglia: 450 righe (più bassa del limite globale 800 per intercettare
 * la crescita con anticipo).
 *
 * Uso:
 *   npx tsx scripts/check-planned-routes-size.ts
 *   npx tsx scripts/check-planned-routes-size.ts --dir server/routes/proposals
 */

import { readdirSync, existsSync, readFileSync } from "fs";
import { join, basename, extname, resolve } from "path";

const LIMIT = 450;

const DEFAULT_DIRS = [
  "server/routes/planned-routes",
  "server/routes/proposals",
  "server/routes/users",
  "server/routes/admin",
];

function parseArgs(): string[] {
  const args = process.argv.slice(2);
  const dirIdx = args.indexOf("--dir");
  if (dirIdx !== -1) {
    const dirArg = args[dirIdx + 1];
    if (!dirArg) {
      console.error("❌ --dir richiede un argomento (percorso della cartella).");
      process.exit(1);
    }
    return [dirArg];
  }
  return DEFAULT_DIRS;
}

function countLines(filePath: string): number {
  return readFileSync(filePath, "utf-8").split("\n").length;
}

interface FileReport {
  file: string;
  lines: number;
  hasCompanion: boolean;
  companionPath: string;
}

function auditDir(relDir: string): { violations: FileReport[]; warnings: FileReport[]; ok: boolean } {
  const absDir = resolve(process.cwd(), relDir);

  if (!existsSync(absDir)) {
    console.error(`❌ Directory non trovata: ${relDir}`);
    return { violations: [], warnings: [], ok: false };
  }

  const entries = readdirSync(absDir).filter((f) => f.endsWith(".ts"));
  const reports: FileReport[] = [];

  for (const entry of entries) {
    const ext = extname(entry);
    const base = basename(entry, ext);

    if (base.endsWith(".next")) continue;

    const filePath = join(absDir, entry);
    const lines = countLines(filePath);

    const companionName = `${base}.next.ts`;
    const companionPath = join(absDir, companionName);
    const hasCompanion = existsSync(companionPath);

    reports.push({
      file: `${relDir}/${entry}`,
      lines,
      hasCompanion,
      companionPath: `${relDir}/${companionName}`,
    });
  }

  reports.sort((a, b) => b.lines - a.lines);

  const violations = reports.filter((r) => r.lines > LIMIT && !r.hasCompanion);
  const warnings = reports.filter(
    (r) => r.lines > LIMIT * 0.75 && r.lines <= LIMIT && !r.hasCompanion,
  );

  console.log(`\nAudit: ${relDir}  (soglia ${LIMIT} righe)`);

  if (reports.length === 0) {
    console.log("  (nessun file .ts trovato)\n");
    return { violations, warnings, ok: true };
  }

  const maxLen = Math.max(...reports.map((r) => r.file.length));

  for (const r of reports) {
    const pct = Math.round((r.lines / LIMIT) * 100);
    const bar = "█".repeat(Math.min(20, Math.round(pct / 5)));
    const status =
      r.lines > LIMIT
        ? r.hasCompanion
          ? "⚠️  OVER (companion presente)"
          : "❌ OVER — companion mancante"
        : r.lines > LIMIT * 0.75
          ? "⚠️  avvicina soglia"
          : "✅";
    const companionTag = r.hasCompanion ? "  ✅ companion" : "";
    console.log(
      `  ${r.file.padEnd(maxLen + 2)} ${String(r.lines).padStart(4)} righe  ${bar.padEnd(20)}  ${pct}%  ${status}${companionTag}`,
    );
  }

  if (warnings.length > 0) {
    console.log(
      `\n  ℹ️  ${warnings.length} file tra il 75% e il 100% della soglia — considera di creare il companion ora:`,
    );
    for (const w of warnings) {
      console.log(`     ${w.file} (${w.lines} righe) → crea ${w.companionPath}`);
    }
  }

  if (violations.length > 0) {
    console.error(`\n  ❌ ${violations.length} file supera ${LIMIT} righe senza companion:`);
    for (const v of violations) {
      console.error(`     ${v.file}  →  ${v.lines} righe`);
      console.error(`        Crea: ${v.companionPath}  (vedi waypoints.next.ts come modello)`);
    }
  }

  console.log("");
  return { violations, warnings, ok: true };
}

const dirs = parseArgs();

let totalViolations = 0;

for (const dir of dirs) {
  const result = auditDir(dir);
  if (!result.ok) {
    process.exit(1);
  }
  totalViolations += result.violations.length;
}

if (dirs.length > 1) {
  console.log("─".repeat(60));
}

if (totalViolations > 0) {
  console.error(
    `\n❌ ${totalViolations} violazion${totalViolations === 1 ? "e" : "i"} totale${totalViolations === 1 ? "" : "i"} — splitta i nuovi handler nel companion invece di continuare ad aggiungere righe al file originale.\n`,
  );
  process.exit(1);
}

console.log(
  `✅ Nessuna violazione — tutti i file entro ${LIMIT} righe o con companion presente.\n`,
);
process.exit(0);
