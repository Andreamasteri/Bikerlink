---
name: AI provider chain strategy & free-tier guards
description: Cloud-first AI chain (Groq→Gemini→OpenAI→Anthropic) con Ollama rete finale; come i limiti free vengono protetti automaticamente.
---

# Strategia provider AI & guardie free-tier

Tutti i flussi AI di moderazione/watchdog/router/assistant passano da `runWithFallback`
in `server/ai/moderation/provider.ts`. Cambiare la chain lì si propaga ovunque.

## Ordine chain (decisione utente)
Cloud-first per qualità: **Groq (Llama 3.3 70B, free) → Gemini 2.5 Flash (free) →
OpenAI → Anthropic**, con **Ollama self-hosted come rete finale illimitata**.

**Why:** l'utente vuole massima qualità a costo zero; Groq/Gemini free battono il
modello Ollama locale leggero. Ollama resta come backstop illimitato quando i free
tier sono esauriti o le chiavi mancano.

**Ollama backstop integrato in `runWithFallback`:** opzione `ollamaBackstop: true` in
`ResolveOpts`. Dopo aver esaurito la catena cloud, prova `tryBuildOllama()` (id
`"ollama"`, scheduler pass-through, fuori da cooldown/cap perché self-hosted). I
chiamatori che devono SEMPRE rispondere (OTA assistant, integrity/explain, console
agent) passano `ollamaBackstop: true`. Senza il flag la catena resta solo-cloud e
propaga l'errore. Non serve più gestire Ollama "a mano" fuori dalla chain.

**Eccezione:** parsing/geocoding/traduzioni ad alto volume (es. `waypoints.next.ts`)
restano **Ollama-diretti** — NON spostarli su cloud, sfonderebbero i cap free.

## Protezione "non sforare" (requisito critico utente)
Due livelli, entrambi automatici:
1. **RPM** — Bottleneck limiters in `server/lib/throttle.ts` (`limiters.groq` 30 RPM,
   `limiters.gemini` 15 RPM). Esposti come `m.scheduler` su `ResolvedModel`.
   **CRITICO:** ogni chiamata al modello — incluso lo streaming dell'assistente —
   DEVE essere wrappata in `m.scheduler(() => ...)`. Chiamare `streamText(m.model)`
   diretto **bypassa il limiter RPM**. (Bug trovato in code review, poi corretto.)
2. **RPD** — `DAILY_CAPS` in `provider.ts` (groq 1000, google 1500; override
   `*_RPD_LIMIT`). Guardia proattiva: `isAvailable()` salta un provider oltre il cap;
   `incrDailyCount` conta **al tentativo di build** (conservativo: può sottostimare
   ma non sfora). Reset a mezzanotte UTC.

**Limiti noti (accettati):** il contatore RPD è in-memory → si azzera al restart e
non è condiviso tra istanze. Accettabile perché i free tier restituiscono solo 429
(nessun addebito) e il cooldown reattivo 6h su 429/RESOURCE_EXHAUSTED è backstop.

## Gemini free tier
Usa modelli **Flash/Flash-lite**, mai `gemini-2.5-pro` (dal 2026-04 è solo a
pagamento → RESOURCE_EXHAUSTED su free). brain→`gemini-2.5-flash`,
router→`gemini-2.5-flash-lite` (più leggero/economico).

## Groq integrazione
OpenAI-compatibile: `createOpenAI({ baseURL: "https://api.groq.com/openai/v1" })`,
nessun pacchetto npm nuovo. `generateObject` può essere meno affidabile su Groq →
il fallback automatico a Gemini copre il caso.

## Robustezza streaming assistant
`agent.ts` tiene un flag `emittedAny`: se un provider muore **dopo** aver già inviato
delta al client, NON si riparte da un altro provider (mescolare due output corromperebbe
la risposta) — si tiene il parziale e si marca `degraded`.
