/**
 * Cloudflare Access — Service Token helper (BikerLink)
 *
 * I servizi self-hosted sul ThinkCentre (GraphHopper, Valhalla, Nominatim,
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
 *     (X-GH-Token / X-Valhalla-Key / X-Nominatim-Token / X-Whisper-Token)
 *     restano l'autenticazione attiva come fallback.
 *
 * Gli header sono validati e consumati dall'edge Cloudflare; l'origine li
 * ignora, quindi inviarli è innocuo anche quando la policy Access non è ancora
 * attiva sul sottodominio. Non vanno MAI inviati a endpoint pubblici di terzi
 * (nominatim.openstreetmap.org, Photon, tile CDN, API cloud).
 */

const CF_ACCESS_CLIENT_ID = process.env.CF_ACCESS_CLIENT_ID?.trim() ?? "";
const CF_ACCESS_CLIENT_SECRET = process.env.CF_ACCESS_CLIENT_SECRET?.trim() ?? "";

/** true se entrambe le credenziali del Service Token CF Access sono configurate. */
export function isCfAccessConfigured(): boolean {
  return CF_ACCESS_CLIENT_ID.length > 0 && CF_ACCESS_CLIENT_SECRET.length > 0;
}

/**
 * Header del Service Token Cloudflare Access da allegare alle richieste verso i
 * servizi self-hosted protetti (gh/valhalla/nominatim/whisper su biker-link.net).
 * Restituisce {} se le credenziali non sono configurate (fallback ai token custom).
 */
export function cfAccessHeaders(): Record<string, string> {
  if (!isCfAccessConfigured()) return {};
  return {
    "CF-Access-Client-Id": CF_ACCESS_CLIENT_ID,
    "CF-Access-Client-Secret": CF_ACCESS_CLIENT_SECRET,
  };
}
