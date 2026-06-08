---
name: Watchdog proposer cooldown
description: Il proposer AI bruciava la quota Groq ogni giorno per problemi persistenti (Valhalla down); cooldown 30min aggiunto allo scheduler.
---

## Regola

`server/ai/watchdog/scheduler.ts` deve avere `PROPOSER_COOLDOWN_MS = 30 * 60_000` che impedisce di chiamare `runProposer()` più di una volta ogni 30 minuti, anche se ci sono problemi high/critical ad ogni tick (ogni 60s).

**Why:** Senza cooldown, un servizio down tutto il giorno (es. Valhalla HTTP 502 → severity "high") fa scattare il proposer ogni minuto → ~60 chiamate/ora × ~1200 token = 72.000 token/ora → quota Groq gratuita (200k TPD) esaurita in ~3 ore. L'utente non ha usato niente, è il watchdog automatico.

**How to apply:** Se si modifica il tick o si aggiunge una nuova sorgente di "high severity", verificare che il cooldown regga. Il cooldown è in-memory (si azzera al riavvio del server), quindi dopo ogni restart il proposer può fare un run immediato se ci sono problemi.

## Stack trace del problema originale

```
[ai-provider] groq/openai/gpt-oss-20b fallito: Rate limit reached for model `openai/gpt-oss-20b`
  tokens per day (TPD): Limit 200000, Used 199614, Requested 868
[watchdog/proposer] error: Failed after 3 attempts. Last error: Rate limit reached...
```

Trigger: `[Valhalla] ⚠️ Configurato ma non raggiungibile (status=error, msg=HTTP 502)` → `stillHigh=true` → `runProposer()` ogni 60s.
