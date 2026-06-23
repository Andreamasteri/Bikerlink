/**
 * Test di regressione — Phase 4 di boot-sequence registra THUNK, non promise eager.
 *
 * La firma del crash-loop osservato: costruire l'array delle seed con
 * `seedTagsAtStartup()` (chiamata eager) avvia TUTTE le seed in parallelo subito;
 * se una rejecta mentre il loop sta ancora awaitando una precedente, nessun
 * handler è attaccato → `unhandledRejection` → process.exit(1) → crash-loop.
 *
 * Il fix registra thunk (`["nome", seedTagsAtStartup]`, riferimento NON invocato)
 * e invoca `makeFn()` solo dentro il loop, sempre sotto try/catch + timeout.
 *
 * Importare boot-sequence.ts eseguirebbe troppi side-effect (connessione DB,
 * import a catena): questo è un guard STATICO sul sorgente, che fallisce se un
 * refactor reintroduce la chiamata eager nell'array delle seed di Phase 4.
 */
import { describe, it, expect, beforeAll } from "vitest";
import fs from "fs";
import path from "path";

const SEED_NAMES = [
  "seedAppleReviewerAccount",
  "seedGooglePlayReviewerAccount",
  "seedTranslationKeys",
  "seedTagsAtStartup",
];

let source = "";
let loopArrayBlock = "";

beforeAll(() => {
  source = fs.readFileSync(path.resolve(__dirname, "../boot-sequence.ts"), "utf8");
  // Estrae il blocco array del loop seed di Phase 4:
  //   for (const [name, makeFn] of [ ... ] as [string, () => Promise<unknown>][]) {
  const m = source.match(
    /for\s*\(const\s*\[name,\s*makeFn\]\s*of\s*\[([\s\S]*?)\]\s*as\s*\[string,\s*\(\)\s*=>\s*Promise<unknown>\]\[\]\)/
  );
  expect(m, "il loop seed di Phase 4 con la firma a thunk dev'essere presente").toBeTruthy();
  loopArrayBlock = m![1];
});

describe("Phase 4 — registrazione thunk (guard anti unhandledRejection)", () => {
  it("registra ogni seed come riferimento NON invocato (thunk), non come promise eager", () => {
    for (const name of SEED_NAMES) {
      // Deve comparire la coppia con il riferimento nudo: ["nome", nome]
      expect(loopArrayBlock).toContain(`"${name}", ${name}]`);
      // NON deve comparire la forma eager invocata: ["nome", nome()]
      expect(loopArrayBlock).not.toContain(`${name}()`);
    }
  });

  it("non contiene NESSUNA chiamata eager (parentesi di invocazione) dentro l'array delle seed", () => {
    // Nell'array dovrebbero esserci solo stringhe e riferimenti a funzione.
    // Una `(` indicherebbe un'invocazione eager → regressione.
    expect(loopArrayBlock).not.toMatch(/\w\(\s*\)/);
  });

  it("invoca makeFn() in modo differito dentro il corpo del loop, sotto withPhaseTimeout", () => {
    // L'unica invocazione delle seed deve avvenire quando il loop le raggiunge.
    expect(source).toContain("await withPhaseTimeout(name, makeFn(), 60_000)");
  });

  it("la firma del loop dichiara thunk (() => Promise<unknown>), non Promise<unknown> già risolvibili", () => {
    expect(source).toContain("as [string, () => Promise<unknown>][]");
  });
});
