# ThinkCentre — Server Setup Guide

Guida operativa per il mini-PC self-hosted BikerLink (Ubuntu, LAN 192.168.1.35).

---

## Firewall ufw

### Primo setup

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
| Uptime Kuma *(futuro)* | 3001 | Commentato |

### Verifica stato

```bash
sudo ufw status verbose
curl -s http://localhost:9099/
systemctl status bikerlink-ufw-status
```

---

## Redis — Esposizione pubblica via nginx stream

Redis è esposto su `bkredis.bikerlink.duckdns.org:6380` con TLS tramite nginx stream proxy.
Replit si connette con `rediss://:PASSWORD@bkredis.bikerlink.duckdns.org:6380`.

### Setup (una tantum sul ThinkCentre)

```bash
# 1. Aggiorna DuckDNS: aggiungi sottodominio "bkredis" puntato allo stesso IP
#    (pannello https://www.duckdns.org)

# 2. Esegui lo script di setup come root
sudo bash scripts/setup-redis-nginx-stream.sh

# 3. Verifica la connessione
redis-cli -h bkredis.bikerlink.duckdns.org -p 6380 --tls -a '<password>' ping
# → PONG

# 4. Aggiorna il secret REDIS_URL in Replit:
#    rediss://:PASSWORD@bkredis.bikerlink.duckdns.org:6380
```

### Rinnovo certificato

```bash
certbot renew --quiet
systemctl reload nginx
```

---

## ThinkCentre Metrics Agent — Esposizione pubblica via DuckDNS

L'agent Node.js (porta 9101) è esposto su `tc.bikerlink.duckdns.org` via nginx HTTPS.
Replit si connette con `THINKCENTRE_METRICS_URL=https://tc.bikerlink.duckdns.org` e header `X-Agent-Token`.

### Setup (una tantum sul ThinkCentre)

```bash
# 1. Aggiorna DuckDNS: aggiungi sottodominio "tc" puntato allo stesso IP
#    (pannello https://www.duckdns.org — stesso IP di gh, valhalla, ollama, ecc.)

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

### Aggiungere porte future

Decommentare le righe nel file `scripts/setup-ufw-thinkcentre.sh` e rieseguirlo, oppure aggiungere manualmente:

```bash
# Uptime Kuma (quando installato)
sudo ufw allow from 192.168.1.0/24 to any port 3001 proto tcp

# Redis raw (solo localhost — non aprire verso internet)
sudo ufw allow from 127.0.0.1 to any port 6379 proto tcp

sudo ufw status verbose
```

> **Tailscale**: la regola `allow in on tailscale0` apre l'intera interfaccia VPN. Non serve aggiungere regole per porta per servizi raggiungibili via Tailscale — la whitelist LAN/localhost si applica solo alle connessioni dirette sulla rete fisica.

---

## ufw-status Health Daemon

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

## Servizi in esecuzione

| Servizio | Porta | Avvio |
|---|---|---|
| nginx | 80, 443 | `systemctl start nginx` |
| GraphHopper (7 istanze) | 8990–8996 | `docker-compose up -d` in `infra/self-host/` |
| Valhalla | 8002 | `docker-compose up -d` in `infra/self-host/` |
| Nominatim | 8080 | `docker-compose up -d` in `infra/self-host/` |
| Ollama | 11434 | `systemctl start ollama` |
| Whisper | 9000 | `systemctl start whisper` |
| PostgreSQL | 5432 | `systemctl start postgresql` |
| ufw-status daemon | 9099 | `systemctl start bikerlink-ufw-status` |

### Comandi utili

```bash
# Stato completo servizi
systemctl status nginx ollama bikerlink-ufw-status

# Log daemon ufw-status
journalctl -u bikerlink-ufw-status -f

# Riavvio daemon ufw-status
sudo systemctl restart bikerlink-ufw-status

# Verifica fingerprint token Replit
bash scripts/check-token-fingerprints.sh
```

---

## Note di sicurezza

- **PostgreSQL** è accessibile solo da `localhost` — non esporre mai la porta 5432 in LAN o internet.
- **SSH** è accessibile solo dalla LAN 192.168.1.0/24 con rate limit integrato (`ufw limit from LAN to port 22` — blocca automaticamente sorgenti che superano 6 connessioni in 30s).
- **Tailscale** va lasciata sempre attiva: è il tunnel sicuro usato da Replit per raggiungere i servizi interni.
- **cloudflared** (futuro): è un daemon outbound, non apre porte inbound — nessuna regola ufw da aggiungere.
