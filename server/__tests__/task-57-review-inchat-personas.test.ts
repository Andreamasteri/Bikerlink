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

  // ── Task #71 — formulazioni naturali oltre la lista chiusa originale ─────────
  describe("Task #71 — phrasing naturale", () => {
    it("verbi ampliati con percorso tra backtick (parere/esamina/analizza/revisione)", () => {
      for (const msg of [
        "dammi un parere sul piano `.local/tasks/task-71.md`",
        "esamina il piano `.local/tasks/task-57.md`",
        "analizza il task plan `.local/tasks/task-49.md`",
        "revisione del piano `.local/tasks/task-57.md`",
      ]) {
        expect(detectPlanReviewRequest(msg)?.filePath).toMatch(/^\.local\/tasks\/task-\d+\.md$/);
      }
    });

    it("risolve un riferimento 'task N' a .local/tasks/task-N.md", () => {
      expect(detectPlanReviewRequest("dai un'occhiata al piano di task 57")).toEqual({
        filePath: ".local/tasks/task-57.md",
      });
      expect(detectPlanReviewRequest("puoi controllare il piano del task 57?")).toEqual({
        filePath: ".local/tasks/task-57.md",
      });
      expect(detectPlanReviewRequest("fai una review del piano di task 71")).toEqual({
        filePath: ".local/tasks/task-71.md",
      });
      expect(detectPlanReviewRequest("revisiona il task plan #49")).toEqual({
        filePath: ".local/tasks/task-49.md",
      });
    });

    it("le formule 'soft' attivano SOLO con un bersaglio esplicito", () => {
      // Con bersaglio (numero task o percorso): attiva.
      expect(detectPlanReviewRequest("che ne pensi del piano task 57?")).toEqual({
        filePath: ".local/tasks/task-57.md",
      });
      // Senza bersaglio: nessun piano da revisionare → chat normale.
      expect(detectPlanReviewRequest("che ne pensi di questo piano?")).toBeNull();
      expect(detectPlanReviewRequest("guarda un attimo il piano prima che lo eseguo")).toBeNull();
    });

    it("le formule 'soft' NON scattano sul fallback inline ≥200 char", () => {
      // Solo l'intento FORTE tratta un blocco lungo come piano incollato.
      const soft = "che ne pensi di questo piano? " + "x".repeat(220);
      expect(detectPlanReviewRequest(soft)).toBeNull();
      const strong = "valuta questo piano: " + "x".repeat(220);
      expect(detectPlanReviewRequest(strong)?.content).toBe(strong);
    });

    it("non scatta senza la parola piano/plan (nessun falso positivo)", () => {
      expect(detectPlanReviewRequest("che ne pensi del task 57?")).toBeNull();
      expect(detectPlanReviewRequest("che piano di abbonamento conviene?")).toBeNull();
    });
  });
});
