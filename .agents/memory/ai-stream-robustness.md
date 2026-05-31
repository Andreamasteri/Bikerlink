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

**How to apply:** vale per qualunque nuovo stream AI con questa topologia. Il cloud,
essendo l'ultima risorsa, può restare streaming diretto (vedi follow-up per validarlo
anche lì).

## Quirk: OLLAMA_URL è settato nell'ambiente di questo repl
`isOllamaConfigured` dipende da `OLLAMA_URL`, che QUI è presente. I test che
esercitano un flusso AI e non mockano `ollama-client` vedranno il provider locale
attivo, cambiando il comportamento atteso (es. la guardia "nessun provider → 503").

**How to apply:** nei test del flusso AI mocka sempre `ollama-client` impostando
`isOllamaConfigured` esplicitamente, invece di assumere lo stato dell'ambiente.
