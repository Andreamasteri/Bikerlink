// Task #50 — Test del lock a ciclo singolo e del gating "agente non configurato"
// di reviewTaskPlan. I client degli agenti sono mockati per rendere il test
// deterministico e offline (nessuna chiamata reale a Ollama/Ares).
// (Task #591: Quebracho unified into Horus — test updated to use horus agent.)
import { describe, it, expect, vi } from "vitest";

// Ares: NON configurato (per testare il preflight di gating).
vi.mock("../lib/ares-client", () => ({
  isAresConfigured: false,
  getAresModelId: () => "devstral-test",
  streamAresChat: vi.fn(async () => ({ text: "" })),
}));

// Ollama: configurato, con uno stream volutamente lento (per testare il lock con Horus).
vi.mock("../lib/ollama-client", () => ({
  isOllamaConfigured: true,
  isOllamaReachable: vi.fn(async () => true),
  callOllamaChat: vi.fn(async () => {
    await new Promise((r) => setTimeout(r, 40));
    return "1. Scope: OK\n2. Rischi: nessuno\n6. Giudizio finale: PRONTO";
  }),
}));

vi.mock("../lib/vram-arbiter", () => ({
  withAresVramPriority: async (_model: string, fn: () => Promise<unknown>) => fn(),
}));

import { reviewTaskPlan, REVIEW_BUSY_MESSAGE, isReviewRunning } from "../ai/assistant/task-review";

describe("Task #50 — reviewTaskPlan lock a ciclo singolo", () => {
  it("una seconda revisione concorrente riceve il messaggio 'già in corso'", async () => {
    const p1 = reviewTaskPlan({ content: "Piano di test valido con contenuto sufficiente.", agent: "horus" });
    // La prima chiamata prende il lock in modo sincrono prima del primo await.
    expect(isReviewRunning()).toBe(true);
    const r2 = await reviewTaskPlan({ content: "Un secondo piano diverso.", agent: "horus" });
    expect(r2.ok).toBe(false);
    expect(r2.error).toBe(REVIEW_BUSY_MESSAGE);

    const r1 = await p1;
    expect(r1.ok).toBe(true);
    expect(r1.review).toMatch(/Giudizio finale/i);
    // Lock rilasciato nel finally.
    expect(isReviewRunning()).toBe(false);
  });

  it("dopo il rilascio, una nuova revisione riparte", async () => {
    const r = await reviewTaskPlan({ content: "Terzo piano, sequenziale.", agent: "horus" });
    expect(r.ok).toBe(true);
  });
});

describe("Task #50 — reviewTaskPlan gating agente non configurato", () => {
  it("agente Ares non configurato → errore chiaro, nessun lock preso", async () => {
    const r = await reviewTaskPlan({ content: "Piano da revisionare.", agent: "ares" });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/configurato|raggiungibile/i);
    expect(isReviewRunning()).toBe(false);
  });
});

describe("Task #50 — allowFileRead non blocca il content inline", () => {
  it("content inline con allowFileRead=false è ammesso (nessun blocco di lettura file)", async () => {
    const r = await reviewTaskPlan({
      content: "Piano incollato dall'utente, senza file.",
      agent: "horus",
      allowFileRead: false,
    });
    expect(r.ok).toBe(true);
    expect(r.error).toBeUndefined();
  });
});
