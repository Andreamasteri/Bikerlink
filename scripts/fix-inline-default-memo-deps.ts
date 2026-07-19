#!/usr/bin/env tsx
/**
 * fix-inline-default-memo-deps.ts
 *
 * Riscrive automaticamente il pattern pericoloso:
 *   useMemo(() => x ?? [],  [x ?? []])   →  useMemo(() => x ?? [],  [x])
 *   useMemo(() => x ?? {},  [x ?? {}])   →  useMemo(() => x ?? {},  [x])
 *   useCallback(() => ...,  [a ?? []])   →  useCallback(() => ...,  [a])
 *
 * Un [] o {} letterale nei deps di useMemo/useCallback crea un nuovo oggetto
 * ad ogni render → il memo ricalcola ad ogni render → se il risultato finisce
 * in uno stato o hook si innesca "Maximum update depth exceeded".
 *
 * Uso:
 *   npx tsx scripts/fix-inline-default-memo-deps.ts           # dry-run (default)
 *   npx tsx scripts/fix-inline-default-memo-deps.ts --apply   # scrive le modifiche
 *   npx tsx scripts/fix-inline-default-memo-deps.ts --verbose # mostra anche i file senza fix
 *
 * Inferenza automatica del dep nudo (senza ??):
 *   useMemo(() => x ?? [], [[]])         →  useMemo(() => x ?? [], [x])
 *   useMemo(() => data.filter(...), [[]]) →  useMemo(() => data.filter(...), [data])
 *
 *   Quando il letterale nudo [] o {} è l'UNICO elemento dei deps, proviamo a
 *   dedurre il dep corretto dal corpo della callback:
 *     1. se il corpo contiene `EXPR ?? []` (o `?? {}`) → il dep è EXPR;
 *     2. altrimenti, se nel corpo c'è UN solo identificatore libero → quello.
 *   Se l'inferenza è univoca applichiamo il fix e lo logghiamo come "auto".
 *
 * Pattern NON gestiti automaticamente (richiede fix manuale):
 *   useMemo(() => ..., [[], otherDep])   ← [] nudo NON unico — impossibile
 *                                            scegliere il dep corretto.
 *   useMemo(() => a + b, [[]])           ← più candidati nel corpo — ambiguo.
 *
 * NOTA: la logica pura (regex + inferenza) vive in lib/inline-memo-deps-infer.ts
 * e il core di scansione in lib/inline-memo-deps-process.ts, per rispettare il
 * limite 800 righe per file.
 */

import * as fs from "fs";
import * as path from "path";
import { FileResult } from "./lib/inline-memo-deps-infer";
import { processFile } from "./lib/inline-memo-deps-process";

const APPLY = process.argv.includes("--apply");
const VERBOSE = process.argv.includes("--verbose");

const IGNORE_DIRS = new Set([
  ".local",
  ".agents",
  "node_modules",
  "scripts",
  "__tests__",
]);

// ─── Baseline updater ──────────────────────────────────────────────────────

const BASELINE_FILE = path.join(process.cwd(), ".large-files-baseline");

function updateBaseline(filePath: string): void {
  if (!fs.existsSync(BASELINE_FILE)) return;
  const rel = path.relative(process.cwd(), filePath).replace(/\\/g, "/");
  const lineCount = fs.readFileSync(filePath, "utf8").split("\n").length;
  const baseline = fs.readFileSync(BASELINE_FILE, "utf8");
  const pattern = new RegExp(`(LEGACY\\s+${rel.replace(/\./g, "\\.")}\\s+)\\d+`);
  if (pattern.test(baseline)) {
    const updated = baseline.replace(pattern, `$1${lineCount}`);
    fs.writeFileSync(BASELINE_FILE, updated, "utf8");
    console.log(`  📏 baseline aggiornata: ${rel} → ${lineCount}`);
  }
}

// ─── File walker ───────────────────────────────────────────────────────────

function walkFiles(dir: string): string[] {
  const results: string[] = [];
  const entries = fs.readdirSync(dir);

  for (const name of entries) {
    if (name.startsWith(".")) continue;
    if (IGNORE_DIRS.has(name)) continue;

    const full = path.join(dir, name);
    // Use stat (follows symlinks) rather than lstat so symlinked files/dirs are included
    let stat: fs.Stats;
    try {
      stat = fs.statSync(full);
    } catch {
      continue;
    }

    if (stat.isDirectory()) {
      results.push(...walkFiles(full));
    } else if (stat.isFile()) {
      if (
        (name.endsWith(".ts") || name.endsWith(".tsx")) &&
        !name.endsWith(".test.ts") &&
        !name.endsWith(".test.tsx") &&
        !name.endsWith(".spec.ts") &&
        !name.endsWith(".spec.tsx") &&
        !name.endsWith(".styles.ts") &&
        !name.endsWith(".styles.tsx")
      ) {
        results.push(full);
      }
    }
  }

  return results.sort();
}

// ─── Main ──────────────────────────────────────────────────────────────────

function main() {
  const cwd = process.cwd();
  const files = walkFiles(cwd);

  console.log("\n════════════════════════════════════════════════════════");
  console.log("  Fix inline [] / {} nei deps di useMemo / useCallback");
  console.log(
    `  Modalità: ${APPLY ? "✏️  APPLY (scrive le modifiche)" : "🔍 DRY-RUN (nessuna scrittura)"}`
  );
  console.log("════════════════════════════════════════════════════════\n");

  const allResults: FileResult[] = [];
  let totalAuto = 0;
  let totalManual = 0;

  for (const file of files) {
    const fixes = processFile(file, APPLY);
    if (fixes.length > 0) {
      const rel = path.relative(cwd, file);
      allResults.push({ filePath: rel, fixes });
      const autoCount = fixes.filter((f) => f.kind === "auto").length;
      totalAuto += autoCount;
      totalManual += fixes.filter((f) => f.kind === "manual").length;
      if (APPLY && autoCount > 0) {
        updateBaseline(file);
      }
    } else if (VERBOSE) {
      console.log(`  ✅ ${path.relative(cwd, file)} — nessuna violazione`);
    }
  }

  if (allResults.length === 0) {
    console.log(
      "  ✅ Nessuna violazione trovata — tutti i deps sono già corretti.\n"
    );
    console.log("════════════════════════════════════════════════════════\n");
    return;
  }

  for (const { filePath, fixes } of allResults) {
    console.log(`📄 ${filePath}`);
    for (const fix of fixes) {
      if (fix.kind === "auto") {
        console.log(`   riga ${fix.line}:`);
        if (fix.note) console.log(`     🧠 ${fix.note}`);
        console.log(`     PRIMA:  ${fix.original.trim()}`);
        console.log(
          `     DOPO:   ${fix.fixed.trim()}${APPLY ? " ✅ scritto" : " (dry-run)"}`
        );
      } else {
        console.log(`   riga ${fix.line}: ⚠️  FIX MANUALE RICHIESTO`);
        console.log(`     ${fix.note}`);
        console.log(`     ${fix.original.trim()}`);
      }
    }
    console.log();
  }

  console.log("────────────────────────────────────────────────────────");
  if (totalAuto > 0) {
    console.log(
      `  🔧 ${totalAuto} fix automatici ${APPLY ? "applicati" : "disponibili (usa --apply per scrivere)"}`
    );
  }
  if (totalManual > 0) {
    console.log(
      `  ⚠️  ${totalManual} pattern richiedono fix manuale ([] nudo senza ??)`
    );
  }
  if (!APPLY && totalAuto > 0) {
    console.log(
      "\n  Per applicare le correzioni automatiche:"
    );
    console.log(
      "    npx tsx scripts/fix-inline-default-memo-deps.ts --apply"
    );
  }
  console.log("════════════════════════════════════════════════════════\n");

  // Exit 1 se rimangono violazioni manuali dopo il run, o in dry-run con auto-fix disponibili
  if (totalManual > 0 || (!APPLY && totalAuto > 0)) {
    process.exit(1);
  }
}

main();
