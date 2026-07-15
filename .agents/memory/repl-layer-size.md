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
- `.cache/` — NON rimuovere dal build script (vedi sezione dedicata sotto): la piattaforma la gestisce come layer separato e `rm` su file dotslash di altro utente faceva fallire il build.
- `.local/backups/` — dump/JSONL backup DB (~53 MB)
- `dist/`, `dist-ota-env/` — export web/OTA Expo; il server gira da `server_dist/`, NON da `dist/`
- `tmp_review_frames/`, `tmp_check/`, `logs/` — artefatti temporanei
- `exports/` — bundle Git e PDF generati dall'agente (~500 MB), non serviti da Express
- `.git/` — storia git (~3.4 GB di cui ~1.9 GB LFS objects); server non usa git a runtime; già su GitHub

## NON rimuovere (serviti a runtime via express.static)
- `uploads/` (foto moto/ads/wishlist), `assets/`, `server/public/` (music), `server_dist/`

**Why:** Queste directory non sono necessarie a runtime (il server Express non le usa) ma vengono incluse nel Repl layer perché non sono in .gitignore. Senza pulizia, il layer supera il limite 2 GB.

**How to apply:** Ogni volta che si aggiunge una nuova directory di workspace che cresce nel tempo, valutare se aggiungerla alla pulizia in deploy-build.sh prima che superi il limite.

## Dimensioni osservate (30 maggio 2026)
- .local/state/replit/ = 504 MB (376 MB agent/ + 124 MB log-query.db)
- Repl layer totale = ~1.7 GB → oltre il limite
- Dopo pulizia: ~1.2 GB → OK

## Dimensioni osservate (15 luglio 2026) — causa del build fallito
- .git/ = 3.4 GB (di cui .git/lfs = 1.9 GB, .git/objects = 1.5 GB)
- exports/ = 505 MB (checkpoint-iniziale-remix.bundle 470 MB + feature-images 35 MB)
- Repl layer totale PRIMA: ~4.2 GB → build falliva silenziosamente a "Creating Autoscale service"
- Repl layer stimato DOPO (nuova pulizia exports/ + .git/): ~335 MB → ampiamente OK

## NON pulire .cache/ nel deploy-build.sh
- **Regola:** il build script NON deve rimuovere `.cache/`. La piattaforma Replit la gestisce come layer dedicato ("Pushing Repl (cache) layer" → "Created Repl (cache) layer"), separato dal Repl layer su cui vale il limite ~2 GB.
- **Why (provato dai build log 31 mag 2026):** il build RIUSCITO (09:38) NON aveva alcuno step di pulizia `.cache/` e ha deployato con successo. I build FALLITI (09:46/09:58) avevano lo step `rm -rf .cache/` e sono morti ESATTAMENTE lì: i file in `.cache/dotslash` (React Native DevTools) nell'ambiente di BUILD sono di proprietà di un altro utente (in dev sono tutti `runner`) → `rm` dà "Permission denied" ed exit NON-ZERO → con `set -e` l'intero publish falliva all'ULTIMO step, dopo che copia DB + build server erano già riusciti.
- Diagnosi: questo fallimento NON è quello silenzioso da size (qui i build log ESISTONO e finiscono con centinaia di righe "Permission denied", senza mai arrivare a "Creating Autoscale service").
- NB: `.cache/` NON era nemmeno la causa del superamento size — la pulizia di `.local/state/` (~504 MB) + attached_assets/ + backups/dist basta a tenere il Repl layer sotto il limite.
