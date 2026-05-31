---
name: Repl Layer Size Limit
description: .local/state/replit/ e attached_assets/ crescono nel tempo e fanno superare il limite Cloud Run ~2 GB al Repl layer, causando fallimento silenzioso del deploy senza log.
---

## Regola
Prima di ogni deploy, il build script (scripts/deploy-build.sh) deve pulire le directory non necessarie a runtime per mantenere il Repl layer sotto ~2 GB.

## Sintomi del superamento del limite
- Build fallisce allo step "Creating Autoscale service" o "promote" senza alcun messaggio di errore
- `fetch_deployment_logs` restituisce zero log
- Il build esce 9-10 secondi dopo "Created Repl (cache) layer"
- Produzione restituisce 500/503 perché il nuovo container non si avvia

## Directory da pulire nel deploy-build.sh
- `attached_assets/` — screenshot del workspace Replit (~crescita variabile)
- `.local/state/replit/` — transcript agente AI + log-query.db (~500 MB nel tempo)
- `.local/state/scribe/` — log scribe (~4 MB)
- `.local/state/workflow-logs/` — log workflow (~0.1 MB)
- `.cache/` — cache tooling: dotslash (~572 MB) + uv (~269 MB) + node-gyp + typescript (~894 MB totali). CAUSA RICORRENTE: ricresce dopo ogni fix. Rimuovere come ULTIMO step (dopo `node scripts/server-build.js`, perché esbuild usa `.cache/typescript`).
- `.local/backups/` — dump/JSONL backup DB (~53 MB)
- `dist/`, `dist-ota-env/` — export web/OTA Expo; il server gira da `server_dist/`, NON da `dist/`
- `tmp_review_frames/`, `tmp_check/`, `logs/` — artefatti temporanei

## NON rimuovere (serviti a runtime via express.static)
- `uploads/` (foto moto/ads/wishlist), `assets/`, `server/public/` (music), `server_dist/`

**Why:** Queste directory non sono necessarie a runtime (il server Express non le usa) ma vengono incluse nel Repl layer perché non sono in .gitignore. Senza pulizia, il layer supera il limite 2 GB.

**How to apply:** Ogni volta che si aggiunge una nuova directory di workspace che cresce nel tempo, valutare se aggiungerla alla pulizia in deploy-build.sh prima che superi il limite.

## Dimensioni osservate (30 maggio 2026)
- .local/state/replit/ = 504 MB (376 MB agent/ + 124 MB log-query.db)
- Repl layer totale = ~1.7 GB → oltre il limite
- Dopo pulizia: ~1.2 GB → OK
