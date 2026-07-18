/**
 * Utility: strip del blocco <think>…</think> dalle risposte Ollama con think:true.
 *
 * Con think:true non-streaming (stream:false), qwen3 include il reasoning nel campo
 * `message.content` PRIMA del contenuto reale, nella forma:
 *   <think>…ragionamento interno…</think>\ncontenuto effettivo
 *
 * Tutti i callsite Horus batch (horus-patch-scan, log-analysis, horus-app-analysis)
 * DEVONO chiamare questa funzione prima di parsare la risposta.
 *
 * I flussi streaming 1:1 e di gruppo usano già `ollamaThinkSeparated` (agent.ts)
 * che intercetta i reasoning-delta separatamente — NON usare questa funzione lì.
 */

/**
 * Rimuove il blocco <think>…</think> completo e i tag orfani residui
 * dal testo restituito da qwen3 con think:true (non-streaming).
 *
 * Copre tre casi:
 * - Blocco completo: `<think>…</think>contenuto` → `contenuto`
 * - Tag di chiusura orfano: `</think>contenuto` → `contenuto` (qwen3 con think:false parziale)
 * - Tag di apertura orfano: `<think>contenuto` → `contenuto` (risposta troncata)
 */
export function stripThinkBlock(text: string): string {
  return text
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/<\/think>/gi, "")
    .replace(/<think>/gi, "")
    .trim();
}
