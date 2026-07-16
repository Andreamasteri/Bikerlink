/**
 * CI ratchet for the "max 650 lines per TS file" rule.
 *
 * Blocks when:
 *   (a) a NEW file (not in baseline, no marker) exceeds 650 lines;
 *   (b) a baseline-tracked file GROWS above its stored line count;
 *   (c) a LOCKED file exceeds its declared `<N>` (drift > +5);
 *   (d) a marker `LARGE-FILE-ALLOW` appears on a file NOT listed in
 *       `.large-files-allow.txt` (auto-discovery proibita);
 *   (e) a LOCKED file's declared `<N>` is RAISED above the value stored
 *       in baseline (anti-bypass: vietato alzare il limite di un LOCKED);
 *   (f) a LOCKED file is missing the obligatory companion line
 *       (`// Aggiungi nuove funzionalità in: <companion-path>`).
 *
 * Passes when counts shrink or stay the same.
 *
 * `--update-baseline` is HUMAN-ONLY and requires
 *   `BIKERLINK_HUMAN_BASELINE_UPDATE=1`. Agents must NOT use it.
 *
 * Invoked through `scripts/check-large-files-ratchet.sh` which enforces
 * the env-var gate.
 */
import { writeFileSync, readFileSync } from "fs";
import { join } from "path";
import {
  MAX_LINES,
  LOCKED_DRIFT,
  BASELINE_PATH,
  buildFileState,
  loadAllowList,
  loadBaseline,
} from "./lib/large-files-core";

const args = process.argv.slice(2);
const UPDATE = args.includes("--update-baseline");

if (UPDATE && process.env.BIKERLINK_HUMAN_BASELINE_UPDATE !== "1") {
  console.error(
    "❌ Solo l'utente può aggiornare la baseline. Se il file si è ridotto, " +
      "chiedi all'utente di eseguire " +
      "`BIKERLINK_HUMAN_BASELINE_UPDATE=1 bash scripts/check-large-files-ratchet.sh --update-baseline`.",
  );
  process.exit(2);
}

const state = buildFileState();
const allowList = loadAllowList();
const baseline = loadBaseline();

type Error = { file: string; reason: string };
const errors: Error[] = [];
const shrinkHints: string[] = [];

// Snapshot for baseline writing (only used with --update-baseline).
const legacySnapshot: { file: string; lines: number }[] = [];
const lockedSnapshot: { file: string; limit: number }[] = [];

for (const entry of state) {
  // (d) Marker LARGE-FILE-ALLOW su file non in lista → blocco.
  if (entry.marker?.kind === "ALLOW") {
    if (!allowList.has(entry.file)) {
      errors.push({
        file: entry.file,
        reason:
          `marker LARGE-FILE-ALLOW presente ma il file NON è in ${".large-files-allow.txt"}. ` +
          `Auto-discovery proibita: aggiunte richiedono task utente esplicito.`,
      });
    }
    // File ALLOW autorizzato → niente baseline, niente check.
    continue;
  }

  // LOCKED checks: drift, anti-bypass upward, companion required.
  if (entry.marker?.kind === "LOCKED") {
    const limit = entry.marker.lockedLimit ?? MAX_LINES;

    // When UPDATE=true and the file has shrunk significantly, auto-patch line 1
    // so the marker comment reflects the new (lower) limit — no manual edit needed.
    let effectiveLimit = limit;
    if (UPDATE && limit - entry.lines > LOCKED_DRIFT) {
      const newLimit = entry.lines;
      const filePath = join(process.cwd(), entry.file);
      const content = readFileSync(filePath, "utf-8");
      const fileLines = content.split("\n");
      const oldRaw = entry.marker.rawLine;
      const newRaw = oldRaw.replace(
        /(LARGE-FILE-LOCKED\s+[—-]\s*limite:\s*)\d+/,
        `$1${newLimit}`,
      );
      if (newRaw !== oldRaw) {
        fileLines[0] = newRaw;
        writeFileSync(filePath, fileLines.join("\n"), "utf-8");
        console.log(
          `  ✏️  ${entry.file}: marker aggiornato limite ${limit} → ${newLimit}`,
        );
      }
      effectiveLimit = newLimit;
    }

    lockedSnapshot.push({ file: entry.file, limit: effectiveLimit });

    // (f) Companion path obbligatorio (seconda riga).
    if (!entry.marker.companionPath) {
      errors.push({
        file: entry.file,
        reason:
          `LOCKED file senza riga companion. ` +
          `Aggiungi come SECONDA riga: \`// Aggiungi nuove funzionalità in: <companion-path>\`.`,
      });
    }

    // (e) Anti-bypass: vietato ALZARE il limite stored nella baseline.
    if (!UPDATE) {
      const baselineLimit = baseline.locked.get(entry.file);
      if (baselineLimit !== undefined && limit > baselineLimit) {
        const comp = entry.marker.companionPath
          ? ` Aggiungi nuove funzionalità in: ${entry.marker.companionPath}`
          : "";
        errors.push({
          file: entry.file,
          reason:
            `LOCKED bypass rilevato: limite dichiarato ALZATO da ${baselineLimit} a ${limit}. ` +
            `Vietato a qualsiasi agente. Splitta il file invece di alzare il limite.${comp}`,
        });
        // Skip drift check (lo terrebbero comunque entrambi attivati).
        continue;
      }
    }

    // (c) Drift sul conteggio reale rispetto a N.
    const diff = entry.lines - limit;
    if (diff > LOCKED_DRIFT) {
      const comp = entry.marker.companionPath
        ? ` Aggiungi nuove funzionalità in: ${entry.marker.companionPath}`
        : "";
      errors.push({
        file: entry.file,
        reason:
          `LOCKED file: ${entry.lines} righe, limite dichiarato ${limit} ` +
          `(drift +${diff} > ${LOCKED_DRIFT}).${comp}`,
      });
    } else if (limit - entry.lines > LOCKED_DRIFT) {
      shrinkHints.push(
        `  ${entry.file}: ${entry.lines} righe, limite ${limit} ` +
          `(shrink di ${limit - entry.lines}; valuta --update-baseline)`,
      );
    }
    // LOCKED tracciato sopra (lockedSnapshot).
    continue;
  }

  // No marker.
  if (entry.lines > MAX_LINES) {
    legacySnapshot.push({ file: entry.file, lines: entry.lines });

    if (UPDATE) continue; // si scriverà sotto

    const baselineLines = baseline.legacy.get(entry.file);
    if (baselineLines === undefined) {
      // (a) Nuovo file oltre 650.
      errors.push({
        file: entry.file,
        reason:
          `nuovo file oltre il limite: ${entry.lines} righe (max ${MAX_LINES}). ` +
          `Splitta il file o, se è debito legacy autorizzato, attiva il marker corretto via task utente.`,
      });
    } else if (entry.lines > baselineLines) {
      // (b) Crescita oltre la baseline.
      errors.push({
        file: entry.file,
        reason:
          `regressione: ${entry.lines} righe (baseline ${baselineLines}, +${entry.lines - baselineLines}). ` +
          `Riduci il file sotto la baseline prima di committare.`,
      });
    }
  }
}

if (UPDATE) {
  legacySnapshot.sort((a, b) => a.file.localeCompare(b.file));
  lockedSnapshot.sort((a, b) => a.file.localeCompare(b.file));
  const header = [
    "# .large-files-baseline",
    "# Snapshot dei file TypeScript tracciati dal ratchet 650 righe.",
    "# Formato (un record per riga, commenti con `#`):",
    "#   LEGACY <path> <lines>        — file >650 senza marker (debito legacy puro).",
    "#   LOCKED <path> <declaredLimit> — file con marker `// LARGE-FILE-LOCKED — limite: <N>`,",
    "#                                   tracciato per anti-bypass (vietato alzare <N>).",
    "# File ALLOW NON compaiono qui — sono elencati in `.large-files-allow.txt`.",
    "# Aggiornare SOLO via",
    "#   `BIKERLINK_HUMAN_BASELINE_UPDATE=1 bash scripts/check-large-files-ratchet.sh --update-baseline`.",
    "",
  ].join("\n");
  const legacyLines = legacySnapshot.map((e) => `LEGACY ${e.file} ${e.lines}`);
  const lockedLines = lockedSnapshot.map((e) => `LOCKED ${e.file} ${e.limit}`);
  const body = [...legacyLines, ...lockedLines].join("\n");
  writeFileSync(join(process.cwd(), BASELINE_PATH), header + body + "\n", "utf-8");
  console.log(
    `✅ Baseline aggiornata: ${legacySnapshot.length} legacy + ${lockedSnapshot.length} LOCKED.`,
  );
  process.exit(0);
}

if (errors.length === 0) {
  console.log(
    `✅ Ratchet OK — 0 regressioni. Legacy in baseline: ${baseline.legacy.size}, ` +
      `LOCKED tracciati: ${baseline.locked.size}, file oltre limite ora: ${legacySnapshot.length}.`,
  );
  if (shrinkHints.length > 0) {
    console.log(`\nℹ️  Shrink LOCKED rilevati:`);
    for (const h of shrinkHints) console.log(h);
  }
  process.exit(0);
}

console.error(`\n❌ Ratchet FAIL — ${errors.length} regressione/i:\n`);
for (const e of errors) {
  console.error(`  ${e.file}`);
  console.error(`    → ${e.reason}\n`);
}
console.error(
  `Limite default: ${MAX_LINES} righe. Vedi sezione "⛔ REGOLA FERREA — Limite 650 righe per file" in replit.md.\n`,
);
process.exit(1);
