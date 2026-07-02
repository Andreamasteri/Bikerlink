// Task #5326 — Trasferimento di conoscenza Horus → Ares (RAG + prompt injection).
//
// Ares (persona diagnostica/di studio, provider dedicato DIAG_OLLAMA_*) non
// esegue cicli propri di analisi continua: riceve invece, in SOLA LETTURA, gli
// insight più recenti prodotti da Horus (artifact "shareable" in
// ai_analysis_artifacts). Nessun fine-tuning: il trasferimento è puro context
// injection nel system prompt della sessione Ares, aggiornato a ogni turno con
// cache breve — mai un peso di modello che cambia.
//
// Riusa loadShareableAnalysisKnowledge() (horus-analyzer.ts) come sorgente
// unica di verità così Horus e Ares vedono esattamente gli stessi artifact.
import { loadShareableAnalysisKnowledge } from "./horus-analyzer";

const MAX_ENTRIES_IN_PROMPT = 8;
const MAX_ENTRY_CHARS = 600;

/**
 * Compone il blocco di contesto "conoscenza da Horus" da iniettare nel system
 * prompt di Ares. Best-effort: se non ci sono artifact disponibili ritorna
 * stringa vuota (nessuna sezione aggiunta, mai un placeholder rumoroso).
 */
export async function buildAresLearningContext(): Promise<string> {
  try {
    const entries = await loadShareableAnalysisKnowledge();
    if (entries.length === 0) return "";
    const picked = entries.slice(0, MAX_ENTRIES_IN_PROMPT);
    const lines = picked.map((e) => {
      const answer = e.answer.length > MAX_ENTRY_CHARS ? `${e.answer.slice(0, MAX_ENTRY_CHARS)}…` : e.answer;
      return `- ${e.question}: ${answer}`;
    });
    return [
      "[CONOSCENZA CONDIVISA DA HORUS — analisi autonoma piattaforma, sola lettura]",
      ...lines,
    ].join("\n");
  } catch (err) {
    console.warn("[ares-learning] buildAresLearningContext error (contesto omesso):", (err as Error).message);
    return "";
  }
}
