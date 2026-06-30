---
name: ThinkCentre → Cloudflare migration notes
description: Migrazione COMPLETATA da DuckDNS+nginx+LE a Cloudflare Tunnel. DuckDNS/nginx/certbot DISABILITATI il 29-giu-2026. Solo cloudflared attivo su biker-link.net.
---

# ThinkCentre — Cloudflare Tunnel (MIGRAZIONE COMPLETATA)

## Setup attuale (Cloudflare Tunnel)

### Tunnel
- Nome: `bikerlink-tc`
- ID: `86122511-2752-4002-aec9-1fdd7c25b9f5`
- Account CF (Zero Trust): `d116d3d97b133c543d02934be4bc98d2`
- Dominio: `biker-link.net` (acquistato su Cloudflare, zone ID `e2ced3f458b06555c6c8e8a403f4b489`)
- cloudflared: installato su TC via `cloudflared service install <token>`, systemd `cloudflared.service` ENABLED+ACTIVE

### Tunnel 1: bikerlink-tc (ThinkCentre)
ID: `86122511-2752-4002-aec9-1fdd7c25b9f5`
Route ingress:
- `gh.biker-link.net`        → `http://127.0.0.1:8989`
- `valhalla.biker-link.net`  → `http://127.0.0.1:8003` ⚠️ DOVREBBE essere `8002` (porta reale, verificato 30-giu-2026 via `ss -tlnp`+`docker ps`); ingress dashboard è scollegato/errato → endpoint pubblico rotto (502/connection refused). Fix richiede accesso alla dashboard Cloudflare, fuori dal repo.
- `whisper.biker-link.net`   → `http://127.0.0.1:8080`
- `nominatim.biker-link.net` → `http://127.0.0.1:7070`
- `tc.biker-link.net`        → `http://127.0.0.1:9199`

### Tunnel 2: bikerlink-pc (PC fisso Windows — Ollama)
ID: `4626e124-4601-43c2-bbda-78ef4295da2d`
Route ingress:
- `ollama.biker-link.net`    → `http://127.0.0.1:11434` + `httpHostHeader: localhost`
Installato come Windows service: `C:\cloudflared.exe service install <token>`
Ollama installato via winget: `winget install Ollama.Ollama`

### DNS Cloudflare (CNAME proxied)
- `gh/valhalla/whisper/nominatim/tc` → CNAME `86122511-....cfargotunnel.com` (TC tunnel)
- `ollama` → CNAME `4626e124-....cfargotunnel.com` (PC fisso tunnel)
Tutti creati via API automaticamente.

### Env Replit aggiornate
Shared env vars (non sensibili):
- `GRAPHHOPPER_URL` = `https://gh.biker-link.net`
- `VALHALLA_URL`    = `https://valhalla.biker-link.net`
- `NOMINATIM_URL`   = `https://nominatim.biker-link.net`
- `WHISPER_URL`     = `https://whisper.biker-link.net`
- `REDIS_PROBE_URL` = `https://tc.biker-link.net/probe/redis`
- `DIAG_OLLAMA_URL` = `https://ollama.biker-link.net` (PC fisso — codice/diagnostica)

Secret aggiornati:
- `OLLAMA_URL` = `https://ollama-tc.biker-link.net` (TC — floating widget AI assistant)

### Due Ollama distinti
- **ollama-tc.biker-link.net** → TC Ollama (systemd) → floating widget AI assistant (`OLLAMA_URL`)
- **ollama.biker-link.net** → PC fisso Ollama (Windows service) → codice/diagnostica (`DIAG_OLLAMA_URL`)

---

## Setup precedente (DuckDNS — DISMESSO e DISABILITATO)
Tutti i vecchi URL `*.bikerlink.duckdns.org` non sono più raggiungibili.
**29 Giugno 2026** — Disabilitati sul TC:
- `duckdns.timer` + `duckdns.service` → `disabled`
- `nginx` → `disabled`
- `certbot.timer` → `disabled`
Il cert Let's Encrypt rimane sul disco in `/etc/letsencrypt/live/bikerlink/` (non rinnovato).
Può essere rimosso con: `sudo certbot delete --cert-name bikerlink`

---

## Note operative

### Gestire il tunnel
```bash
# Status
sudo systemctl status cloudflared

# Restart
sudo systemctl restart cloudflared

# Logs
journalctl -u cloudflared -f

# Aggiornare config ingress (via API CF, non file locale)
# PUT /accounts/{account_id}/cfd_tunnel/{tunnel_id}/configurations
```

### Aggiornare token tunnel (se necessario)
```bash
sudo cloudflared service uninstall
sudo cloudflared service install <nuovo_token>
sudo systemctl enable cloudflared && sudo systemctl start cloudflared
```

### Redis
TCP puro non supportato da CF Tunnel free. Redis rimane su connessione diretta o da valutare CF Spectrum (a pagamento).

### Ollama fix Host header
Il tunnel usa `originRequest.httpHostHeader = "localhost"` — Ollama 0.24+ rifiuta richieste con Host ≠ localhost (403). Già configurato nell'ingress.

### bikerlink.it (dominio di terzi)
`bikerlink.it` NON è nostro — appartiene a un'altra organizzazione. Non usare quel dominio.
Il nostro dominio è `biker-link.net` (registrato su Cloudflare).

---

## Cloudflare Access (service token) — auth layer davanti ai servizi TC — ATTIVO

Layer di auth ATTIVO DAVANTI ai servizi self-hosted (gh/valhalla/nominatim/whisper), in aggiunta ai token custom esistenti (`X-GH-Token`, `X-Valhalla-Key`, `X-Nominatim-Token`, `X-Whisper-Token`) che restano come fallback. Senza i CF headers ogni hostname risponde **403** (pagina "Cloudflare Access"); col service token la richiesta passa l'edge e raggiunge l'origin.

### Stato Cloudflare (creato — ATTIVO)
- Account Zero Trust `d116d3d97b133c543d02934be4bc98d2`.
- 4 app **Access self-hosted**: `gh|valhalla|whisper|nominatim.biker-link.net`.
- **Service token** `bikerlink-tc-access` (id `d976f94d-ab33-46c1-9a48-f8340483dbb1`) + policy reusable non_identity (id `260f8223-b86a-41cf-9490-bc186842497d`) che allow-a il token.
- Client ID/Secret in Replit secrets `CF_ACCESS_CLIENT_ID` / `CF_ACCESS_CLIENT_SECRET`.
- **Gotcha CF_API_TOKEN**: per creare/gestire app+policy+service token serve un token con permessi Account → "Access: Apps and Policies" Edit + "Access: Service Tokens" Edit; senza Zero Trust scope l'API torna errore di permessi.

### Lato codice (wired)
- Helper `server/lib/cf-access.ts`: `cfAccessHeaders()` ritorna `{"CF-Access-Client-Id","CF-Access-Client-Secret"}` SOLO se entrambe le env sono presenti, altrimenti `{}` (degrada). `isCfAccessConfigured()` per check.
- `...cfAccessHeaders()` SOLO ai target self-hosted, MAI a Nominatim/Photon pubblici, API cloud o tile. Header CF vanno all'edge CF, innocui per l'origin.
- **Gotcha probe admin**: l'attivazione di Access ha rotto i probe health di `server/routes/admin/thinkcentre-health-vn-probes.ts` (valhalla+nominatim) con 403 — erano stati DIMENTICATI nel wiring iniziale. Risolto aggiungendo `cfAccessHeaders()` (nominatim solo quando self-hosted, mai sul fallback openstreetmap.org). `gh-probes.ts` era già corretto; `infra-probes.ts` non serve (host `tc.biker-link.net`/TCP non sotto Access).
- **Ollama escluso deliberatamente** (TC + PC fisso): non in scope; coprire come follow-up se si vuole Access anche lì.

## Monitor "Ares" (PC fisso Ollama) — admin ThinkCentre card
- Ares è una macchina SEPARATA dal TC (PC Windows, `DIAG_OLLAMA_URL`=`ollama.biker-link.net`). Ha il suo blocco dedicato nella ThinkCentreCard (`components/admin/ThinkCentreAresBlock.tsx`), probe backend `server/routes/admin/thinkcentre-health-ares-probe.ts`, esposto come `aresDetail` nella risposta `/api/admin/thinkcentre-health`.
- **Decisione**: Ares NON contribuisce a onlineCount/configuredCount/overall né a onStatuses del TC (host esterno → niente coupling con la SLA del ThinkCentre). **Why**: evitare scope creep/falsi degradati quando una macchina diversa è giù.
- Metriche RAM/CPU/GPU sono OPZIONALI via `ARES_METRICS_URL` (endpoint JSON sul PC che restituisce `{cpu,ram,gpu,gpuName?}` in %). Se assente → UI mostra solo online/offline e segnala l'endpoint come PREREQUISITO. **Regola**: questo monitor NON installa servizi sul PC fisso; l'endpoint metriche va predisposto manualmente.
- Storico chart = ring buffer **in-memory** (60 campioni, volatile, si azzera al restart) — niente persistenza DB per le metriche ad alta frequenza.
- **Gotcha CF headers**: gli header CF Access si allegano SOLO verso host `*.biker-link.net` (helper `trustedCfHeaders(url)` nel probe), per non disclosare il service token se `ARES_METRICS_URL`/`DIAG_OLLAMA_URL` puntasse per errore a un origin esterno. `DIAG_OLLAMA_TOKEN` aggiunto a `sanitizeError`.

## Why
Cloudflare Tunnel elimina port forwarding sul router, DuckDNS, Let's Encrypt, e nginx per l'esposizione esterna. Zero ingress firewall rules. TLS gestito da Cloudflare Edge. Costo: solo il dominio biker-link.net (~$9-11/anno). CF Access aggiunge un secondo fattore di auth all'edge senza esporre i servizi a chiunque conosca i token custom.
