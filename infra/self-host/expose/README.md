# Esporre i servizi self-host all'app BikerLink

Lo stack self-host avvia GraphHopper, Valhalla, Ollama, Whisper e Nominatim
**solo su `localhost`** del ThinkCentre. L'app BikerLink su Replit gira nel
cloud e non può raggiungere `localhost`: serve esporre tutti i servizi su un
dominio pubblico in HTTPS con autenticazione a token.

> **⚠️ SETUP ATTUALE: Opzione A — Cloudflare Tunnel (ATTIVO).**
> Il ThinkCentre è già esposto via Cloudflare Tunnel (`cloudflared.service`) su
> `*.biker-link.net`. DuckDNS, nginx e certbot sono stati **disabilitati** il
> 29 Giugno 2026. Non sono più necessari né attivi.
> Per dettagli sull'infrastruttura attuale, vedi `.agents/memory/thinkcentre-cloudflare-migration.md`.
> Per il log della disattivazione, vedi `DEPLOY-LOG.md` (prima voce).

---

## Scelta rapida

| | Opzione A — Cloudflare Tunnel | Opzione B — IP statico | **Opzione C — DuckDNS** |
|---|---|---|---|
| IP pubblico statico richiesto | ❌ no | ✅ sì | ❌ no |
| Aprire porte router | ❌ no | ✅ sì | ✅ 80/443 |
| Dipendenza da servizio terzo | Cloudflare | — | DuckDNS (aggiornamento DNS) |
| TLS | gestito da Cloudflare | certbot | certbot |
| **Ideale per** | CG-NAT / IP dinamico | VPS | **casa con IP dinamico** |

---

## 0. Genera i token (una tantum)

Prima di qualsiasi setup, genera un token segreto per ogni servizio.
Esegui questo **sul ThinkCentre** (o sul tuo PC):

```bash
# Esegui una riga alla volta e salva i valori
openssl rand -base64 32   # → GRAPHHOPPER_TOKEN
openssl rand -base64 32   # → VALHALLA_API_KEY
openssl rand -base64 32   # → OLLAMA_TOKEN
openssl rand -base64 32   # → WHISPER_TOKEN
openssl rand -base64 32   # → NOMINATIM_TOKEN
```

Oppure usa lo script che genera e salva tutto automaticamente:

```bash
cd infra/self-host/expose
./setup-expose.sh --gen-tokens
```

---

## Opzione C — DuckDNS + Nginx + Let's Encrypt (consigliata)

Questa sezione ti guida passo passo. Esegui ogni passo nell'ordine indicato.

### Passo 1 — Registra il sottodominio su DuckDNS

1. Vai su **https://www.duckdns.org** e accedi con Google/GitHub.
2. Nella sezione "domains" digita il nome che vuoi (es. `bikerlink`) e clicca
   **"add domain"**.
3. Annota il tuo **token DuckDNS** che trovi in cima alla pagina (stringa tipo
   `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`).
4. Il tuo hostname base sarà: `bikerlink.duckdns.org`

   I cinque sottodomini esposti saranno:
   - `gh.bikerlink.duckdns.org` — GraphHopper
   - `valhalla.bikerlink.duckdns.org` — Valhalla
   - `ollama.bikerlink.duckdns.org` — Ollama AI
   - `whisper.bikerlink.duckdns.org` — Whisper ASR
   - `nominatim.bikerlink.duckdns.org` — Nominatim

   > DuckDNS gestisce un solo record A per dominio (es. `bikerlink.duckdns.org`).
   > I sottodomini `gh.`, `valhalla.`, ecc. sono sottodomini **wildcard** che
   > puntano tutti allo stesso IP del ThinkCentre — nginx li separa poi
   > internamente tramite `server_name`.

### Passo 2 — Installa lo script di aggiornamento IP sul ThinkCentre

Esegui questi comandi **sul ThinkCentre** (un terminale è sufficiente):

```bash
# 1. Crea la cartella di lavoro
sudo mkdir -p /opt/bikerlink/expose

# 2. Copia lo script di aggiornamento DuckDNS
sudo cp infra/self-host/expose/duckdns-update.sh /opt/bikerlink/expose/
sudo chmod +x /opt/bikerlink/expose/duckdns-update.sh

# 3. Crea il file di configurazione con le tue credenziali DuckDNS
#    (sostituisci i valori tra <...> con i tuoi dati reali)
sudo tee /etc/duckdns.env > /dev/null <<'EOF'
DUCKDNS_TOKEN=<il-tuo-token-duckdns>
DUCKDNS_DOMAIN=bikerlink
EOF
sudo chmod 600 /etc/duckdns.env

# 4. Testa subito lo script (deve rispondere "IP aggiornato OK" o "Nessun cambio")
sudo /opt/bikerlink/expose/duckdns-update.sh
```

### Passo 3 — Installa il timer systemd (aggiornamento ogni 5 minuti)

```bash
# 1. Copia i file systemd
sudo cp infra/self-host/expose/duckdns.service /etc/systemd/system/
sudo cp infra/self-host/expose/duckdns.timer   /etc/systemd/system/

# 2. Attiva e avvia il timer
sudo systemctl daemon-reload
sudo systemctl enable --now duckdns.timer

# 3. Verifica che il timer sia attivo
sudo systemctl status duckdns.timer
# Devono apparire "active (waiting)" e la prossima scadenza

# 4. Controlla i log dell'ultimo aggiornamento
sudo journalctl -u duckdns.service -n 10
```

### Passo 4 — Apri le porte 80 e 443 sul router

Devi fare il **port forwarding** nel pannello di admin del tuo router:

1. Apri il browser e vai all'indirizzo del router (di solito `192.168.1.1`
   oppure `192.168.0.1`).
2. Cerca la sezione **"Port Forwarding"**, **"Inoltro porte"** o **"NAT"**.
3. Aggiungi due regole:

   | Porta esterna | Porta interna | IP interno (ThinkCentre) | Protocollo |
   |---|---|---|---|
   | 80 | 80 | es. `192.168.1.100` | TCP |
   | 443 | 443 | es. `192.168.1.100` | TCP |

   > L'IP interno del ThinkCentre lo trovi con: `ip addr show | grep "inet "`

4. Salva e verifica con:
   ```bash
   # Da un altro PC o telefono (non dal ThinkCentre stesso)
   curl -I http://bikerlink.duckdns.org
   # Deve rispondere (anche con errore nginx) — se va in timeout la porta non è aperta
   ```

### Passo 5 — Installa Nginx sul ThinkCentre

```bash
# 1. Installa nginx e certbot
sudo apt update
sudo apt install -y nginx certbot python3-certbot-nginx

# 2. Ferma nginx temporaneamente (certbot ne ha bisogno per la challenge HTTP-01)
sudo systemctl stop nginx
```

### Passo 6 — Genera i certificati TLS con certbot

Un **unico** certificato SAN copre tutti e 5 i sottodomini. Il flag
`--cert-name bikerlink` garantisce che il lineage si chiami sempre `bikerlink`
indipendentemente dall'ordine dei `-d`: nginx punta a
`/etc/letsencrypt/live/bikerlink/` per tutti i server block.

```bash
# Sostituisci "bikerlink.duckdns.org" con il tuo dominio DuckDNS
sudo certbot certonly --standalone --cert-name bikerlink \
  -d gh.bikerlink.duckdns.org \
  -d valhalla.bikerlink.duckdns.org \
  -d ollama.bikerlink.duckdns.org \
  -d whisper.bikerlink.duckdns.org \
  -d nominatim.bikerlink.duckdns.org \
  --agree-tos --non-interactive --email tua@email.com

# Verifica che i certificati siano stati creati
sudo ls /etc/letsencrypt/live/bikerlink/
# Devono esserci: cert.pem  chain.pem  fullchain.pem  privkey.pem
```

> Se il comando fallisce con "connection refused": la porta 80 non è ancora
> aperta sul router (Passo 4) oppure nginx è ancora in ascolto sulla 80.
> Assicurati di aver fermato nginx con `sudo systemctl stop nginx` prima di
> eseguire questo comando.

> Se hai già registrato `bikerlink.duckdns.org` su DuckDNS e il Passo 4
> (port forwarding) è fatto correttamente, certbot troverà il dominio e
> emetterà il certificato automaticamente.

### Passo 6b — Attiva il rinnovo automatico dei certificati

I certificati Let's Encrypt scadono ogni **90 giorni**. Installa il timer
systemd incluso nel progetto per rinnovarli in automatico due volte al giorno:

```bash
sudo cp infra/self-host/expose/certbot-renew.service /etc/systemd/system/
sudo cp infra/self-host/expose/certbot-renew.timer   /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now certbot-renew.timer

# Verifica e test
sudo systemctl status certbot-renew.timer   # deve mostrare "active (waiting)"
sudo certbot renew --dry-run                # simula il rinnovo senza toccare nulla
```

Per i dettagli completi (jitter, deploy-hook, troubleshooting) vedi
**Passo 5b** in `MIGRA-DA-TAILSCALE.md`.

### Passo 7 — Genera e installa la configurazione Nginx

Esegui lo script **dalla cartella del progetto** (non sul ThinkCentre, ma
dove hai il repository):

```bash
cd infra/self-host/expose

# Modalità interattiva (chiede dominio e token uno alla volta):
./setup-expose.sh

# Oppure tutto in una riga (modalità non-interattiva):
NONINTERACTIVE=1 \
  BASE_DOMAIN=bikerlink.duckdns.org \
  APP_ORIGIN=https://bikerlink.app \
  ./setup-expose.sh
```

Lo script produce `generated/nginx-bikerlink.conf` con tutti i token già
inseriti. Copialo sul ThinkCentre:

```bash
# 1. Copia il config generato
sudo cp infra/self-host/expose/generated/nginx-bikerlink.conf \
       /etc/nginx/sites-available/bikerlink

# 2. Attiva il sito
sudo ln -sf /etc/nginx/sites-available/bikerlink \
            /etc/nginx/sites-enabled/bikerlink

# 3. (Opzionale) Rimuovi il sito default se presente
sudo rm -f /etc/nginx/sites-enabled/default

# 4. Testa la sintassi e riavvia nginx
sudo nginx -t && sudo systemctl start nginx && sudo systemctl enable nginx
```

### Passo 8 — Verifica che tutto funzioni

Usa lo script di test incluso — fa un giro completo su tutti i servizi
(DNS, TLS, auth 401, connettività con token, timer DuckDNS) e stampa
✓ / ✗ per ogni check:

```bash
# Sul ThinkCentre, dalla cartella del progetto:
chmod +x infra/self-host/expose/test-connectivity.sh

BASE_DOMAIN=bikerlink.duckdns.org \
  infra/self-host/expose/test-connectivity.sh
```

Lo script legge i token automaticamente da `.env.local` se presente.
Per vedere le risposte complete dei servizi: `VERBOSE=1 ./test-connectivity.sh`

Il giro di test copre 6 sezioni:
1. **DNS** — tutti e 5 i sottodomini risolvono all'IP del ThinkCentre
2. **TLS** — certificato Let's Encrypt valido su ogni sottodominio
3. **Auth** — senza token ogni servizio risponde 401 (token funzionante)
4. **Connettività** — con token ogni servizio risponde 2xx
5. **Rate-limit** — header di rate-limiting presenti su ollama e whisper
6. **Timer DuckDNS** — `duckdns.timer` attivo con la prossima scadenza

Se tutti i check mostrano ✓ l'infrastruttura è operativa e puoi procedere
al Passo 9 (aggiornamento Secrets Replit).

### Passo 9 — Aggiorna i Secrets di Replit

Vai su **Replit → Secrets** del progetto e imposta (o aggiorna) queste variabili:

```
GRAPHHOPPER_URL=https://gh.bikerlink.duckdns.org
GRAPHHOPPER_TOKEN=<il valore generato al Passo 0>

VALHALLA_URL=https://valhalla.bikerlink.duckdns.org
VALHALLA_API_KEY=<il valore generato al Passo 0>

OLLAMA_URL=https://ollama.bikerlink.duckdns.org
OLLAMA_TOKEN=<il valore generato al Passo 0>

WHISPER_URL=https://whisper.bikerlink.duckdns.org
WHISPER_TOKEN=<il valore generato al Passo 0>

NOMINATIM_URL=https://nominatim.bikerlink.duckdns.org
NOMINATIM_TOKEN=<il valore generato al Passo 0>
```

Dopo aver salvato i Secrets, **riavvia il backend** di Replit perché i nuovi
valori vengano caricati.

---

## Opzione A — Cloudflare Tunnel (alternativa per chi è dietro CG-NAT)

Nessuna porta da aprire sul router, funziona anche dietro CG-NAT.

1. Installa `cloudflared` e crea il tunnel (vedi le istruzioni in testa a
   `cloudflared-config.yml`).
2. Crea i record DNS:
   ```bash
   cloudflared tunnel route dns bikerlink gh.bikerlink.app
   cloudflared tunnel route dns bikerlink valhalla.bikerlink.app
   cloudflared tunnel route dns bikerlink ollama.bikerlink.app
   cloudflared tunnel route dns bikerlink whisper.bikerlink.app
   cloudflared tunnel route dns bikerlink nominatim.bikerlink.app
   ```
3. Copia `cloudflared-config.yml` in `/etc/cloudflared/config.yml`, sostituisci
   `__TUNNEL_UUID__` e `__BASE_DOMAIN__`, poi:
   ```bash
   sudo cloudflared service install
   sudo systemctl enable --now cloudflared
   ```

---

## Opzione B — Nginx + IP statico (VPS o IP fisso)

1. Punta i record DNS `A`/`AAAA` di tutti i sottodomini all'IP pubblico.
2. Genera il config con `setup-expose.sh` e seguire i Passi 5-9 dell'Opzione C
   (senza il Passo DuckDNS e senza il timer systemd).

---

## Generazione automatica dei config

Invece di sostituire i segnaposto a mano, usa lo script `setup-expose.sh`:

```bash
chmod +x setup-expose.sh
./setup-expose.sh
```

Modalità non-interattiva:

```bash
NONINTERACTIVE=1 BASE_DOMAIN=bikerlink.duckdns.org APP_ORIGIN=https://bikerlink.app \
  TUNNEL_UUID=<uuid> ./setup-expose.sh
```

Variabili opzionali: `GRAPHHOPPER_TOKEN`, `VALHALLA_API_KEY`, `OLLAMA_TOKEN`,
`WHISPER_TOKEN`, `NOMINATIM_TOKEN` (override del `.env.local`),
`ENV_LOCAL_FILE` (percorso alternativo), `SKIP_TOKEN_VALIDATION=1`.

---

## Troubleshooting

- **401 anche con token** → il token del proxy non coincide con quello nei
  Secrets Replit, oppure non hai ricaricato nginx dopo la modifica.
- **502/504** → il container del servizio non è up: `docker compose ps`,
  controlla che GraphHopper/Ollama/ecc. siano in ascolto sulla porta corretta.
- **CORS bloccato dal browser** → aggiorna `__APP_ORIGIN__` con l'origin esatto
  dell'app (incluso schema). Le chiamate server-to-server da Replit non hanno
  problemi CORS; questo conta solo per chiamate dirette dal browser.
- **certbot: connection refused** → la porta 80 non è aperta sul router
  (Passo 4) o nginx non è fermo durante `certbot certonly --standalone`.
- **DuckDNS: IP non aggiorna** → verifica `/etc/duckdns.env` e testa
  manualmente: `sudo /opt/bikerlink/expose/duckdns-update.sh`
- **journalctl -u duckdns.service** → mostra i log degli ultimi aggiornamenti IP.
