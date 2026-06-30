/**
 * Test Ollama endpoint — Admin (Task #2852)
 *
 * GET /api/admin/ai/test-ollama
 * Esegue un prompt minimo sul server Ollama self-hosted (provider AI primario per
 * route parsing + traduzioni) e ritorna stato, latenza, modello e se è configurato.
 * Analogo a GET /api/admin/maps/test-routing per GraphHopper: serve all'admin per
 * diagnosticare quando l'app ricade sul provider cloud (Gemini/OpenAI).
 *
 * URL/token sono mascherati nella risposta: l'URL mostra solo protocollo+host,
 * il token è esposto solo come booleano (mai in chiaro).
 */

import { Router, type Request, type Response } from "express";
import { callOllamaChat, getOllamaDiagnostics, isOllamaReachable, type OllamaPersona } from "../../../lib/ollama-client";

const router = Router();

function parsePersona(req: Request): OllamaPersona {
  return req.query.persona === "horus" ? "horus" : "bowie";
}

/** Maschera un URL mostrando solo protocollo + hostname (mai path/query/credenziali). */
function maskUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.protocol}//${parsed.hostname}`;
  } catch {
    // Mai esporre input grezzo non parsabile: potrebbe contenere path/credenziali.
    return "[url-non-valido]";
  }
}

/**
 * Rimuove dati sensibili dal messaggio di errore prima di esporlo all'admin:
 * URL completi (potenziali path/credenziali), il token e header di auth.
 * Il messaggio raw rimane solo nei log lato server.
 */
export function sanitizeError(msg: string): string {
  let out = msg;
  // Sostituisci eventuali URL http(s) con la sola versione mascherata host.
  out = out.replace(/https?:\/\/[^\s"'`)]+/gi, (m) => maskUrl(m));
  // Rimuovi il token (Bowie e/o Horus, se diverso) se presente nel testo.
  for (const token of [process.env.BOWIE_OLLAMA_TOKEN, process.env.HORUS_OLLAMA_TOKEN]) {
    if (token) out = out.split(token).join("***");
  }
  // Maschera schemi "Bearer <token>".
  out = out.replace(/(bearer)\s+\S+/gi, "$1 ***");
  // Rimuovi header/coppie chiave-valore di tipo token/authorization/api-key.
  out = out.replace(/(x-ollama-token|authorization|api[-_]?key)\s*[:=]\s*\S+/gi, "$1: ***");
  return out.slice(0, 300);
}

router.get("/test-ollama", async (req: Request, res: Response) => {
  // Letto a request-time per riflettere eventuali cambi env nel processo long-lived.
  // ?persona=horus testa la config dedicata di Horus (fallback su Bowie se assente).
  const persona = parsePersona(req);
  const { url: rawUrl, tokenConfigured } = getOllamaDiagnostics(persona);
  const model =
    persona === "horus"
      ? (process.env.HORUS_OLLAMA_MODEL?.trim() || "bikerlink-routing")
      : (process.env.BOWIE_OLLAMA_MODEL ?? "mistral-nemo:latest");

  // Se l'URL non è impostato: non è un errore, semplicemente non configurato.
  if (!rawUrl) {
    return res.json({
      persona,
      configured: false,
      model,
      url: null,
      token_configured: tokenConfigured,
      latency_ms: null,
      ok: false,
    });
  }

  const start = Date.now();
  const diagnostics = {
    persona,
    configured: true as const,
    model,
    url: maskUrl(rawUrl),
    token_configured: tokenConfigured,
  };

  try {
    const reachable = await isOllamaReachable(persona);
    if (!reachable) {
      return res.status(502).json({
        ...diagnostics,
        latency_ms: Date.now() - start,
        ok: false,
        error: "Server non raggiungibile.",
      });
    }
    const reply = await callOllamaChat(
      "Rispondi solo con la parola: PONG",
      undefined,
      { temperature: 0, maxRetries: 0, persona },
    );
    const latency_ms = Date.now() - start;
    return res.json({
      ...diagnostics,
      latency_ms,
      ok: true,
      reply: typeof reply === "string" ? reply.trim().slice(0, 120) : null,
    });
  } catch (err: unknown) {
    const latency_ms = Date.now() - start;
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[admin/ai/test-ollama] errore (persona=${persona}):`, msg);
    return res.status(502).json({
      ...diagnostics,
      latency_ms,
      ok: false,
      error: sanitizeError(msg),
    });
  }
});

export default router;
