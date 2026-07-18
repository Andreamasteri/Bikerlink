import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { isRecoverableAiError } from "../ai/assistant/error-classification";

// Task #44 (parità BikerBlog D4) — flag `recoverable` sull'evento SSE `error`,
// così la UI puo' offrire "Riprova" solo sui fallimenti transitori.

describe("Task #44 — isRecoverableAiError", () => {
  it("marca come PERMANENTI (non recoverable) gli errori di persona non configurata", () => {
    expect(isRecoverableAiError("Ares non configurato (ARES_OLLAMA_URL mancante).")).toBe(false);
    // Quebracho removed (Task #591 — unified into Horus); test Ares instead
    expect(isRecoverableAiError("Ares non configurato (nessun URL Ollama disponibile).")).toBe(false);
  });

  it("marca come TRANSITORI (recoverable) qualsiasi altro errore imprevisto", () => {
    expect(isRecoverableAiError("fetch failed")).toBe(true);
    expect(isRecoverableAiError("terminated")).toBe(true);
    expect(isRecoverableAiError("Errore imprevisto")).toBe(true);
    expect(isRecoverableAiError(undefined)).toBe(true);
    expect(isRecoverableAiError(null)).toBe(true);
  });
});

describe("Task #44 — la route AI in streaming emette `recoverable` sull'evento error", () => {
  it("server/routes/ai-assistant.ts: il catch calcola e invia il flag recoverable", () => {
    const src = readFileSync(resolve(process.cwd(), "server/routes/ai-assistant.ts"), "utf8");
    expect(src).toMatch(/isRecoverableAiError/);
    expect(src).toMatch(/send\(\s*"error"\s*,\s*\{\s*code:\s*500,\s*message,\s*recoverable\s*\}\s*\)/);
  });
});
