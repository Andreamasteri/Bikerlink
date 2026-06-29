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

**Modello attivo (verificato live 2026-06-28 via `ollama list`):**
- `bikerlink:latest` — 7.1 GB, modello custom (basato su mistral-nemo:latest).
  Questo è il modello primario; OLLAMA_MODEL deve puntare a "bikerlink:latest".
- `mistral-nemo:latest` — 7.1 GB, base model ancora presente come fallback locale.

**Fallback hardcoded** in ollama-client.ts: `mistral-nemo:latest` (se OLLAMA_MODEL
non è impostato). Verificare che il secret sia aggiornato a "bikerlink:latest".

**OLLAMA systemd env** (verificato 2026-06-28):
- `OLLAMA_HOST=127.0.0.1:11434` (corretto — bind locale)
- `OLLAMA_FLASH_ATTENTION=1`
- `OLLAMA_NUM_PARALLEL=2`
- `OLLAMA_ORIGINS=*` — deve essere presente; se mancante aggiungere con
  `sudo systemctl edit ollama` + `sudo systemctl restart ollama`.
