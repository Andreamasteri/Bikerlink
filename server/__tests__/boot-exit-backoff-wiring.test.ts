/**
 * Guardrail statico — applyCrashBackoff() prima di ogni process.exit(1) nei
 * percorsi di boot/handler dell'intera directory server/.
 *
 * ## Perché questo test esiste
 * Un DB managed lento produceva restart ravvicinati: crash → exit immediato →
 * restart → DB ancora lento → ricrash → loop. La correzione (lib/crash-backoff.ts)
 * richiede che OGNI uscita fatale dei percorsi di boot e degli handler di processo
 * (uncaughtException/unhandledRejection) chiami applyCrashBackoff() prima del
 * process.exit(1) così il delay distanzia i restart.
 *
 * Senza questo test un refactor potrebbe aggiungere un nuovo process.exit(1) in
 * un qualsiasi file server/ che salta applyCrashBackoff() reintroducendo il
 * crash-loop silenziosamente.
 *
 * ## Approccio
 * Analisi statica del sorgente: per ogni occorrenza di `process.exit(1)` nei
 * file TypeScript sotto server/ (escluse le directory e i file allow-listati) si
 * controlla che `applyCrashBackoff(` compaia nelle 8 righe precedenti (finestra
 * empirica: nei pattern attuali è sempre 1-2 righe prima).
 *
 * ## Directory / file esclusi dalla scansione
 *
 * `server/__tests__/`
 *   File di test: i process.exit(1) sintetici qui sono intenzionali e usati
 *   come fixture di self-check; non vengono mai eseguiti dal daemon del server.
 *
 * `server/scripts/`
 *   Strumenti CLI standalone (check-api-responses, check-match-health,
 *   check-schema-migration-drift, dedup-biker-matches, remap-tags-fuzzy, …).
 *   Usano exit codes (0/1/2) per comunicare il risultato al chiamante (shell,
 *   CI). Non fanno parte del processo server in esecuzione continua e non
 *   possono innescare crash-loop.
 *
 * `server/seed.ts`, `server/seed-fake-users.ts`, `server/seed-tags-runtime.ts`
 *   Script di seeding eseguiti una tantum in modo standalone tramite tsx/node.
 *   Non vengono mai importati da boot-sequence o index; i loro process.exit(1)
 *   terminano il processo di seeding, non il daemon del server.
 *
 * ## Eccezioni all'interno dei file inclusi (ALLOWLIST_CONTEXT)
 *
 * `"Could not close connections in time"`
 *   Il timeout forzato di gracefulShutdown (SIGTERM/SIGINT non risolto entro
 *   10 s): non è un crash ma uno shutdown volontario che non ha terminato in
 *   tempo. Non deve contribuire al contatore crash-loop.
 *
 * ## Come si rompe il test
 * Aggiungere un `process.exit(1)` in un qualsiasi file server/ non escluso
 * senza chiamare `applyCrashBackoff(...)` nelle righe immediatamente precedenti.
 *
 * ## Come aggiungere un'eccezione consapevole
 * 1. Se il file è uno script/tool standalone → aggiungerlo a EXCLUDED_FILES o
 *    spostarlo in server/scripts/.
 * 2. Se l'exit è intenzionale senza backoff (es. un altro shutdown graceful) →
 *    aggiungere una stringa univoca del contesto a ALLOWLIST_CONTEXT con un
 *    commento che spiega perché.
 */

import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const ROOT = path.resolve(__dirname, "../..");
const SERVER_DIR = path.join(ROOT, "server");

// ── Esclusioni ────────────────────────────────────────────────────────────────

/**
 * Directory (relative a server/) escluse dalla scansione.
 * Aggiungere qui nuovi tool/script standalone; non rimuovere le esistenti
 * senza documentare il motivo nel commento di intestazione.
 */
const EXCLUDED_DIRS: string[] = [
  "__tests__", // file di test: process.exit sintetici usati come fixture
  "scripts", // CLI tool standalone: usano exit codes per comunicare con la shell
];

/**
 * File individuali (percorsi relativi a server/, slash forward) esclusi dalla
 * scansione. Il matching è sull'intero path relativo — non sul solo basename —
 * per evitare di escludere accidentalmente file con lo stesso nome in
 * sottodirectory diverse.
 *
 * Sono script standalone eseguiti una tantum che non fanno parte del daemon.
 */
const EXCLUDED_FILES: string[] = [
  "seed.ts", // seeding one-shot, non importato da boot-sequence/index
  "seed-fake-users.ts", // idem
  "seed-tags-runtime.ts", // idem
];

// ── Allow-list di contesto ────────────────────────────────────────────────────

/**
 * Contesti allow-listati: sottostringa univoca nella finestra ±5 righe attorno
 * al process.exit(1) che identifica un'uscita intenzionalmente priva di
 * applyCrashBackoff(). Ogni entry DEVE avere un commento che spiega perché.
 *
 * NB: aggiungere qui solo casi eccezionali documentati. Non usare questa lista
 * per aggirare il guard su nuovi crash path non protetti.
 */
const ALLOWLIST_CONTEXT: string[] = [
  // gracefulShutdown timeout — exit forzato dopo SIGTERM/SIGINT non risolto
  // entro 10 s: non è un crash, è uno shutdown volontario che non ha terminato
  // in tempo. Non deve contribuire al contatore crash-loop.
  "Could not close connections in time",
];

// ── Parametri di analisi ─────────────────────────────────────────────────────

/**
 * Finestra di look-back (righe): quante righe prima del process.exit(1)
 * devono contenere applyCrashBackoff(). Valore empirico: nei pattern
 * attuali la chiamata è sempre 1-2 righe prima; 8 dà margine per
 * commenti o una riga di log intermedia senza allargare troppo la finestra.
 */
const LOOKBACK_LINES = 8;

// ── Utilities ─────────────────────────────────────────────────────────────────

function isAllowlisted(lines: string[], exitLineIdx: number): boolean {
  const windowStart = Math.max(0, exitLineIdx - 5);
  const windowEnd = Math.min(lines.length - 1, exitLineIdx + 2);
  const window = lines.slice(windowStart, windowEnd + 1).join("\n");
  return ALLOWLIST_CONTEXT.some((ctx) => window.includes(ctx));
}

interface Violation {
  file: string;
  lineNumber: number;
  lineContent: string;
}

function findUnprotectedExits(filePath: string): Violation[] {
  const abs = path.join(ROOT, filePath);
  const source = fs.readFileSync(abs, "utf8");
  const lines = source.split("\n");
  const violations: Violation[] = [];

  for (let i = 0; i < lines.length; i++) {
    // Considera solo process.exit(1) — process.exit(0) è uscita pulita/volontaria.
    if (!lines[i].includes("process.exit(1)")) continue;

    // Righe commentate: skip.
    const trimmed = lines[i].trimStart();
    if (trimmed.startsWith("//") || trimmed.startsWith("*")) continue;

    if (isAllowlisted(lines, i)) continue;

    const lookbackStart = Math.max(0, i - LOOKBACK_LINES);
    const precedingBlock = lines.slice(lookbackStart, i).join("\n");

    if (!precedingBlock.includes("applyCrashBackoff(")) {
      violations.push({
        file: filePath,
        lineNumber: i + 1,
        lineContent: lines[i].trim(),
      });
    }
  }

  return violations;
}

function formatViolations(violations: Violation[]): string {
  return violations
    .map(
      (v) =>
        `  ${v.file}:${v.lineNumber} — ${v.lineContent}\n` +
        `    ↳ manca applyCrashBackoff() nelle ${LOOKBACK_LINES} righe precedenti`,
    )
    .join("\n");
}

/**
 * Raccoglie tutti i file .ts sotto server/ escludendo le directory e i file
 * presenti nelle rispettive liste di esclusione.
 */
function collectServerFiles(): string[] {
  const results: string[] = [];

  function walk(dir: string, relDir: string): void {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const relPath = relDir ? `${relDir}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        if (EXCLUDED_DIRS.includes(entry.name)) continue;
        walk(path.join(dir, entry.name), relPath);
      } else if (entry.isFile() && entry.name.endsWith(".ts")) {
        // Match on full relative path (not basename) to avoid accidentally
        // excluding files with the same name in subdirectories.
        if (EXCLUDED_FILES.includes(relPath)) continue;
        results.push(`server/${relPath}`);
      }
    }
  }

  walk(SERVER_DIR, "");
  return results.sort();
}

// ── Test suite ────────────────────────────────────────────────────────────────

describe("Boot exit gates — applyCrashBackoff() obbligatorio prima di ogni process.exit(1)", () => {
  const serverFiles = collectServerFiles();

  it("la scansione copre almeno i file critici di boot (sanity check dell'elenco)", () => {
    expect(serverFiles).toContain("server/boot-sequence.ts");
    expect(serverFiles).toContain("server/index.ts");
    expect(serverFiles).toContain("server/boot-phase3-db-init.ts");
    expect(serverFiles).toContain("server/boot-phase5-schedulers.ts");
  });

  it("i file standalone esclusi NON compaiono nella scansione", () => {
    expect(serverFiles).not.toContain("server/seed.ts");
    expect(serverFiles).not.toContain("server/seed-fake-users.ts");
    expect(serverFiles.some((f) => f.startsWith("server/__tests__/"))).toBe(
      false,
    );
    expect(serverFiles.some((f) => f.startsWith("server/scripts/"))).toBe(
      false,
    );
  });

  it("nessun file server/ non-escluso contiene process.exit(1) senza applyCrashBackoff() precedente", () => {
    const allViolations: Violation[] = [];
    for (const file of serverFiles) {
      allViolations.push(...findUnprotectedExits(file));
    }

    expect(
      allViolations,
      allViolations.length > 0
        ? `\n[REGRESSIONE] ${allViolations.length} uscita/e fatale/i non protetta/e dal backoff anti crash-loop:\n` +
            formatViolations(allViolations) +
            "\n\n  Azioni possibili:" +
            "\n  1. Se è un crash path nel daemon → chiama applyCrashBackoff('<label>') prima di process.exit(1)." +
            "\n  2. Se è uno script/tool standalone → aggiungilo a EXCLUDED_FILES o spostalo in server/scripts/." +
            "\n  3. Se è uno shutdown graceful intenzionale → aggiungi una stringa univoca del contesto a ALLOWLIST_CONTEXT con un commento."
        : "",
    ).toHaveLength(0);
  });

  // ── Self-check del rilevatore ──────────────────────────────────────────────

  it("self-check — il rilevatore identifica correttamente un exit non protetto (verifica che il guard non sia sordo)", () => {
    const fakeSource = [
      "// Uscita fatale non protetta — deve essere rilevata",
      "console.error('[FATAL] qualcosa è andato storto');",
      "process.exit(1);",
    ].join("\n");

    const fakeLines = fakeSource.split("\n");
    let detectedAsUnprotected = false;

    for (let i = 0; i < fakeLines.length; i++) {
      if (!fakeLines[i].includes("process.exit(1)")) continue;
      const trimmed = fakeLines[i].trimStart();
      if (trimmed.startsWith("//") || trimmed.startsWith("*")) continue;

      const lookbackStart = Math.max(0, i - LOOKBACK_LINES);
      const block = fakeLines.slice(lookbackStart, i).join("\n");
      if (!block.includes("applyCrashBackoff(")) {
        detectedAsUnprotected = true;
      }
    }

    expect(detectedAsUnprotected).toBe(true);
  });

  it("self-check — il rilevatore NON segnala un exit correttamente protetto (nessun falso positivo)", () => {
    const fakeSource = [
      "applyCrashBackoff('test-label');",
      "process.exit(1);",
    ].join("\n");

    const fakeLines = fakeSource.split("\n");
    let detectedAsUnprotected = false;

    for (let i = 0; i < fakeLines.length; i++) {
      if (!fakeLines[i].includes("process.exit(1)")) continue;
      const trimmed = fakeLines[i].trimStart();
      if (trimmed.startsWith("//") || trimmed.startsWith("*")) continue;

      const lookbackStart = Math.max(0, i - LOOKBACK_LINES);
      const block = fakeLines.slice(lookbackStart, i).join("\n");
      if (!block.includes("applyCrashBackoff(")) {
        detectedAsUnprotected = true;
      }
    }

    expect(detectedAsUnprotected).toBe(false);
  });

  it("self-check — l'allow-list esclude correttamente il timeout di gracefulShutdown", () => {
    const fakeSource = [
      "setTimeout(() => {",
      "  console.error('Could not close connections in time, forcefully shutting down');",
      "  process.exit(1);",
      "}, 10000);",
    ].join("\n");

    const fakeLines = fakeSource.split("\n");
    let detectedAsUnprotected = false;

    for (let i = 0; i < fakeLines.length; i++) {
      if (!fakeLines[i].includes("process.exit(1)")) continue;
      const trimmed = fakeLines[i].trimStart();
      if (trimmed.startsWith("//") || trimmed.startsWith("*")) continue;

      const windowStart = Math.max(0, i - 5);
      const windowEnd = Math.min(fakeLines.length - 1, i + 2);
      const window = fakeLines.slice(windowStart, windowEnd + 1).join("\n");
      const isAllowed = ALLOWLIST_CONTEXT.some((ctx) => window.includes(ctx));
      if (isAllowed) continue;

      const lookbackStart = Math.max(0, i - LOOKBACK_LINES);
      const block = fakeLines.slice(lookbackStart, i).join("\n");
      if (!block.includes("applyCrashBackoff(")) {
        detectedAsUnprotected = true;
      }
    }

    expect(detectedAsUnprotected).toBe(false);
  });

  it("self-check — collectServerFiles() trova almeno 10 file (sanity check del walker)", () => {
    expect(serverFiles.length).toBeGreaterThanOrEqual(10);
  });
});
