/**
 * Audit dei file in server/routes/planned-routes/ per la soglia 450 righe.
 *
 * Blocca (exit 1) se un file supera PLANNED_ROUTES_LIMIT senza avere un file
 * companion `<nome>.next.ts` nella stessa cartella.
 *
 * Un companion già esistente non è garanzia che venga usato — la verifica è
 * solo strutturale (presenza del file). Usare questo script come gate CI/lint
 * prima di ogni merge che tocca server/routes/planned-routes/.
 *
 * Soglia: 450 righe (più bassa del limite globale 600 per intercettare
 * la crescita con anticipo).
 *
 * Uso:
 *   npx tsx scripts/check-planned-routes-size.ts
 */

import { readdirSync, existsSync, readFileSync } from "fs";
import { join, basename, extname } from "path";

const PLANNED_ROUTES_DIR = "server/routes/planned-routes";
const PLANNED_ROUTES_LIMIT = 450;

function countLines(filePath: string): number {
  return readFileSync(filePath, "utf-8").split("\n").length;
}

interface FileReport {
  file: string;
  lines: number;
  hasCompanion: boolean;
  companionPath: string;
}

const dir = join(process.cwd(), PLANNED_ROUTES_DIR);

if (!existsSync(dir)) {
  console.error(`❌ Directory non trovata: ${PLANNED_ROUTES_DIR}`);
  process.exit(1);
}

const entries = readdirSync(dir).filter((f) => f.endsWith(".ts"));

const reports: FileReport[] = [];

for (const entry of entries) {
  const ext = extname(entry);
  const base = basename(entry, ext);

  // Salta i file companion (*.next.ts) — non devono auto-monitorarsi.
  if (base.endsWith(".next")) continue;

  // Salta utility non-route (weather-helper, utils).
  // La soglia si applica comunque — se crescono oltre 450 righe, segnalarlo.

  const filePath = join(dir, entry);
  const lines = countLines(filePath);

  const companionName = `${base}.next.ts`;
  const companionPath = join(dir, companionName);
  const hasCompanion = existsSync(companionPath);

  reports.push({
    file: `${PLANNED_ROUTES_DIR}/${entry}`,
    lines,
    hasCompanion,
    companionPath: `${PLANNED_ROUTES_DIR}/${companionName}`,
  });
}

reports.sort((a, b) => b.lines - a.lines);

const violations = reports.filter(
  (r) => r.lines > PLANNED_ROUTES_LIMIT && !r.hasCompanion,
);

const warnings = reports.filter(
  (r) =>
    r.lines > PLANNED_ROUTES_LIMIT * 0.75 &&
    r.lines <= PLANNED_ROUTES_LIMIT &&
    !r.hasCompanion,
);

console.log(`\nAudit: ${PLANNED_ROUTES_DIR}  (soglia ${PLANNED_ROUTES_LIMIT} righe)\n`);

const maxLen = Math.max(...reports.map((r) => r.file.length));

for (const r of reports) {
  const pct = Math.round((r.lines / PLANNED_ROUTES_LIMIT) * 100);
  const bar = "█".repeat(Math.min(20, Math.round(pct / 5)));
  const companionTag = r.hasCompanion ? "  ✅ companion" : "";
  const status =
    r.lines > PLANNED_ROUTES_LIMIT
      ? r.hasCompanion
        ? "⚠️ OVER (companion presente)"
        : "❌ OVER — companion mancante"
      : r.lines > PLANNED_ROUTES_LIMIT * 0.75
        ? "⚠️  avvicina soglia"
        : "✅";
  console.log(
    `  ${r.file.padEnd(maxLen + 2)} ${String(r.lines).padStart(4)} righe  ${bar.padEnd(20)}  ${pct}%  ${status}${companionTag}`,
  );
}

if (warnings.length > 0) {
  console.log(
    `\nℹ️  ${warnings.length} file tra il 75% e il 100% della soglia — considera di creare il companion ora:`,
  );
  for (const w of warnings) {
    console.log(`   ${w.file} (${w.lines} righe) → crea ${w.companionPath}`);
  }
}

if (violations.length > 0) {
  console.error(
    `\n❌ ${violations.length} file supera ${PLANNED_ROUTES_LIMIT} righe senza companion:\n`,
  );
  for (const v of violations) {
    console.error(`  ${v.file}  →  ${v.lines} righe`);
    console.error(
      `     Crea il companion: ${v.companionPath}  (vedi waypoints.next.ts come modello)\n`,
    );
  }
  console.error(
    `Splitta i nuovi handler nel companion invece di continuare ad aggiungere righe al file originale.\n`,
  );
  process.exit(1);
}

console.log(
  `\n✅ Nessuna violazione — tutti i file entro ${PLANNED_ROUTES_LIMIT} righe o con companion presente.\n`,
);
process.exit(0);
