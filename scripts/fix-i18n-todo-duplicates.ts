#!/usr/bin/env tsx
/**
 * Rimuove chiavi duplicate __TODO__ dai file i18n.
 *
 * Pattern problematico (es. da task #3485):
 *   un task aggiunge stub "__TODO__:key" in coda a un file locale che
 *   contiene già la stessa chiave con traduzione reale → TS1117 duplicate.
 *
 * Logica:
 *  1. Legge ogni lib/i18n/*.ts
 *  2. Estrae tutte le chiavi presenti nel file
 *  3. Rimuove le righe dove il valore è "__TODO__:key" E la chiave
 *     appare già altrove nel file (con un valore diverso da __TODO__)
 *  4. Aggiorna .large-files-baseline per i file modificati
 *
 * Chiamato da scripts/post-merge.sh prima del gate ratchet.
 */

import * as fs from "fs";
import * as path from "path";

const I18N_DIR = path.join(process.cwd(), "lib/i18n");
const BASELINE_FILE = path.join(process.cwd(), ".large-files-baseline");

const TODO_LINE_RE = /^\s*"([^"]+)":\s*"__TODO__:[^"]*",?\s*$/;
const ANY_KEY_RE = /"([^"]+)":\s*"([^"]*)"/g;

function processFile(filePath: string): boolean {
  const content = fs.readFileSync(filePath, "utf8");
  const lines = content.split("\n");

  // Raccoglie tutte le chiavi con valore NON __TODO__
  const realKeys = new Set<string>();
  for (const line of lines) {
    let m: RegExpExecArray | null;
    ANY_KEY_RE.lastIndex = 0;
    while ((m = ANY_KEY_RE.exec(line)) !== null) {
      const key = m[1];
      const val = m[2];
      if (!val.startsWith("__TODO__:")) {
        realKeys.add(key);
      }
    }
  }

  // Filtra righe: rimuovi quelle con __TODO__ per chiavi già tradotte
  const filtered: string[] = [];
  let removed = 0;
  for (const line of lines) {
    const todoMatch = line.match(TODO_LINE_RE);
    if (todoMatch) {
      const key = todoMatch[1];
      if (realKeys.has(key)) {
        removed++;
        continue; // salta — è un duplicato
      }
    }
    filtered.push(line);
  }

  if (removed === 0) return false;

  // Rimuovi eventuali righe vuote consecutive create dalla rimozione
  const cleaned: string[] = [];
  let prevBlank = false;
  for (const line of filtered) {
    const isBlank = line.trim() === "";
    if (isBlank && prevBlank) continue;
    cleaned.push(line);
    prevBlank = isBlank;
  }

  fs.writeFileSync(filePath, cleaned.join("\n"), "utf8");
  console.log(
    `  ✅ ${path.relative(process.cwd(), filePath)}: rimoss${removed === 1 ? "a 1 riga" : `e ${removed} righe`} __TODO__ duplicate`
  );
  return true;
}

function updateBaseline(filePath: string): void {
  if (!fs.existsSync(BASELINE_FILE)) return;
  const rel = path.relative(process.cwd(), filePath).replace(/\\/g, "/");
  const lineCount = fs.readFileSync(filePath, "utf8").split("\n").length;
  const baseline = fs.readFileSync(BASELINE_FILE, "utf8");
  const pattern = new RegExp(`(LEGACY\\s+${rel.replace(".", "\\.")}\\s+)\\d+`);
  if (pattern.test(baseline)) {
    const updated = baseline.replace(pattern, `$1${lineCount}`);
    fs.writeFileSync(BASELINE_FILE, updated, "utf8");
    console.log(`  📏 baseline aggiornata: ${rel} → ${lineCount}`);
  }
}

function main() {
  if (!fs.existsSync(I18N_DIR)) {
    console.log("lib/i18n/ non trovato — skip.");
    process.exit(0);
  }

  const files = fs
    .readdirSync(I18N_DIR)
    .filter((f) => f.endsWith(".ts"))
    .map((f) => path.join(I18N_DIR, f));

  console.log(`\n════════════════════════════════════════`);
  console.log(`  Fix i18n __TODO__ duplicati`);
  console.log(`════════════════════════════════════════`);

  let anyFixed = false;
  for (const f of files) {
    const fixed = processFile(f);
    if (fixed) {
      updateBaseline(f);
      anyFixed = true;
    }
  }

  if (!anyFixed) {
    console.log("  ✅ Nessun duplicato __TODO__ trovato — file i18n puliti.");
  }

  console.log(`════════════════════════════════════════\n`);
}

main();
