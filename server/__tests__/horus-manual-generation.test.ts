/**
 * Task #152 — Smoke test della generazione del manuale BikerLink da parte di Horus.
 *
 * Copre gli invarianti chiave del piano (step 11):
 *   1. Il blocco lingua OBBLIGATORIO (con le 6 lingue target) è in testa a ogni
 *      prompt del manuale (funzionale + lessicale).
 *   2. buildManualLexiconPrompt() contiene le sezioni attese
 *      ("BOTTONI", "CAMPI DI INPUT", "MESSAGGI") e il "DIZIONARIO I18N".
 *   3. finalizeManualScan() salva sul TC via hubPost("/files/write", ...) per
 *      it.md, latest.md e ogni {lang}.md tradotto.
 *   4. Con isHubAvailable()=false il salvataggio TC è saltato (solo Replit).
 *   5. Il manuale assemblato include "Panoramica", "Dizionario dell'Interfaccia"
 *      e "Glossario".
 */
import { vi, describe, it, expect, beforeEach } from "vitest";

if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = "postgres://test:test@localhost:5432/test"; // pragma: allowlist secret
}

const {
  hubAvailable,
  mockHubPost,
  mockSaveManual,
  mockRetranslate,
  mockGetTranslations,
} = vi.hoisted(() => ({
  hubAvailable: { value: true },
  mockHubPost: vi.fn(async () => ({ ok: true, status: 200, data: {} })),
  mockSaveManual: vi.fn(async (_manual: string) => ({ backedUp: false })),
  mockRetranslate: vi.fn(async () => ({
    translatedLangs: ["en", "de", "es", "fr", "el", "tr"],
    skipped: false,
  })),
  mockGetTranslations: vi.fn(async () => ({
    en: { text: "English manual body", translatedAt: "now", sourceHash: "h" },
    de: { text: "Deutsches Handbuch", translatedAt: "now", sourceHash: "h" },
    es: { text: "Manual en español", translatedAt: "now", sourceHash: "h" },
    fr: { text: "Manuel en français", translatedAt: "now", sourceHash: "h" },
    el: { text: "Ελληνικό εγχειρίδιο", translatedAt: "now", sourceHash: "h" },
    tr: { text: "Türkçe kılavuz", translatedAt: "now", sourceHash: "h" },
  })),
}));

// Ollama: risponde con testo lungo abbastanza da superare il sanitizer minimo.
vi.mock("../lib/ollama-client", () => ({
  callOllamaChat: vi.fn(
    async () =>
      "Contenuto del manuale generato da Horus, sufficientemente lungo per superare il filtro di sanitizzazione minimo.",
  ),
}));

vi.mock("../ai/moderation/redact", () => ({ redactPII: (t: string) => t }));

vi.mock("../ai/nadir/manual", () => ({
  saveNadirManualWithBackup: mockSaveManual,
  getNadirManualTranslations: mockGetTranslations,
}));

vi.mock("../ai/nadir/translate", () => ({ retranslateManualNow: mockRetranslate }));

vi.mock("../lib/ai-hub-client", () => ({
  hubPost: mockHubPost,
  isHubAvailable: () => hubAvailable.value,
}));

vi.mock("../storage", () => ({
  storage: {
    getAppSetting: vi.fn(async () => ({ valueJson: { counts: { manual: 12 } } })),
  },
}));

// db + db-integrity/runner sono usati solo dal percorso ANALISI (non toccato qui):
// mock minimi per evitare connessioni reali all'import del modulo finalize.
vi.mock("../db", () => ({
  db: {},
  withDbRetry: <T,>(fn: () => Promise<T> | T) => Promise.resolve(fn()),
}));
vi.mock("../lib/bg-db-limiter", () => ({
  withBgDbSlot: <T,>(fn: () => Promise<T> | T) => Promise.resolve(fn()),
}));
vi.mock("../ai/db-integrity/runner", () => ({
  getLatestRunSummary: vi.fn(async () => null),
  listOpenViolations: vi.fn(async () => []),
}));

import {
  buildManualFunctionalPrompt,
  buildManualLexiconPrompt,
} from "../ai/assistant/horus-scanner";
import { MANUAL_LANGUAGE_STYLE_BLOCK } from "../ai/assistant/codebase-inventory";
import { finalizeManualScan } from "../ai/assistant/horus-scanner-finalize-manual";
import type { FileScanStore } from "../ai/assistant/codebase-inventory";

const SIX_TARGETS = ["English", "Deutsch", "Español", "Français", "Ελληνικά", "Turco"];

describe("Task #152 — blocco lingua nei prompt del manuale", () => {
  it("il blocco lingua elenca tutte e 6 le lingue target", () => {
    for (const name of SIX_TARGETS) {
      expect(MANUAL_LANGUAGE_STYLE_BLOCK).toContain(name);
    }
    expect(MANUAL_LANGUAGE_STYLE_BLOCK).toContain("SOLO in italiano");
  });

  it("buildManualFunctionalPrompt inizia col blocco lingua e dà il contesto BikerLink", () => {
    const p = buildManualFunctionalPrompt("app/(tabs)/index.tsx", "export default function X(){}");
    expect(p.startsWith(MANUAL_LANGUAGE_STYLE_BLOCK)).toBe(true);
    expect(p).toContain("CONTESTO BIKERLINK");
    expect(p).toContain("React Native");
  });

  it("buildManualLexiconPrompt contiene BOTTONI, CAMPI DI INPUT, MESSAGGI e il DIZIONARIO I18N", () => {
    const p = buildManualLexiconPrompt("app/club.tsx", "t('proposals.join')", "proposals.join=Partecipa");
    expect(p.startsWith(MANUAL_LANGUAGE_STYLE_BLOCK)).toBe(true);
    expect(p).toContain("BOTTONI");
    expect(p).toContain("CAMPI DI INPUT");
    expect(p).toContain("MESSAGGI");
    expect(p).toContain("DIZIONARIO I18N");
    // Il dizionario passato è iniettato nel prompt.
    expect(p).toContain("proposals.join=Partecipa");
    // Convenzione per le chiavi non risolte.
    expect(p).toContain("[chiave.non.trovata]");
  });
});

describe("Task #152 — finalizeManualScan salvataggio TC + assemblaggio", () => {
  const store: FileScanStore = {
    "app/(tabs)/mappa.tsx": {
      hash: "h1",
      note: "Schermata mappa live: mostra i rider visibili sulla mappa.",
      lexiconNote: '### Mappa\n**Titolo**: "Mappa"\n**Bottoni**: "Filtri" → apre i filtri.',
      at: "2026-07-15T00:00:00.000Z",
    },
    "server/ai/nadir/reindex.ts": {
      hash: "h2",
      note: "Reindicizza i contenuti di Nadir generando gli embeddings.",
      at: "2026-07-15T00:00:00.000Z",
    },
  };

  beforeEach(() => {
    hubAvailable.value = true;
    mockHubPost.mockClear();
    mockSaveManual.mockClear();
    mockRetranslate.mockClear();
    mockGetTranslations.mockClear();
  });

  it("salva it.md, latest.md e ogni {lang}.md tradotto sul TC via /files/write", async () => {
    await finalizeManualScan(store);

    const paths = mockHubPost.mock.calls.map((c) => (c[1] as { path: string }).path);
    for (const c of mockHubPost.mock.calls) {
      expect(c[0]).toBe("/files/write");
    }
    expect(paths).toContain("nadir/manuale/it.md");
    expect(paths).toContain("nadir/manuale/latest.md");
    for (const lang of ["en", "de", "es", "fr", "el", "tr"]) {
      expect(paths).toContain(`nadir/manuale/${lang}.md`);
    }
  });

  it("il manuale italiano assemblato include Panoramica, Dizionario dell'Interfaccia e Glossario", async () => {
    await finalizeManualScan(store);

    expect(mockSaveManual).toHaveBeenCalledTimes(1);
    const savedManual = mockSaveManual.mock.calls[0][0] as string;
    expect(savedManual).toContain("## Panoramica");
    expect(savedManual).toContain("## Dizionario dell'Interfaccia — Schermata per Schermata");
    expect(savedManual).toContain("## Glossario");
  });

  it("con ai-hub offline salta il salvataggio TC ma salva comunque su Replit", async () => {
    hubAvailable.value = false;

    await finalizeManualScan(store);

    expect(mockHubPost).not.toHaveBeenCalled();
    expect(mockSaveManual).toHaveBeenCalledTimes(1);
    expect(mockRetranslate).toHaveBeenCalledTimes(1);
  });
});
