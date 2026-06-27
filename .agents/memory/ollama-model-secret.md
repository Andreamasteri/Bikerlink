---
name: OLLAMA_MODEL è un secret, non env shared
description: Come cambiare il modello Ollama attivo del backend BikerLink
---

Il modello Ollama usato dal backend (provider Ollama + pannello Scan Diagnostica)
è letto a runtime da `process.env.OLLAMA_MODEL` (server/lib/ollama-client.ts,
server/ai/moderation/provider.ts). Su questo progetto OLLAMA_MODEL è gestito come
**Replit secret**, NON come env var shared.

**Why:** un agent non può modificare i secret direttamente (setEnvVars vale solo
per env vars). Per cambiare il modello attivo serve `requestEnvVar({requestType:
"secret", keys:["OLLAMA_MODEL"]})` e attendere che l'utente aggiorni il valore
dalla tab Secrets, poi riavviare i workflow (Start Backend ecc.) per ricaricarlo.

**How to apply:** quando si installa/cambia un modello Ollama sul ThinkCentre,
dopo `ollama pull` aggiornare OLLAMA_MODEL via requestEnvVar (non hardcodare, non
creare una env var shared duplicata che entrerebbe in conflitto col secret).
Modello corrente: qwen3-coder:30b (MoE 30B-A3B, ~3B attivi, CPU-only fino a GPU).
