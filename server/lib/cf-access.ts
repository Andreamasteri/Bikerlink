/**
 * Cloudflare Access — Service Token helper (BikerLink)
 *
 * I servizi self-hosted sul ThinkCentre (GraphHopper, Valhalla, Photon,
 * Whisper) sono esposti su biker-link.net tramite Cloudflare Tunnel. Con
 * Cloudflare Access si aggiunge un layer zero-trust DAVANTI a ogni sottodominio:
 * l'edge Cloudflare valida le richieste prima che raggiungano l'origine.
 *
 * Un Service Token CF è composto da due credenziali che vanno inviate come
 * header su OGNI richiesta verso un hostname protetto da Access:
 *   CF-Access-Client-Id      = <client-id>.access
 *   CF-Access-Client-Secret  = <client-secret>
 *
 * Variabili d'ambiente (secret Replit):
 *   CF_ACCESS_CLIENT_ID      — Client ID del Service Token (formato "<uuid>.access")
 *   CF_ACCESS_CLIENT_SECRET  — Client Secret del Service Token
 *
 * Comportamento:
 *   - Se ENTRAMBE sono impostate, cfAccessHeaders() restituisce i due header.
 *   - Altrimenti restituisce {} (degrada con grazia): i token custom esistenti
 *     (X-GH-Token / X-Valhalla-Key / X-Photon-Token / X-Whisper-Token)
 *     restano l'autenticazione attiva come fallback.
 *
 * Gli header sono validati e consumati dall'edge Cloudflare; l'origine li
 * ignora, quindi inviarli è innocuo anche quando la policy Access non è ancora
 * attiva sul sottodominio. Non vanno MAI inviati a endpoint pubblici di terzi
 * (tile CDN, API cloud pubbliche).
 */

const CF_ACCESS_CLIENT_ID = process.env.CF_ACCESS_CLIENT_ID?.trim() ?? "";
const CF_ACCESS_CLIENT_SECRET = process.env.CF_ACCESS_CLIENT_SECRET?.trim() ?? "";

/**
 * Task #4 — Override opzionale per-agente. Un agente AI (bowie/horus/ares/
 * quebracho) può avere un Service Token dedicato via <AGENT>_CF_ACCESS_CLIENT_ID
 * / <AGENT>_CF_ACCESS_CLIENT_SECRET. Se una delle due manca, si ricade sulla
 * coppia generica CF_ACCESS_CLIENT_ID/SECRET (comportamento storico invariato per
 * GraphHopper/Valhalla/Nominatim/Whisper, che chiamano senza argomento).
 * Letto a request-time così un secret aggiunto in futuro è raccolto senza refactor.
 */
function resolvePair(agent?: string): { id: string; secret: string } {
  if (agent) {
    const p = agent.trim().toUpperCase();
    const id = process.env[`${p}_CF_ACCESS_CLIENT_ID`]?.trim();
    const secret = process.env[`${p}_CF_ACCESS_CLIENT_SECRET`]?.trim();
    if (id && secret) return { id, secret };
  }
  return { id: CF_ACCESS_CLIENT_ID, secret: CF_ACCESS_CLIENT_SECRET };
}

/** true se entrambe le credenziali del Service Token CF Access sono configurate. */
export function isCfAccessConfigured(agent?: string): boolean {
  const { id, secret } = resolvePair(agent);
  return id.length > 0 && secret.length > 0;
}

/**
 * Header del Service Token Cloudflare Access da allegare alle richieste verso i
 * servizi self-hosted protetti (gh/valhalla/photon/whisper su biker-link.net).
 * Restituisce {} se le credenziali non sono configurate (fallback ai token custom).
 * Con `agent` usa l'eventuale override per-agente (fallback alla coppia generica).
 */
export function cfAccessHeaders(agent?: string): Record<string, string> {
  const { id, secret } = resolvePair(agent);
  if (!id || !secret) return {};
  return {
    "CF-Access-Client-Id": id,
    "CF-Access-Client-Secret": secret,
  };
}
