---
name: ThinkCentre home server
description: Cos'è il "ThinkCentre" — il server locale di casa che ospita i servizi self-hosted di BikerLink
---

# ThinkCentre = server locale di casa

Quando l'utente o i docs parlano di "ThinkCentre" (o "server di casa"), si riferiscono
a un mini-PC **Lenovo ThinkCentre 910q** (i5-7500T, 32 GB RAM, Ubuntu) tenuto in casa
dall'utente che ospita i servizi **self-hosted** dell'app.

**IP interno LAN: `192.168.1.35`** (utente = `andrea`) — usare sempre questo indirizzo nei comandi bash/script
che girano sulla rete locale (es. curl di test, ssh, probe diretti). NON usare localhost o
altri indirizzi per raggiungere il ThinkCentre dalla LAN.

**Servizio principale che ci gira: GraphHopper** (motore di routing self-hosted).

Per i docs (`docs/*-server-setup.md`) sullo stesso ThinkCentre girano anche:
- **Ollama** (LLM locale — provider AI primario per route parsing + traduzioni) → `OLLAMA_URL`
- **Whisper** (ASR / trascrizione vocale) → `WHISPER_URL`
- **Nominatim** (geocoding OSM self-hosted) → `NOMINATIM_URL`

**Why:** l'utente chiama "salute/health del ThinkCentre" lo stato di questi servizi
self-hosted. Non è un host cloud: se il server di casa è spento/irraggiungibile, l'app
fa fallback ai provider cloud (Gemini/OpenAI per AI, OSM pubblico per geocoding, ecc.).

**How to apply:** la dashboard admin ha una card inline unificata "Server di casa
(ThinkCentre)" che fa il probe di tutti e 4 i servizi in un colpo (endpoint admin che
li interroga in parallelo, URL mascherati, token mai esposti). Restano anche gli
indicatori per-servizio sparsi (routing-health, ai-hub, maps).

**Whisper health quirk:** whisper.cpp non ha endpoint di health dedicato. Un probe va
considerato "online" per qualsiasi risposta HTTP < 500 (un 404/405 = server su, path/verbo
diverso); solo 5xx o errore di rete/timeout = offline. Probare `/` con GET, non `/inference`
(che è POST). Lo stesso vale per chiunque aggiunga health-check a servizi senza `/health`.

## ⚠️ REGOLA OPERATIVA — comandi long-running DEVONO sopravvivere al disconnect SSH

**Ogni comando lungo sul ThinkCentre (build grafi GraphHopper, download PBF, merge osmium, import, ecc.) va lanciato in modo che sopravviva alla disconnessione SSH** — usare `screen -dmS <nome> bash -c '...'` (o tmux/nohup), MAI lanciato diretto nella sessione SSH.

**Why:** l'utente si connette da PC Windows via SSH; la connessione cade spesso ("client_loop: send disconnect: Connection reset") e un build lanciato diretto viene killato a metà, sprecando 30-60 min. È una richiesta esplicita dell'utente.

**How to apply:** template build in screen con log su file per monitoraggio:
```bash
screen -dmS build-<area> bash -c '
docker run --rm ... --import ... 2>&1 | tee /tmp/build-<area>.log
echo "=== <AREA> COMPLETATO ===" >> /tmp/build-<area>.log
'
```
Monitor: `tail -f /tmp/build-<area>.log` (Ctrl+C esce dal tail, NON ferma il build). Stato: `screen -ls` o `docker ps | grep graphhopper`.

## ⚠️ REGOLA CRITICA — URL Tailscale vietati in prod

**Non usare mai URL `*.ts.net` (Tailscale) per i servizi del ThinkCentre nelle env var di produzione.**

**Why:** il server Replit prod (`biker-link.replit.app`) è fuori dalla rete Tailscale → riceve 403 o timeout su qualsiasi `*.ts.net`. Funziona solo in dev locale (dove la macchina è nella stessa rete VPN).

**How to apply:** per le env var `GRAPHHOPPER_URL`, `OLLAMA_URL`, `WHISPER_URL`, `NOMINATIM_URL` in produzione usare sempre:
- IP pubblico del ThinkCentre (se statico), oppure
- DuckDNS con nginx reverse proxy (Task #3306)

Esempio sbagliato: `NOMINATIM_URL=https://bikerlink.tail5056aa.ts.net/nominatim`
Esempio corretto: `NOMINATIM_URL=https://bikerlink.duckdns.org/nominatim`

## ⚠️ Valhalla — DEVE usare un file PBF unico

**NON dare a Valhalla più PBF separati** (es. i 7 area PBF di GH) — crasha durante il tile building con `vector::_M_range_check size=0` a causa di overlap di confine tra estrazioni. Vedere: https://github.com/valhalla/valhalla/issues/3925

**Fix confermato:** usare un singolo `europe-latest.osm.pbf` scaricato direttamente da geofabrik. Stesso file riusabile per Nominatim.

**Build command (struttura validata con test grecia OK):**
```bash
docker run --rm --name bikerlink-valhalla-build --shm-size=4g \
  -v "$(pwd)/data:/custom_files" -p 8002:8002 \
  -e use_tiles_ignore_pbf=False -e serve_tiles=True \
  -e build_admins=True -e build_time_zones=True \
  -e build_elevation=False -e force_rebuild=True \
  ghcr.io/gis-ops/docker-valhalla/valhalla:latest
```
I tiles vengono scritti in `./data/valhalla_tiles/`. Se la build precedente è crashata: `sudo rm -rf data/valhalla_tiles` prima di ripartire.

**GH containers usano profiles ("areas", codice)** — NON partono con `docker compose up -d` generico; specificarli per nome o usare `docker compose up -d graphhopper-<codice>`.
