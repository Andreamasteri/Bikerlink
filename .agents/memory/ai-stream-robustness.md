---
name: AI stream robustness & Ollama test quirk
description: Pattern per stream AI provider-locale+fallback-cloud, e quirk OLLAMA_URL nei test.
---

## Pattern: stream AI con primario locale + fallback cloud
Quando un endpoint fa streaming da un provider primario locale (Ollama) con
fallback a un provider cloud (Gemini): NON emettere i chunk del primario live.
**Bufferizza tutto il primario, valida il testo completo, poi emetti solo se valido**;
altrimenti scarta il buffer e ricadi sul cloud (o emetti un errore pulito se non
c'è fallback).

**Why:** i chunk già inviati al client non sono ri-inviabili; un JSON rotto a metà
stream dal primario produrrebbe output corrotto senza possibilità di recupero.
Buffer-then-emit garantisce all'utente solo output valido o un fallback pulito. Il
costo di latenza del buffering è trascurabile per un provider locale.

**How to apply:** vale per qualunque nuovo stream AI con questa topologia. La catena
del resolver percorsi è **Ollama (locale) → Groq (cloud veloce) → Gemini (cloud
finale)**: ogni tier cloud usa lo stesso buffer-then-validate (anche Groq). Helper
condiviso `bufferAndValidateStream` in `waypoints.next.ts`. `isGroqConfigured` dipende
da `GROQ_API_KEY`, `getGroqModel()` legge `GROQ_MODEL` (default `llama-3.3-70b-versatile`).
GROQ_API_KEY è già configurata nel repl (condivisa col modulo di moderazione).

## Quirk: OLLAMA_URL/GROQ_API_KEY sono settati nell'ambiente di questo repl
`isOllamaConfigured` dipende da `OLLAMA_URL` e `isGroqConfigured` da `GROQ_API_KEY`,
ENTRAMBI presenti QUI. I test che esercitano un flusso AI e non mockano
`ollama-client` **e** `groq-client` vedranno quei provider attivi, cambiando il
comportamento atteso (es. la guardia "nessun provider → 503", o un fallback inatteso).

**How to apply:** nei test del flusso AI mocka SEMPRE sia `ollama-client` sia
`groq-client` impostando `isOllamaConfigured`/`isGroqConfigured` esplicitamente,
invece di assumere lo stato dell'ambiente.
