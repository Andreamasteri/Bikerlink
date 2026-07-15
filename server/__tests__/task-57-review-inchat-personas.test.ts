// Task #57 — Ares e Quebracho eseguono review_task_plan direttamente in chat.
// A differenza di Bowie/Horus (streamText + tool AI SDK), Ares e Quebracho girano
// su HTTP diretta senza tool-calling nativo: detectPlanReviewRequest è l'euristica
// pura che decide se il messaggio dell'admin va instradato a reviewTaskPlan invece
// che alla normale composizione domanda→chat.
import { describe, it, expect } from "vitest";
import { detectPlanReviewRequest } from "../ai/assistant/task-review";

describe("Task #57 — detectPlanReviewRequest", () => {
  it("riconosce un percorso citato tra backtick", () => {
    const r = detectPlanReviewRequest("Quebracho, revisiona il piano `.local/tasks/task-57.md`");
    expect(r).toEqual({ filePath: ".local/tasks/task-57.md" });
  });

  it("riconosce un percorso nudo (senza backtick)", () => {
    const r = detectPlanReviewRequest("Ares, rivedi il task plan .local/tasks/task-57.md per favore");
    expect(r?.filePath).toBe(".local/tasks/task-57.md");
  });

  it("senza percorso ma con testo lungo, tratta il messaggio come piano incollato", () => {
    const longPlan = "Rivedi questo piano: " + "x".repeat(220);
    const r = detectPlanReviewRequest(longPlan);
    expect(r?.content).toBe(longPlan);
    expect(r?.filePath).toBeUndefined();
  });

  it("senza percorso e testo breve, non riconosce nulla (evita falsi positivi)", () => {
    expect(detectPlanReviewRequest("rivedi il piano")).toBeNull();
  });

  it("un messaggio conversazionale qualsiasi non attiva la revisione", () => {
    expect(detectPlanReviewRequest("Ciao Ares, come stai oggi?")).toBeNull();
    expect(detectPlanReviewRequest("")).toBeNull();
  });

  it("richiede sia il verbo di revisione sia la parola piano/plan", () => {
    expect(detectPlanReviewRequest("controlla lo stato del server")).toBeNull();
    expect(detectPlanReviewRequest("il piano è pronto?")).toBeNull();
  });
});
