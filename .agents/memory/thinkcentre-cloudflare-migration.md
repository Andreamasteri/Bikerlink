---
name: ThinkCentre → Cloudflare migration notes
description: Migrazione completata da DuckDNS+nginx+LE a Cloudflare Tunnel (cloudflared). Tunnel bikerlink-tc attivo sul TC, dominio biker-link.net su Cloudflare.
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
- `valhalla.biker-link.net`  → `http://127.0.0.1:8003`
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

## Setup precedente (DuckDNS — DISMESSO)
Tutti i vecchi URL `*.bikerlink.duckdns.org` non sono più usati da Replit.
Il DuckDNS timer sul TC può essere disabilitato.
Il certificato Let's Encrypt e nginx rimangono sul TC ma non sono più necessari per l'esposizione esterna.

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

## Why
Cloudflare Tunnel elimina port forwarding sul router, DuckDNS, Let's Encrypt, e nginx per l'esposizione esterna. Zero ingress firewall rules. TLS gestito da Cloudflare Edge. Costo: solo il dominio biker-link.net (~$9-11/anno).
