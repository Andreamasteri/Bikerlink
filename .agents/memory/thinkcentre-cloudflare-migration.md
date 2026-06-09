---
name: ThinkCentre → Cloudflare migration notes
description: Tutto quello che è stato fatto sul ThinkCentre con DuckDNS/nginx/TLS da rifare/adattare quando si passa a Cloudflare Tunnel o Cloudflare DNS.
---

# ThinkCentre — Note per migrazione a Cloudflare

## Setup attuale (DuckDNS + Let's Encrypt + nginx)

### Domini configurati
Tutti sotto `bikerlink.duckdns.org`:
- `gh.bikerlink.duckdns.org` → GraphHopper (127.0.0.1:8989) — token `X-GH-Token`
- `valhalla.bikerlink.duckdns.org` → Valhalla (127.0.0.1:8002) — token `X-Valhalla-Key`
- `ollama.bikerlink.duckdns.org` → Ollama (127.0.0.1:11434) — token + header Host fix
- `whisper.bikerlink.duckdns.org` → Whisper (127.0.0.1:9000) — token `X-Whisper-Token`
- `nominatim.bikerlink.duckdns.org` → Nominatim (127.0.0.1:7070) — token
- `tc.bikerlink.duckdns.org` → ThinkCentre Agent (127.0.0.1:9101) — token `X-Agent-Token`
- `bkredis.bikerlink.duckdns.org:6380` → Redis TLS (nginx stream, 127.0.0.1:6379) — **porta 6380 NON ancora forwarded sul router**

### Cert TLS
- Emesso da Let's Encrypt via certbot `--standalone` (nginx fermato 10s durante rinnovo)
- Cert path: `/etc/letsencrypt/live/bikerlink/fullchain.pem`
- Copre tutti e 6 i sottodomini sopra (SAN multi-domain)
- Rinnovo: `certbot renew` (cron automatico)
- Vecchio cert separato: `/etc/letsencrypt/live/bikerlink.duckdns.org/` — ancora attivo per il config graphhopper legacy

### nginx
- Config attivo: `/etc/nginx/sites-enabled/bikerlink` (569 righe, repo: `infra/self-host/expose/nginx-bikerlink.conf`)
- Config legacy ancora attivo: `/etc/nginx/sites-enabled/graphhopper` — serve `bikerlink.duckdns.org` con routing path-based (da rimuovere, vedi task #3662)
- **CRITICO**: tutti i `server` block usano `listen 192.168.1.35:443 ssl;` — NON `listen 443 ssl;`
- Rate limiting zone: `gh_limit`, `valhalla_limit`, `ollama_limit`, `whisper_limit`, `nominatim_limit`, `tc_limit`
- Log separati per servizio: `/var/log/nginx/<service>-access.log` e `<service>-auth-fail.log`

### ThinkCentre Agent
- Processo: `pm2` → `bikerlink-agent` → `thinkcentre-agent/server.js` (PORT=9101)
- Espone: `GET /sys-metrics` → CPU loadAvg, RAM, uptime
- Token: `THINKCENTRE_AGENT_TOKEN` (in Replit Secrets)

### Env Replit (secret)
- `THINKCENTRE_METRICS_URL` = `https://tc.bikerlink.duckdns.org`
- `THINKCENTRE_AGENT_TOKEN` = token agente
- `GRAPHHOPPER_TOKEN` = token GH
- `VALHALLA_API_KEY` = token Valhalla
- `WHISPER_TOKEN` = token Whisper
- `NOMINATIM_TOKEN` = token Nominatim
- `OLLAMA_TOKEN` = token Ollama
- `OLLAMA_URL` = `https://ollama.bikerlink.duckdns.org`
- `REDIS_URL` = `rediss://...@bkredis.bikerlink.duckdns.org:6380` (**non funziona ancora** — porta 6380 non forwarded)

---

## Con Cloudflare — cosa cambia

### Opzione A: Cloudflare Tunnel (cloudflared)
Nessun port forwarding sul router, nessun IP pubblico esposto.
1. Installa `cloudflared` sul ThinkCentre
2. Crea un tunnel: `cloudflared tunnel create bikerlink`
3. Mappa ogni sottodominio → `http://127.0.0.1:<porta>` nel config tunnel
4. **Non serve più nginx** per l'esposizione — cloudflared fa da reverse proxy diretto
5. **Non serve più Let's Encrypt** — Cloudflare gestisce i cert (Edge Certificate)
6. **Non serve più DuckDNS** — Cloudflare gestisce i DNS

Attenzione:
- Cloudflare Tunnel NON supporta TCP grezzo (Redis) → per Redis usare Cloudflare Spectrum (a pagamento) o mantieni tunnel separato con `cloudflared access tcp`
- I token di autenticazione (`X-GH-Token` ecc.) possono essere sostituiti con Cloudflare Access (zero-trust) o mantenuti come header custom
- Ollama ha un fix speciale `proxy_set_header Host "localhost"` — con cloudflared il problema non esiste (connessione diretta localhost)

### Opzione B: Cloudflare DNS + IP pubblico (come ora, solo DNS)
Sostituisce solo DuckDNS, mantieni nginx + Let's Encrypt.
1. Aggiungi dominio `bikerlink.it` (o simile) su Cloudflare
2. Record A: `gh.bikerlink.it` → IP pubblico ThinkCentre (con proxy orange = CDN, oppure DNS-only = grey)
3. **Se proxy orange**: Cloudflare termina TLS → backend vede HTTP, non HTTPS → nginx deve accettare HTTP interno O usare `ssl_certificate` di Cloudflare Origin
4. **Se DNS-only**: nginx mantiene Let's Encrypt, tutto invariato
5. Aggiorna tutti i secret Replit con i nuovi URL (`gh.bikerlink.it` ecc.)

### Cosa NON cambia (in entrambe le opzioni)
- I servizi interni (GH, Valhalla, Ollama ecc.) rimangono sulle stesse porte locali
- I token di autenticazione possono restare invariati
- Il ThinkCentre Agent (`thinkcentre-agent/server.js`, PORT=9101) resta identico
- `server/routes/admin/thinkcentre-metrics.ts` e tutti i route file lato Replit restano identici
- `THINKCENTRE_AGENT_TOKEN` resta necessario (autenticazione dell'agent)

### File da aggiornare a migrazione completata
- `infra/self-host/expose/nginx-bikerlink.conf` (se si mantiene nginx)
- Tutti i secret Replit con i nuovi URL
- `server/routes/admin/thinkcentre-metrics.ts` — solo se cambia il nome dell'env var
- `MEMORY.md` — aggiornare/eliminare questa nota

---

## Why (perché è stato scelto DuckDNS invece di Cloudflare)
Soluzione veloce e gratuita per esporre i servizi del ThinkCentre senza modificare il dominio principale (`bikerlink.it`/`bikerlink.duckdns.org`). La migrazione a Cloudflare è pianificata per quando il progetto è più maturo.
