---
name: Ollama GBNF grammar complexity — 400 su schemi JSON annidati
description: Ollama 0.32+ converte il JSON Schema in GBNF grammar; schemi annidati complessi superano il limite del parser → 400 Bad Request in generateObject.
---

# Ollama GBNF Grammar Complexity Limit

## Regola
Per Ollama, usare SEMPRE `output: "no-schema"` in `generateObject` (path non-streaming).
Non inviare mai il JSON Schema come `format` field per schemi con array annidati di oggetti.

**Why:** Ollama 0.32+ converte il JSON Schema in GBNF grammar per vincolare l'output strutturato.
Schemi con array di oggetti + proprietà obbligatorie multiple (es. `proposalsSchema`) superano
il limite del parser GBNF:
```
parse: error parsing grammar: number of rules that are going to be repeated
multiplied by the new repetition exceeds sane defaults
Failed to initialize samplers: failed to parse grammar → HTTP 400
```

**How to apply:**
- In `generateStructured` (server/ai/moderation/provider.ts): la condizione `m.objectMode === "json" || m.id === "ollama"` forza il path no-schema per tutti i modelli Ollama.
- Il path no-schema include lo schema come testo nel prompt e valida con Zod manualmente.
- Schemi semplici (oggetto piatto, schema da curl manuale) NON triggherano il bug — solo schemi annidati complessi.
- Il bug NON riguarda il path streaming (agent.ts usa think:true + fullStream, mai generateObject).
- Versione Ollama affetta: 0.32.1 (verificato su TC). Potrebbe essere stato introdotto in 0.31+.

## Fix applicato
`server/ai/moderation/provider.ts` — `generateStructured`:
```typescript
if (m.objectMode === "json" || m.id === "ollama") {
  // no-schema mode: schema descritto nel prompt, Zod parse manuale
}
```
