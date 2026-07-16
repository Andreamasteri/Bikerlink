// Task #259 — Round-trip test per la memoria persistente di Horus.
//
// Verifica che appendHorusNote + loadHorusMemory formino un ciclo coerente:
// una nota salvata deve ricomparire nel contenuto caricato. Un refactor che
// rompa il path `inbox/` (directory errata, mkdir mancante, override env
// ignorato) produce un risultato silenzioso nelle suite che mockano il modulo;
// questo test usa il filesystem reale (cartella temporanea) per catturare
// esattamente quella regressione silenziosa.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

// ----------------------------------------------------------------
// Mocks per le dipendenze di sicurezza (matchesSensitive, redactPII)
// Non vogliamo dipendere da segreti reali o dalla logica di redazione
// nei test di round-trip del filesystem.
// ----------------------------------------------------------------
import { vi } from "vitest";

vi.mock("../ai/assistant/security-filter", () => ({
  matchesSensitive: vi.fn(() => false),
}));

vi.mock("../ai/moderation/redact", () => ({
  redactPII: vi.fn((text: string) => text),
}));

// ----------------------------------------------------------------
// Import del modulo sotto test — DOPO i mock
// ----------------------------------------------------------------
import { appendHorusNote, loadHorusMemory, getHorusMemoryPath } from "../ai/assistant/horus-memory";

// ----------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------

let tmpDir: string;
let tmpFile: string;
const ORIGINAL_ENV = process.env.HORUS_MEMORY_FILE;

async function setTempMemoryFile(): Promise<void> {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "horus-memory-test-"));
  tmpFile = path.join(tmpDir, "horus-memory.md");
  process.env.HORUS_MEMORY_FILE = tmpFile;
}

async function cleanupTempDir(): Promise<void> {
  // Ripristina l'env originale prima di rimuovere la dir
  if (ORIGINAL_ENV === undefined) {
    delete process.env.HORUS_MEMORY_FILE;
  } else {
    process.env.HORUS_MEMORY_FILE = ORIGINAL_ENV;
  }
  try {
    await fs.rm(tmpDir, { recursive: true, force: true });
  } catch {
    // Nessun errore se la pulizia fallisce — è un test
  }
}

// ----------------------------------------------------------------
// Suite principale
// ----------------------------------------------------------------

describe("horus-memory — round-trip appendHorusNote → loadHorusMemory", () => {
  beforeEach(async () => {
    await setTempMemoryFile();
  });

  afterEach(async () => {
    await cleanupTempDir();
  });

  // ---------------------------------------------------------------
  // (a) Scenario base: nota singola compare nel contenuto caricato.
  //     Questo è il test che cattura la regressione silenziosa
  //     descritta nel task: se il path è sbagliato, loadHorusMemory
  //     restituisce "" invece della nota.
  // ---------------------------------------------------------------

  it("(a) una nota salvata con appendHorusNote compare nella stringa restituita da loadHorusMemory", async () => {
    const NOTE = "L'utente preferisce percorsi panoramici evitando autostrade.";
    const NOW = "2026-07-16T10:00:00.000Z";

    await appendHorusNote(NOTE, NOW);
    const memory = await loadHorusMemory();

    expect(memory).toContain(NOTE);
    expect(memory).toContain(NOW);
  });

  // ---------------------------------------------------------------
  // (b) Il file viene creato anche quando la cartella inbox/ non
  //     esiste al momento del salvataggio (mkdir -p implicito).
  //     Simula la situazione di boot su filesystem effimero.
  // ---------------------------------------------------------------

  it("(b) appendHorusNote crea la cartella se non esiste (mkdir -p implicito)", async () => {
    // tmpFile punta a tmpDir/horus-memory.md — la dir esiste già.
    // Usiamo una sottodirectory che NON esiste ancora.
    const nestedDir = path.join(tmpDir, "inbox", "nested");
    const nestedFile = path.join(nestedDir, "horus-memory.md");
    process.env.HORUS_MEMORY_FILE = nestedFile;

    const NOTE = "Nota in cartella annidata inesistente.";
    await expect(appendHorusNote(NOTE, "2026-07-16T11:00:00.000Z")).resolves.not.toThrow();

    const memory = await loadHorusMemory();
    expect(memory).toContain(NOTE);
  });

  // ---------------------------------------------------------------
  // (c) loadHorusMemory restituisce stringa vuota quando il file
  //     non esiste — non deve lanciare. Comportamento invariante
  //     richiesto dal commento nel sorgente.
  // ---------------------------------------------------------------

  it("(c) loadHorusMemory restituisce stringa vuota se il file non esiste (nessun lancio)", async () => {
    // Il file NON è mai stato creato in questo test
    await expect(loadHorusMemory()).resolves.toBe("");
  });

  // ---------------------------------------------------------------
  // (d) Note multiple si accumulano: tutte le note compaiono dopo
  //     più chiamate ad appendHorusNote sulla stessa sessione.
  // ---------------------------------------------------------------

  it("(d) più note accumulate sono tutte presenti nella memoria caricata", async () => {
    const NOTES = [
      "Prima nota: preferisce il mattino presto.",
      "Seconda nota: evita le strade a traffico elevato.",
      "Terza nota: ha una BMW R1250GS.",
    ];

    for (let i = 0; i < NOTES.length; i++) {
      await appendHorusNote(NOTES[i], `2026-07-16T${10 + i}:00:00.000Z`);
    }

    const memory = await loadHorusMemory();
    for (const note of NOTES) {
      expect(memory).toContain(note);
    }
  });

  // ---------------------------------------------------------------
  // (e) appendHorusNote lancia per nota vuota — il path del file
  //     NON viene creato (nessun side-effect su errore atteso).
  // ---------------------------------------------------------------

  it("(e) appendHorusNote lancia per nota vuota e non crea il file", async () => {
    await expect(appendHorusNote("", "2026-07-16T12:00:00.000Z")).rejects.toThrow("nota vuota");

    // Il file non deve esistere
    await expect(fs.access(tmpFile)).rejects.toThrow();
  });

  // ---------------------------------------------------------------
  // (f) getHorusMemoryPath rispetta il valore di HORUS_MEMORY_FILE
  //     impostato via env. Verifica che l'override env sia integrato
  //     end-to-end (non solo per i test, ma anche per deployment con
  //     path custom).
  // ---------------------------------------------------------------

  it("(f) getHorusMemoryPath usa HORUS_MEMORY_FILE quando impostato", () => {
    expect(getHorusMemoryPath()).toBe(tmpFile);
  });

  // ---------------------------------------------------------------
  // (g) Header del file generato: la prima nota include l'intestazione
  //     "# Memoria persistente di Horus" — invariante del formato.
  // ---------------------------------------------------------------

  it("(g) il file generato inizia con l'header atteso", async () => {
    await appendHorusNote("Nota iniziale.", "2026-07-16T13:00:00.000Z");
    const raw = await fs.readFile(tmpFile, "utf8");

    expect(raw.startsWith("# Memoria persistente di Horus")).toBe(true);
  });
});
