# ThinkCentre Home Server — Guida Operativa

> ⚠️ **DOCUMENTO STORICO (superato il 29 Giugno 2026).** Le sezioni su DuckDNS,
> nginx (reverse proxy + stream TLS) e i certificati Let's Encrypt descrivono il
> **vecchio** stack di esposizione, ormai **dismesso**. L'esposizione attiva è
> ora **solo Cloudflare Tunnel** su `*.biker-link.net` (vedi sezione 11 e
> `infra/self-host/expose/DEPLOY-LOG.md`). Le parti hardware/OS/servizi/DragonflyDB
> locale restano valide; ignora i passi DuckDNS+nginx+certbot se non per contesto storico.

> Guida operativa per il mini-PC ThinkCentre (`192.168.1.35`) che ospita i servizi self-hosted di BikerLink: GraphHopper, Ollama, Whisper, Nominatim, Valhalla e DragonflyDB (Redis-compatible).
>
> Esposizione esterna **attuale**: Cloudflare Tunnel su `*.biker-link.net`. (Storico: DuckDNS `bikerlink.duckdns.org` + nginx reverse proxy HTTPS, dismesso il 29 Giugno 2026.)

---

## Indice

1. [Hardware e OS](#1-hardware-e-os)
2. [Servizi Ospitati](#2-servizi-ospitati)
3. [Mappa Porte](#3-mappa-porte)
4. [Redis — Installazione e Configurazione](#4-redis--installazione-e-configurazione)
5. [Nginx — Reverse Proxy e Stream TLS](#5-nginx--reverse-proxy-e-stream-tls)
6. [Firewall (ufw)](#6-firewall-ufw)
7. [ufw-status Health Daemon](#7-ufw-status-health-daemon)
8. [ThinkCentre Metrics Agent](#8-thinkcentre-metrics-agent)
9. [Certificati Let's Encrypt (DuckDNS)](#9-certificati-lets-encrypt-duckdns)
10. [Rotazione Password Redis](#10-rotazione-password-redis)
11. [Migrazione futura — Cloudflare Tunnel](#11-migrazione-futura--cloudflare-tunnel)
12. [Checklist Verifica Finale](#12-checklist-verifica-finale)

---

## 1. Hardware e OS

| Parametro | Valore |
|---|---|
| Modello | Lenovo ThinkCentre (mini-PC) |
| IP locale | `192.168.1.35` |
| OS | Ubuntu 22.04 / 24.04 LTS |
| Esposizione | Cloudflare Tunnel → `*.biker-link.net` (storico: DuckDNS `bikerlink.duckdns.org`, dismesso) |
| Ruolo | Server self-hosted BikerLink |

---

## 2. Servizi Ospitati

| Servizio | Porta locale | Esposto via nginx | Scopo |
|---|---|---|---|
| GraphHopper (7 aree) | `8990–8996` | HTTPS `/areas/<codice>/*` | Routing moto curvy per area |
| Valhalla | `8002` | HTTPS `/valhalla/*` | Routing moto nativo |
| Ollama | `11434` | HTTPS `/ollama/*` | LLM locale (AI) |
| Whisper ASR | `9000` | HTTPS `/whisper/*` | Trascrizione audio |
| Nominatim | `8080` | HTTPS `/nominatim/*` | Geocoding OSM |
| **Redis** | **`6379`** | **Stream TLS `:6380`** | **Cache, BullMQ, pub/sub** |
| **Open WebUI (Bowie)** | **`3010`** | **Cloudflare Tunnel `ai.biker-link.net`** | **GUI Ollama — solo loopback** |

---

## 3. Mappa Porte

| Porta | Protocollo | Servizio | Visibilità |
|---|---|---|---|
| 22 | TCP | SSH | Solo LAN 192.168.1.0/24 + rate limit |
| 80 | TCP | HTTP → HTTPS redirect | Internet |
| 443 | TCP | HTTPS (nginx proxy tutti i servizi) | Internet |
| **6380** | **TCP** | **Redis TLS (nginx stream proxy)** | **Internet** |
| 8002 | TCP | Valhalla | Solo LAN |
| 8080 | TCP | Nominatim | Solo LAN |
| 8990–8996 | TCP | GraphHopper (7 aree regionali) | Solo LAN |
| 11434 | TCP | Ollama | Solo LAN |
| 9000 | TCP | Whisper ASR | Solo LAN |
| 9099 | TCP | ufw-status daemon | Solo localhost |
| 6379 | TCP | Redis plaintext | **Solo localhost** |
| 5432 | TCP | PostgreSQL | **Solo localhost** |
| 3010 | TCP | Open WebUI (Bowie) | **Solo localhost** (bind `127.0.0.1`) |

> **Nota router:** Il port forwarding per la porta 6380 deve essere configurato sul router di casa: `Esterno:6380 → 192.168.1.35:6380`.

---

## 4. Redis — Installazione e Configurazione

> **⚠️ Stato attuale: DragonflyDB self-hosted (Task #5244).** Redis è stato
> **sostituito da DragonflyDB** (drop-in Redis-compatible) che gira sul ThinkCentre
> ed è raggiunto dal backend tramite la secret **`TC_DRAGONFLY_URL`** (esposizione via
> **Cloudflare Tunnel**, non più DuckDNS). L'app **non usa più Upstash** né il
> vecchio container `redis:7-alpine`. Tutta la sezione che segue (container
> `redis:7-alpine`, porta 6380, nginx stream TLS su DuckDNS, rotazione password)
> descrive il **vecchio setup self-hosted ormai dismesso** e resta solo come
> **contesto storico**: non va più eseguita.

### Architettura (legacy self-hosted — non più usato dall'app in produzione)

```
Replit production
   └─ REDIS_URL=rediss://:<password>@bikerlink.duckdns.org:6380
          │ TLS (rediss://)
          ▼
nginx stream (porta 6380, TLS con cert Let's Encrypt)
          │ plaintext
          ▼
Redis locale (127.0.0.1:6379, requirepass)
```

- Redis gira come **container Docker** (`bikerlink-redis`, immagine `redis:7-alpine`)
- Ascolta **solo su `127.0.0.1:6379`** — mai esposto raw su internet
- nginx stream module termina il TLS e fa forward a localhost:6379
- Porta esterna **6380** (non-standard, riduce rumore da scanner automatici)
- Autenticazione: `requirepass` con password forte (da `infra/self-host/.env`)
- Limite memoria: `1gb`, policy **`noeviction`** (richiesto da BullMQ)

### Avvio / Verifica container

```bash
# Avvia (dalla directory infra/self-host/)
docker compose up -d redis

# Stato
docker ps | grep bikerlink-redis

# Log
docker logs bikerlink-redis --tail 50
```

### Verifica manuale

```bash
# Test connessione locale
docker exec bikerlink-redis redis-cli -a "<REDIS_PASSWORD>" --no-auth-warning ping
# Atteso: PONG

# Test policy eviction
docker exec bikerlink-redis redis-cli -a "<REDIS_PASSWORD>" --no-auth-warning \
  config get maxmemory-policy
# Atteso: noeviction

# Test connessione TLS remota (da qualsiasi macchina)
redis-cli -h bikerlink.duckdns.org -p 6380 --tls -a "<REDIS_PASSWORD>" --no-auth-warning ping
# Atteso: PONG
```

### Variabile d'ambiente su Replit

Imposta la secret `REDIS_URL` su Replit (mai nel codice):

```
REDIS_URL=rediss://:<REDIS_PASSWORD>@bikerlink.duckdns.org:6380
```

> **Nota `rediss://`** (con doppia s): indica connessione TLS. Il backend lo gestisce
> automaticamente tramite `server/cache/redis.ts` con ioredis.

Dopo aver impostato `REDIS_URL`, riavvia il backend Replit e verifica che il log mostri:

```
[Redis] connected and ready
```

invece del messaggio di fallback:

```
[Redis] REDIS_URL not set — running in fallback (in-memory) mode
```

---

## 5. Nginx — Reverse Proxy e Stream TLS

### File di configurazione Redis stream

Percorso reale sul ThinkCentre: `/etc/nginx/stream.conf.d/redis.conf`

```nginx
upstream redis_backend {
    server 127.0.0.1:6379;
}

server {
    listen 6380 ssl;

    ssl_certificate     /etc/letsencrypt/live/bikerlink.duckdns.org/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/bikerlink.duckdns.org/privkey.pem;

    ssl_protocols       TLSv1.2 TLSv1.3;
    ssl_ciphers         HIGH:!aNULL:!MD5;

    proxy_pass          redis_backend;
    proxy_timeout       10s;
    proxy_connect_timeout 5s;
}
```

### Blocco stream in nginx.conf

Il blocco `stream {}` deve essere a livello root di `nginx.conf`, **fuori dal blocco `http {}`**:

```nginx
# ...blocco http { ... }

stream {
    include /etc/nginx/stream.conf.d/*.conf;
}
```

### Verifica nginx

```bash
sudo nginx -t          # Testa la configurazione
sudo systemctl reload nginx  # Ricarica senza downtime
```

---

## 6. Firewall (ufw)

Esegui lo script ufw per applicare tutte le regole:

```bash
sudo bash scripts/setup-ufw-thinkcentre.sh
```

Lo script è **idempotente**: può essere rieseguito senza danni in qualsiasi momento.

### Cosa configura

| Servizio | Porta | Visibilità |
|---|---|---|
| nginx | 80, 443 | Internet |
| SSH | 22 | Solo LAN 192.168.1.0/24 + rate limit |
| Tailscale | — | `allow in on tailscale0` (interfaccia intera) |
| GraphHopper (7 aree) | 8990–8996 | Solo LAN |
| Valhalla | 8002 | Solo LAN |
| Nominatim | 8080 | Solo LAN |
| Ollama | 11434 | Solo LAN |
| Whisper | 9000 | Solo LAN |
| ufw-status daemon | 9099 | Solo localhost |
| PostgreSQL | 5432 | Solo localhost |
| Redis TLS (nginx stream) | 6380 | Internet |
| Redis raw | 6379 | Solo localhost |
| Open WebUI (Bowie) | 3010 | Solo localhost (bind `127.0.0.1`) |
| Ollama (da Docker bridge) | 11434 | Solo LAN + `172.17.0.0/16` (Docker bridge) |
| Uptime Kuma *(futuro)* | 3001 | Commentato |

### Verifica stato

```bash
sudo ufw status verbose
curl -s http://localhost:9099/
systemctl status bikerlink-ufw-status
```

### Aggiungere porte future

Decommentare le righe nel file `scripts/setup-ufw-thinkcentre.sh` e rieseguirlo, oppure aggiungere manualmente:

```bash
# Uptime Kuma (quando installato)
sudo ufw allow from 192.168.1.0/24 to any port 3001 proto tcp

sudo ufw status verbose
```

> **Tailscale**: la regola `allow in on tailscale0` apre l'intera interfaccia VPN. Non serve aggiungere regole per porta per servizi raggiungibili via Tailscale — la whitelist LAN/localhost si applica solo alle connessioni dirette sulla rete fisica.

---

## 7. ufw-status Health Daemon

Lo script installa automaticamente un piccolo daemon Python (`/opt/bikerlink/ufw-status-daemon.py`) gestito da systemd. Ascolta su `127.0.0.1:9099` e risponde con lo stato ufw in JSON.

### Endpoint

```
GET http://localhost:9099/
→ { "status": "active"|"inactive", "ruleCount": <N> }

GET http://localhost:9099/health
→ 200 OK
```

### Nginx — esporre l'endpoint via Tailscale

Aggiungere il blocco seguente al server block principale nginx (porta 443):

```nginx
location /ufw-status {
    allow 100.64.0.0/10;   # range Tailscale
    allow 192.168.1.0/24;  # LAN locale
    deny all;

    proxy_pass http://127.0.0.1:9099/;
    proxy_set_header Host "localhost";
    proxy_read_timeout 8s;
    proxy_connect_timeout 4s;
}
```

Poi ricaricare nginx:

```bash
sudo nginx -t && sudo systemctl reload nginx
```

### Configurare il pannello admin BikerLink

In Replit → Secrets, aggiungere:

```
UFW_STATUS_URL = https://<host-thinkcentre>/ufw-status
```

Il pannello admin mostrerà il badge **Firewall (ufw)** nella card "Server di casa" con stato `active` (verde) / `inactive` (giallo) / `unreachable` (rosso).

---

## 8. ThinkCentre Metrics Agent

L'agent Node.js (porta 9101) è esposto su `tc.bikerlink.duckdns.org` via nginx HTTPS.
Replit si connette con `THINKCENTRE_METRICS_URL=https://tc.bikerlink.duckdns.org` e header `X-Agent-Token`.

### Setup (una tantum sul ThinkCentre)

```bash
# 1. Aggiorna DuckDNS: aggiungi sottodominio "tc" puntato allo stesso IP
#    (pannello https://www.duckdns.org — stesso IP di bikerlink, valhalla, ecc.)

# 2. Esegui lo script come root dalla directory repo
sudo bash scripts/setup-nginx-tc-metrics.sh

# Lo script espande il certificato bikerlink, aggiorna il conf nginx e
# stampa il token generato. Copia il token nei secret Replit.

# 3. Verifica la connessione (sostituisci TOKEN con quello stampato dallo script)
curl -s -H "X-Agent-Token: TOKEN" https://tc.bikerlink.duckdns.org/sys-metrics | jq .
# → { "cpu": {...}, "memory": {...}, "uptimeSec": ... }

# 4. Aggiorna i secret su Replit:
#    THINKCENTRE_METRICS_URL = https://tc.bikerlink.duckdns.org
#    THINKCENTRE_AGENT_TOKEN = <token stampato dallo script>
```

### Verifica agent attivo

```bash
# L'agent deve girare sul ThinkCentre (avviato come servizio o in tmux)
node scripts/thinkcentre-agent/index.js
# oppure, se hai il systemd service:
systemctl status bikerlink-tc-agent
```

---

## 9. Certificati Let's Encrypt (DuckDNS)

Se i certificati non sono ancora stati ottenuti:

```bash
# Installa certbot
sudo apt install -y certbot

# Ottieni il certificato (challenge HTTP — richiede porta 80 aperta)
sudo certbot certonly --standalone -d bikerlink.duckdns.org

# Oppure usa il plugin nginx
sudo apt install -y python3-certbot-nginx
sudo certbot --nginx -d bikerlink.duckdns.org

# Verifica rinnovo automatico
sudo certbot renew --dry-run
```

I certificati si trovano in `/etc/letsencrypt/live/bikerlink.duckdns.org/`.

### Rinnovo manuale

```bash
certbot renew --quiet
systemctl reload nginx
```

---

## 10. Rotazione Password Redis

Per cambiare la password Redis:

```bash
# 1. Genera una nuova password forte (es. 48 caratteri)
openssl rand -base64 36

# 2. Aggiorna infra/self-host/.env
#    REDIS_PASSWORD=<nuova_password>

# 3. Riavvia il container per applicare la nuova config
cd infra/self-host/
docker compose up -d redis

# 4. Aggiorna immediatamente il secret REDIS_URL su Replit con la nuova password
#    rediss://:<nuova_password>@bikerlink.duckdns.org:6380

# 5. Riavvia il backend Replit e verifica [Redis] connected
```

> ⚠️ La finestra tra il cambio password e l'aggiornamento del secret Replit causerà
> errori di autenticazione Redis. Minimizzala aggiornando Replit subito dopo il riavvio.

---

## 11. Migrazione futura — Cloudflare Tunnel

> **Quando fare:** quando Cloudflare Tunnel sarà operativo per il ThinkCentre.

Con il tunnel attivo, la porta 6380 non sarà più necessaria:

1. Aggiorna `REDIS_URL` su Replit con l'URL interno del tunnel
2. Rimuovi la regola ufw 6380: `sudo ufw delete allow 6380/tcp`
3. Rimuovi il port forwarding 6380 dal router
4. Rimuovi o commenta `/etc/nginx/stream.conf.d/redis.conf`
5. Ricarica nginx: `sudo systemctl reload nginx`

---

## 12. Checklist Verifica Finale

```bash
# Redis container attivo
docker ps | grep bikerlink-redis             # → Up ...

# Redis risponde localmente
docker exec bikerlink-redis redis-cli \
  -a "<PASSWORD>" --no-auth-warning ping     # → PONG

# Policy eviction corretta (BullMQ richiede noeviction)
docker exec bikerlink-redis redis-cli \
  -a "<PASSWORD>" --no-auth-warning \
  config get maxmemory-policy                # → noeviction

# nginx configurazione valida
sudo nginx -t                                # → syntax ok

# nginx attivo
sudo systemctl is-active nginx              # → active

# Porta 6380 in ascolto
sudo ss -tlnp | grep 6380                  # → LISTEN

# ufw regola attiva
sudo ufw status | grep 6380                # → ALLOW

# Connessione TLS remota
redis-cli -h bikerlink.duckdns.org -p 6380 \
  --tls -a "<PASSWORD>" --no-auth-warning ping  # → PONG

# Log backend Replit
# → [Redis] connected and ready   (NON fallback)
```

---

## Servizi in esecuzione

| Servizio | Porta | Avvio |
|---|---|---|
| nginx | 80, 443 | `systemctl start nginx` |
| Redis | 6379 (container) | `docker compose up -d redis` in `infra/self-host/` |
| GraphHopper (7 istanze) | 8990–8996 | `docker compose up -d graphhopper-<codice>` |
| Valhalla | 8002 | `docker compose up -d valhalla` in `infra/self-host/` |
| Nominatim | 8080 | `docker compose up -d` in `infra/self-host/` |
| Ollama | 11434 | `systemctl start ollama` |
| Whisper | 9000 | `systemctl start whisper` |
| ufw-status daemon | 9099 | `systemctl start bikerlink-ufw-status` |

### Comandi utili

```bash
# Stato completo servizi
systemctl status nginx ollama bikerlink-ufw-status

# Log daemon ufw-status
journalctl -u bikerlink-ufw-status -f

# Riavvio daemon ufw-status
sudo systemctl restart bikerlink-ufw-status
```

---

## Note di sicurezza

- **PostgreSQL** è accessibile solo da `localhost` — non esporre mai la porta 5432 in LAN o internet.
- **SSH** è accessibile solo dalla LAN 192.168.1.0/24 con rate limit integrato (`ufw limit from LAN to port 22` — blocca automaticamente sorgenti che superano 6 connessioni in 30s).
- **Tailscale** va lasciata sempre attiva: è il tunnel sicuro usato da Replit per raggiungere i servizi interni.
- **Redis** ascolta solo su `127.0.0.1:6379` — l'accesso esterno passa esclusivamente via nginx TLS stream su porta 6380 con password obbligatoria.
- **cloudflared** (futuro): è un daemon outbound, non apre porte inbound — nessuna regola ufw da aggiungere.
