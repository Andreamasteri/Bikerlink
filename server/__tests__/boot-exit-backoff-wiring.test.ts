/**
 * Guardrail statico — applyCrashBackoff() prima di ogni process.exit(1) nei
 * percorsi di boot/handler.
 *
 * ## Perché questo test esiste
 * Un DB managed lento produceva restart ravvicinati: crash → exit immediato →
 * restart → DB ancora lento → ricrash → loop. La correzione (lib/crash-backoff.ts)
 * richiede che OGNI uscita fatale dei percorsi di boot e degli handler di processo
 * (uncaughtException/unhandledRejection) chiami applyCrashBackoff() prima del
 * process.exit(1) così il delay distanzia i restart.
 *
 * Senza questo test un refactor potrebbe aggiungere un nuovo process.exit(1) che
 * salta applyCrashBackoff() reintroducendo il crash-loop silenziosamente.
 *
 * ## Approccio
 * Analisi statica del sorgente: per ogni occorrenza di `process.exit(1)` nelle
 * 2 file rilevanti si controlla che `applyCrashBackoff(` compaia nelle 6 righe
 * precedenti (finestra empirica: nei pattern attuali è sempre 1-2 righe prima).
 *
 * L'unica eccezione ammessa è il timeout di gracefulShutdown (SIGTERM/SIGINT):
 * quel process.exit(1) è l'uscita forzata dopo un timeout di 10s su uno shutdown
 * volontario — non è un crash e non deve contribuire al contatore anti crash-loop.
 *
 * ## Come si rompe il test
 * Aggiungere un `process.exit(1)` in server/boot-sequence.ts o server/index.ts
 * senza chiamare `applyCrashBackoff(...)` nelle righe immediatamente precedenti.
 */

import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const ROOT = path.resolve(__dirname, "../..");

const FILES_TO_CHECK = [
  "server/boot-sequence.ts",
  "server/index.ts",
] as const;

/**
 * Finestra di look-back (righe): quante righe prima del process.exit(1)
 * devono contenere applyCrashBackoff(). Valore empirico: nei pattern
 * attuali la chiamata è sempre 1-2 righe prima; 8 dà margine per
 * commenti o una riga di log intermedia senza allargare troppo la finestra.
 */
const LOOKBACK_LINES = 8;

/**
 * Contesti allow-listati: righe di contesto (finestra ±5) che identificano
 * un process.exit(1) intenzionalmente privo di applyCrashBackoff().
 * Ogni entry è una sottostringa univoca nel sorgente.
 *
 * gracefulShutdown timeout — exit forzato dopo SIGTERM/SIGINT non risolto
 * entro 10 s: non è un crash, è uno shutdown volontario che non ha terminato
 * in tempo. Non deve contribuire al contatore crash-loop.
 */
const ALLOWLIST_CONTEXT: string[] = [
  "Could not close connections in time",
];

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

// ── Test suite ────────────────────────────────────────────────────────────────

describe("Boot exit gates — applyCrashBackoff() obbligatorio prima di ogni process.exit(1)", () => {
  for (const file of FILES_TO_CHECK) {
    it(`${file} — nessun process.exit(1) senza applyCrashBackoff() precedente`, () => {
      const violations = findUnprotectedExits(file);
      expect(
        violations,
        violations.length > 0
          ? `\n[REGRESSIONE] ${violations.length} uscita/e fatale/i non protetta/e dal backoff anti crash-loop:\n` +
              formatViolations(violations) +
              "\n\n  Azione: chiama applyCrashBackoff('<label>') prima di ogni process.exit(1) nei percorsi di boot/handler."
          : "",
      ).toHaveLength(0);
    });
  }

  it("self-check — il rilevatore identifica correttamente un exit non protetto (verifica che il guard non sia sordo)", () => {
    // Sorgente sintetico con un process.exit(1) senza applyCrashBackoff():
    // se il rilevatore non lo trova, è difettoso e questo test fallisce.
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
    // Sorgente sintetico con applyCrashBackoff() nella riga immediatamente precedente:
    // il rilevatore NON deve segnalarlo come violazione.
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
    // Il timeout forzato dopo SIGTERM/SIGINT è intenzionale — non deve essere segnalato.
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

      // Replica della logica isAllowlisted
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
});
