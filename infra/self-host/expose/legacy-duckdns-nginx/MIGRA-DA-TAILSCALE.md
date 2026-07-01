# Migrazione Tailscale → DuckDNS sul ThinkCentre

> ⚠️ **DOCUMENTO STORICO (29 giugno 2026).** Descrive una migrazione passata
> (Tailscale → DuckDNS). **DuckDNS è stato a sua volta dismesso**: l'esposizione
> attuale è **Cloudflare Tunnel** su `*.biker-link.net`
> (vedi `cloudflared-config.yml` e `docs/uptime-kuma-cloudflare-tunnel.md`).
> Conservato solo come contesto storico — non seguire questa procedura.

> **Scenario:** i servizi self-hosted (GraphHopper, Valhalla, Ollama, Whisper,
> Nominatim) sono oggi raggiungibili dall'app Replit tramite hostname Tailscale
> (es. `http://100.x.y.z:8989`). Questa guida sposta tutto su URL DuckDNS
> pubblici HTTPS senza nessun downtime: i Secret Replit vengono aggiornati
> **solo all'ultimo passo**, così Tailscale continua a funzionare finché la
> nuova infrastruttura non è verificata.

---

## Checklist rapida

- [ ] **Passo 1** — Registra sottodominio DuckDNS
- [ ] **Passo 2** — Installa `duckdns-update.sh` e il timer systemd
- [ ] **Passo 3** — Apri porte 80/443 sul router (port forwarding)
- [ ] **Passo 4** — Genera i token di autenticazione
- [ ] **Passo 5** — Installa Nginx e ottieni i certificati Let's Encrypt
- [ ] **Passo 5b** — Attiva il rinnovo automatico dei certificati (timer systemd)
- [ ] **Passo 6** — Genera e installa la config Nginx con `setup-expose.sh`
- [ ] **Passo 7** — Verifica con `test-connectivity.sh` (tutti ✓)
- [ ] **Passo 8** — Aggiorna i Secret Replit e riavvia il backend
- [ ] **Passo 9** — Verifica il pannello Admin → ThinkCentre Health (tutto verde)
- [ ] *(Opzionale)* **Passo 10** — Rimuovi le dipendenze Tailscale dai Secret

---

## Passo 1 — Registra il sottodominio su DuckDNS

1. Vai su **https://www.duckdns.org** e accedi con Google o GitHub.
2. Nel campo "domains" digita `bikerlink` e clicca **"add domain"**.
   - Il tuo hostname base sarà: `bikerlink.duckdns.org`
3. Annota il **token DuckDNS** in cima alla pagina
   (formato `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`).

> Se `bikerlink` è già preso, scegli un altro nome (es. `bikerlink-home`).
> Aggiusta di conseguenza `BASE_DOMAIN` nei passi successivi.

I cinque sottodomini esposti saranno:

| Sottodominio | Servizio |
|---|---|
| `gh.bikerlink.duckdns.org` | GraphHopper |
| `valhalla.bikerlink.duckdns.org` | Valhalla |
| `ollama.bikerlink.duckdns.org` | Ollama AI |
| `whisper.bikerlink.duckdns.org` | Whisper ASR |
| `nominatim.bikerlink.duckdns.org` | Nominatim |

---

## Passo 2 — Installa lo script di aggiornamento IP e il timer systemd

Esegui **sul ThinkCentre** (copia prima la cartella del progetto se necessario):

```bash
# 1. Crea la cartella di lavoro
sudo mkdir -p /opt/bikerlink/expose

# 2. Copia lo script
sudo cp infra/self-host/expose/duckdns-update.sh /opt/bikerlink/expose/
sudo chmod +x /opt/bikerlink/expose/duckdns-update.sh

# 3. Crea il file di configurazione (sostituisci i valori tra <...>)
sudo tee /etc/duckdns.env > /dev/null <<'EOF'
DUCKDNS_TOKEN=<il-tuo-token-duckdns>
DUCKDNS_DOMAIN=bikerlink
EOF
sudo chmod 600 /etc/duckdns.env

# 4. Testa subito lo script
sudo /opt/bikerlink/expose/duckdns-update.sh
# Output atteso: "[duckdns] 2026-... — IP aggiornato OK" oppure "Nessun cambio"

# 5. Installa il timer systemd (aggiornamento ogni 5 minuti)
sudo cp infra/self-host/expose/duckdns.service /etc/systemd/system/
sudo cp infra/self-host/expose/duckdns.timer   /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now duckdns.timer

# 6. Verifica
sudo systemctl status duckdns.timer
# Deve mostrare: "active (waiting)"
```

---

## Passo 3 — Apri le porte 80 e 443 sul router

Nel pannello admin del router (di solito `192.168.1.1` o `192.168.0.1`),
cerca **"Port Forwarding"** / **"Inoltro porte"** / **"NAT"** e aggiungi:

| Porta esterna | Porta interna | IP del ThinkCentre | Protocollo |
|---|---|---|---|
| 80 | 80 | es. `192.168.1.100` | TCP |
| 443 | 443 | es. `192.168.1.100` | TCP |

Per trovare l'IP del ThinkCentre:
```bash
ip addr show | grep "inet " | grep -v 127.0.0.1
```

Verifica che le porte siano aperte (da un altro dispositivo o connessione):
```bash
curl -I http://bikerlink.duckdns.org
# Deve rispondere (anche con errore nginx) — timeout = porta non aperta
```

> **Nota:** se il tuo ISP usa CG-NAT non puoi aprire porte pubbliche.
> In quel caso usa l'**Opzione A — Cloudflare Tunnel** descritta nel README.

---

## Passo 4 — Genera i token di autenticazione

I token proteggono i servizi esposti pubblicamente. Generali con lo script
dalla cartella del progetto (non sul ThinkCentre):

```bash
cd infra/self-host/expose
./setup-expose.sh --gen-tokens
```

Lo script scrive i token nel file `../. env.local`. In alternativa, generali a mano:

```bash
openssl rand -base64 32   # → GRAPHHOPPER_TOKEN
openssl rand -base64 32   # → VALHALLA_API_KEY
openssl rand -base64 32   # → OLLAMA_TOKEN
openssl rand -base64 32   # → WHISPER_TOKEN
openssl rand -base64 32   # → NOMINATIM_TOKEN
```

Salvali in `infra/self-host/.env.local`:

```bash
GRAPHHOPPER_TOKEN=<valore>
VALHALLA_API_KEY=<valore>
OLLAMA_TOKEN=<valore>
WHISPER_TOKEN=<valore>
NOMINATIM_TOKEN=<valore>
BASE_DOMAIN=bikerlink.duckdns.org
```

---

## Passo 5 — Installa Nginx e ottieni i certificati Let's Encrypt

```bash
# 1. Installa nginx e certbot (sul ThinkCentre)
sudo apt update
sudo apt install -y nginx certbot python3-certbot-nginx

# 2. Ferma nginx (certbot --standalone usa la porta 80)
sudo systemctl stop nginx

# 3. Ottieni il certificato SAN unico per tutti e 5 i sottodomini
#    Sostituisci "bikerlink.duckdns.org" con il tuo dominio e "tua@email.com"
sudo certbot certonly --standalone --cert-name bikerlink \
  -d gh.bikerlink.duckdns.org \
  -d valhalla.bikerlink.duckdns.org \
  -d ollama.bikerlink.duckdns.org \
  -d whisper.bikerlink.duckdns.org \
  -d nominatim.bikerlink.duckdns.org \
  --agree-tos --non-interactive --email tua@email.com

# 4. Verifica che i certificati siano stati creati
sudo ls /etc/letsencrypt/live/bikerlink/
# Devono esserci: cert.pem  chain.pem  fullchain.pem  privkey.pem
```

**Troubleshooting certbot:**
- `connection refused` → la porta 80 non è aperta (ricontrolla Passo 3) oppure nginx è ancora in ascolto.
- `Too many requests` → Let's Encrypt ha un rate limit di 5 certificati/settimana per dominio. Usa `--staging` per testare.

---

## Passo 5b — Attiva il rinnovo automatico dei certificati

I certificati Let's Encrypt scadono ogni **90 giorni**. Il timer systemd
incluso nel progetto esegue `certbot renew --nginx` due volte al giorno e
ricarica Nginx automaticamente dopo ogni rinnovo riuscito.

```bash
# 1. Copia i file di servizio e timer
sudo cp infra/self-host/expose/certbot-renew.service /etc/systemd/system/
sudo cp infra/self-host/expose/certbot-renew.timer   /etc/systemd/system/

# 2. Ricarica systemd e attiva il timer
sudo systemctl daemon-reload
sudo systemctl enable --now certbot-renew.timer

# 3. Verifica che il timer sia attivo
sudo systemctl status certbot-renew.timer
# Output atteso: "active (waiting)" con la prossima scadenza indicata

# 4. Test manuale (dry-run) — non rinnova davvero, simula soltanto
sudo certbot renew --dry-run
# Output atteso: "Congratulations, all simulated renewals succeeded"

# 5. Controlla i log dell'ultima esecuzione del servizio
sudo journalctl -u certbot-renew.service --no-pager -n 30
```

**Come funziona:**
- Il timer scatta alle **04:30** e alle **16:30** ogni giorno, con un jitter
  casuale fino a 60 minuti per non sovraccaricare i server Let's Encrypt.
- `certbot renew` rinnova automaticamente i certificati solo se mancano
  **meno di 30 giorni** alla scadenza; altrimenti termina senza fare nulla.
- Il flag `--deploy-hook "systemctl reload nginx"` ricarica Nginx soltanto
  quando avviene un rinnovo reale, senza interrompere il traffico.
- `Persistent=true` nel timer assicura che, se il ThinkCentre era spento
  all'orario programmato, l'esecuzione avvenga al successivo avvio.

> **Troubleshooting:** se il dry-run fallisce con `connection refused` sulla
> porta 80, Nginx è già in ascolto e certbot (in modalità `--nginx`) ne prende
> il controllo temporaneamente — questo è normale. Se fallisce per altro,
> controlla che le porte 80/443 siano ancora aperte nel router.

---

## Passo 6 — Genera e installa la config Nginx

Esegui **dalla cartella del progetto** (non sul ThinkCentre):

```bash
cd infra/self-host/expose

# Modalità interattiva:
./setup-expose.sh

# Oppure non-interattiva (tutti i valori via env):
NONINTERACTIVE=1 \
  BASE_DOMAIN=bikerlink.duckdns.org \
  APP_ORIGIN=https://bikerlink.app \
  ./setup-expose.sh
```

Lo script produce `generated/nginx-bikerlink.conf` con tutti i token già inseriti.

Copia il config generato **sul ThinkCentre** e attiva il sito:

```bash
# 1. Copia il config
sudo cp infra/self-host/expose/generated/nginx-bikerlink.conf \
       /etc/nginx/sites-available/bikerlink

# 2. Attiva il sito
sudo ln -sf /etc/nginx/sites-available/bikerlink \
            /etc/nginx/sites-enabled/bikerlink

# 3. Rimuovi il sito default (opzionale ma consigliato)
sudo rm -f /etc/nginx/sites-enabled/default

# 4. Testa la sintassi e avvia nginx
sudo nginx -t && sudo systemctl start nginx && sudo systemctl enable nginx

# 5. Verifica che nginx sia attivo
sudo systemctl status nginx
```

---

## Passo 7 — Verifica con test-connectivity.sh

Esegui lo script di test (dal ThinkCentre o da qualsiasi macchina con accesso a internet):

```bash
chmod +x infra/self-host/expose/test-connectivity.sh

BASE_DOMAIN=bikerlink.duckdns.org \
  infra/self-host/expose/test-connectivity.sh
```

Lo script esegue 6 sezioni di check e stampa `✓` / `✗` per ognuna:

1. **DNS** — tutti e 5 i sottodomini risolvono all'IP del ThinkCentre
2. **TLS** — certificato Let's Encrypt valido su ogni sottodominio
3. **Auth** — senza token ogni servizio risponde 401
4. **Connettività** — con token ogni servizio risponde 2xx
5. **Rate-limit** — header di rate-limiting su Ollama e Whisper
6. **Timer DuckDNS** — `duckdns.timer` attivo con la prossima scadenza

```bash
# Per vedere le risposte complete:
VERBOSE=1 BASE_DOMAIN=bikerlink.duckdns.org \
  infra/self-host/expose/test-connectivity.sh
```

**Procedi al Passo 8 solo quando tutti i check mostrano ✓.**

---

## Passo 8 — Aggiorna i Secret Replit e riavvia il backend

Vai su **Replit → Secrets** del progetto e imposta (o aggiorna) questi valori:

```
GRAPHHOPPER_URL=https://gh.bikerlink.duckdns.org
GRAPHHOPPER_TOKEN=<valore da infra/self-host/.env.local>

VALHALLA_URL=https://valhalla.bikerlink.duckdns.org
VALHALLA_API_KEY=<valore da infra/self-host/.env.local>

OLLAMA_URL=https://ollama.bikerlink.duckdns.org
OLLAMA_TOKEN=<valore da infra/self-host/.env.local>

WHISPER_URL=https://whisper.bikerlink.duckdns.org
WHISPER_TOKEN=<valore da infra/self-host/.env.local>

NOMINATIM_URL=https://nominatim.bikerlink.duckdns.org
NOMINATIM_TOKEN=<valore da infra/self-host/.env.local>
```

Dopo aver salvato i Secret, **riavvia il backend** Replit (workflow "Start Backend")
perché i nuovi valori vengano caricati.

> I vecchi Secret Tailscale (es. `http://100.x.y.z:8989`) vengono semplicemente
> sovrascritti. Tailscale resta installato sul ThinkCentre e continua a funzionare,
> ma l'app non lo usa più.

---

## Passo 9 — Verifica il pannello Admin ThinkCentre Health

Nel pannello admin dell'app BikerLink, apri **Amministrazione → Server di casa
(ThinkCentre)**. Tutti e 5 i servizi devono mostrare:

- Pallino **verde** (online)
- Latenza riportata (non `—`)
- URL mascherato che inizia con `https://`

Se un servizio mostra rosso:
- **401** → il token nel Secret Replit non coincide con quello nel config Nginx. Rigenera con `setup-expose.sh` e aggiorna i Secret.
- **502/504** → il container del servizio non è up: `docker compose ps` e controlla i log.
- **000 / timeout** → il ThinkCentre non è raggiungibile. Verifica che Nginx sia attivo e che le porte siano aperte.

---

## Passo 10 (opzionale) — Rimuovi le dipendenze Tailscale

Una volta verificato che tutto funziona correttamente tramite DuckDNS, puoi
rimuovere i vecchi Secret Tailscale (se presenti con nomi diversi) e, se vuoi,
disinstallare Tailscale dal ThinkCentre:

```bash
# Solo se vuoi rimuovere Tailscale completamente
sudo apt remove --purge tailscale
sudo rm -f /etc/apt/sources.list.d/tailscale.list
```

> **Consiglio:** lascia Tailscale installato ancora per qualche giorno come
> fallback, nel caso emergano problemi con la nuova infrastruttura DuckDNS.

---

## Riepilogo differenze Tailscale vs DuckDNS

| Aspetto | Tailscale | DuckDNS + Nginx |
|---|---|---|
| URL | `http://100.x.y.z:PORT` | `https://servizio.bikerlink.duckdns.org` |
| TLS | No (HTTP in chiaro) | Sì (Let's Encrypt automatico) |
| Autenticazione | Rete privata Tailscale | Token header `X-Servizio-Token` |
| Dipendenza extra | Tailscale daemon su ThinkCentre e Replit | Solo il timer systemd DuckDNS |
| Rate limiting | No | Sì (configurabile per servizio) |
| IP dinamico | Gestito da Tailscale | Gestito da `duckdns-update.sh` ogni 5 min |
| Funziona in deploy Replit | Richiede Tailscale funzionante | Sì (URL pubblici, nessun client VPN) |

---

## Troubleshooting rapido

| Sintomo | Causa probabile | Fix |
|---|---|---|
| `401` anche con token | Token proxy ≠ Secret Replit | Riallinea e ricarica nginx |
| `502`/`504` | Container del servizio giù | `docker compose ps`, riavvia il container |
| `CORS bloccato` | `APP_ORIGIN` non corrisponde | Aggiorna `__APP_ORIGIN__` in `setup-expose.sh` e rigenera |
| `certbot: connection refused` | Porta 80 non aperta o nginx attivo | Ferma nginx, ricontrolla port forwarding |
| `DuckDNS: IP non aggiorna` | Credenziali in `/etc/duckdns.env` errate | Testa: `sudo /opt/bikerlink/expose/duckdns-update.sh` |
| ThinkCentre Health tutto rosso dopo il Passo 8 | Backend non riavviato | Riavvia il workflow "Start Backend" |
