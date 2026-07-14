// Task #44 (parità BikerBlog D4) — classifica un errore imprevisto emesso
// dallo stream SSE dell'assistant come TRANSITORIO (recoverable=true, la UI
// offre "Riprova": rete/provider in timeout o sovraccarico — quasi tutto ciò
// che arriva al catch dello stream, dato che i casi permanenti noti — nessun
// provider configurato, prefs/config disabilitate — sono già intercettati con
// un 503/403 PRIMA di aprire lo stream, vedi ai-assistant.ts) oppure
// PERMANENTE (recoverable=false: "Ares non configurato"/"Quebracho non
// configurato" in agent.ts — un retry identico darebbe sempre lo stesso esito
// finché l'admin non interviene sulla configurazione).
const PERMANENT_ERROR_RE = /non configurat[oa]/i;

export function isRecoverableAiError(message: string | null | undefined): boolean {
  if (!message) return true;
  return !PERMANENT_ERROR_RE.test(message);
}
