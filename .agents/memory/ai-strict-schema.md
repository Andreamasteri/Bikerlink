---
name: AI strict-mode schemas (generateObject)
description: Regole per gli schema Zod passati a generateObject verso OpenAI/Groq in strict mode, per non far rifiutare il response_format.
---

Quando uno schema Zod viene passato a `generateObject` (Vercel AI SDK) e il provider
(OpenAI structured outputs, oppure Groq `gpt-oss-20b`) gira in **strict mode**, lo schema
JSON deve rispettare due vincoli o l'intera chiamata fallisce con
`Invalid schema for response_format: 'required' ... must include every key`:

1. **Niente `.optional()`** sui campi: in strict mode OGNI proprietà deve stare in `required`.
   Usa `.nullable()` (campo presente in `required`, valore ammesso `null`) al posto di `.optional()`.
2. **Niente object aperti**: `z.object({}).catchall(...)` / `z.record(...)` generano
   `additionalProperties != false`, vietato in strict mode. Per un bag di parametri arbitrari
   usa una **stringa JSON** (`z.string().nullable()`) e fai serializzare il modello.

**Why:** il watchdog AI proposer (`server/ai/watchdog/types.ts` → `proposalSchema`) falliva a
OGNI esecuzione perché `action.target`/`action.params`/`rollbackHint` erano `.optional()` e
`params` era un catchall aperto. L'errore non bloccava il server (catturato) ma rendeva la
feature AI inutilizzabile in produzione, ed era difficile da notare senza leggere i log prod.

**How to apply:** prima di aggiungere/modificare uno schema usato da `generateObject` nel
watchdog o nell'assistant, verifica che non ci siano `.optional()` né object catchall/record.
Il fallback `mode:"json"` (modelli non-strict, es. llama-3.x su Groq) è più permissivo, ma scrivi
lo schema sempre strict-safe così funziona su tutta la catena di provider.
