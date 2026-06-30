# Uptime Kuma + Cloudflare Tunnel sul ThinkCentre

> Guida operativa per installare **Uptime Kuma** (pannello di monitoraggio uptime) sul ThinkCentre e renderlo accessibile da internet tramite **Cloudflare Tunnel** — senza port forwarding sul router, con HTTPS automatico.
>
> Obiettivo: testare l'infrastruttura Cloudflare Tunnel su un servizio leggero, con un percorso replicabile per migrare altri servizi (GraphHopper, Ollama, Nominatim) in futuro.

---

## Indice

1. [Prerequisiti](#1-prerequisiti)
2. [Uptime Kuma via Docker](#2-uptime-kuma-via-docker)
3. [Account Cloudflare e Dominio](#3-account-cloudflare-e-dominio)
4. [Installazione cloudflared sul ThinkCentre](#4-installazione-cloudflared-sul-thinkcentre)
5. [Configurazione del Tunnel verso Uptime Kuma](#5-configurazione-del-tunnel-verso-uptime-kuma)
6. [Avvio Automatico al Boot (systemd)](#6-avvio-automatico-al-boot-systemd)
7. [Verifica Finale](#7-verifica-finale)
8. [Aggiungere Altri Servizi al Tunnel](#8-aggiungere-altri-servizi-al-tunnel)

---

## 1. Prerequisiti

| Requisito | Stato atteso |
|---|---|
| Docker installato sul ThinkCentre | `docker --version` restituisce un output |
| Docker Compose disponibile | `docker compose version` restituisce un output |
| Dominio su Cloudflare (es. `bikerlink.com`) | DNS del dominio punta ai nameserver Cloudflare |
| ThinkCentre acceso e connesso a internet | — |

> **Nota esposizione:** dal 29 Giugno 2026 **tutti** i servizi (GraphHopper, Valhalla, Ollama, Whisper, Nominatim) sono esposti tramite **Cloudflare Tunnel** su `*.biker-link.net`. DuckDNS + nginx + certbot sono stati dismessi. Uptime Kuma li monitora ai rispettivi URL `*.biker-link.net`.

Se Docker non è ancora installato, segui la sezione 3 di `docs/self-hosting-setup.md`.

---

## 2. Uptime Kuma via Docker

### 2.1 Struttura directory

```bash
mkdir -p ~/services/uptime-kuma/data
```

```
~/services/uptime-kuma/
├── docker-compose.yml
└── data/                 # Volume persistente — contiene DB e configurazione
```

### 2.2 Docker Compose

```bash
cat > ~/services/uptime-kuma/docker-compose.yml << 'EOF'
services:
  uptime-kuma:
    image: louislam/uptime-kuma:1
    container_name: uptime-kuma
    restart: unless-stopped
    ports:
      - "127.0.0.1:3001:3001"   # Solo localhost — Cloudflare Tunnel fa da proxy
    volumes:
      - ./data:/app/data
    environment:
      - TZ=Europe/Rome
EOF
```

> **Perché `127.0.0.1:3001` e non `0.0.0.0:3001`?**
> Cloudflare Tunnel si connette direttamente a `localhost:3001` dall'interno della macchina. Esporre la porta su `0.0.0.0` renderebbe il pannello accessibile anche sulla rete locale senza autenticazione — non è necessario e aumenta la superficie di attacco.

### 2.3 Avvio

```bash
cd ~/services/uptime-kuma
docker compose up -d

# Verifica che il container sia partito
docker compose ps
# Output atteso: uptime-kuma   running   127.0.0.1:3001->3001/tcp

# Controlla i log (attendi l'output "Listening on...")
docker compose logs -f
# Output atteso: Listening on 3001
# Premi Ctrl+C per uscire dai log
```

### 2.4 Verifica locale

```bash
# Testa che Uptime Kuma risponda localmente
curl -s -o /dev/null -w "%{http_code}" http://localhost:3001
# Output atteso: 200
```

Apri `http://localhost:3001` dal browser del ThinkCentre (o con SSH tunnel): dovresti vedere la schermata di setup iniziale di Uptime Kuma.

**Completa il setup iniziale** (crea l'account admin) prima di procedere — è richiesto prima dell'esposizione pubblica.

---

## 3. Account Cloudflare e Dominio

> **Piano Free è sufficiente** per tutto ciò che descriviamo in questa guida. Non è necessario nessun piano a pagamento.

### 3.1 Crea l'account Cloudflare (se non esiste)

1. Vai su [dash.cloudflare.com](https://dash.cloudflare.com) → **Sign Up**
2. Inserisci email e password → verifica l'email
3. Salta la procedura di aggiunta dominio per ora — lo facciamo nel passo successivo

### 3.2 Aggiungi il dominio a Cloudflare

> **Se il dominio è già su Cloudflare** (i nameserver del dominio puntano già a Cloudflare), salta al punto 3.3.

1. Nella dashboard Cloudflare → **Add a Site**
2. Inserisci il dominio (es. `bikerlink.com`) → **Continue**
3. Seleziona il piano **Free** → **Continue**
4. Cloudflare scansiona i record DNS esistenti e li importa automaticamente → verifica che siano corretti → **Continue**
5. Cloudflare mostra due nameserver (es. `ada.ns.cloudflare.com`, `bob.ns.cloudflare.com`)
6. **Vai sul pannello del tuo registrar** (dove hai acquistato il dominio) e cambia i nameserver con quelli forniti da Cloudflare
7. Attendi la propagazione DNS: da 5 minuti a 48 ore. Cloudflare ti manda una email quando è attivo.

### 3.3 Verifica che il dominio sia attivo

Nella dashboard Cloudflare, il dominio deve mostrare stato **Active** (con segno di spunta verde).

---

## 4. Installazione cloudflared sul ThinkCentre

`cloudflared` è il daemon che mantiene il tunnel tra il ThinkCentre e la rete Cloudflare.

### 4.1 Installazione via apt (Ubuntu/Debian)

```bash
# Aggiungi il repository Cloudflare
curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg | \
  sudo tee /usr/share/keyrings/cloudflare-main.gpg > /dev/null

echo "deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] \
  https://pkg.cloudflare.com/cloudflared $(lsb_release -cs) main" | \
  sudo tee /etc/apt/sources.list.d/cloudflared.list

sudo apt update
sudo apt install -y cloudflared

# Verifica installazione
cloudflared --version
# Output atteso: cloudflared version 2024.x.x
```

### 4.2 Autenticazione con il tuo account Cloudflare

```bash
cloudflared tunnel login
```

**Output:** cloudflared apre un URL. Aprilo nel browser e autorizza con il tuo account Cloudflare. Seleziona il dominio che hai aggiunto (es. `bikerlink.com`).

Al termine, cloudflared salva automaticamente il certificato in `~/.cloudflared/cert.pem`. Questo certifica il ThinkCentre come host autorizzato a creare tunnel per il tuo account.

### 4.3 Crea il tunnel

```bash
cloudflared tunnel create thinkcentre
```

**Output:**

```
Created tunnel thinkcentre with id xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
```

> **Annotati l'UUID del tunnel** (la stringa `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`) — ti serve nel passo successivo.

Verifica che il tunnel sia stato creato:

```bash
cloudflared tunnel list
# Output:
# ID                                   NAME          CREATED
# xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx thinkcentre   2026-06-06T...
```

Il tunnel crea automaticamente un file di credenziali in `~/.cloudflared/<UUID>.json`. Questo file è la chiave privata del tunnel — **non condividerlo**.

---

## 5. Configurazione del Tunnel verso Uptime Kuma

### 5.1 File di configurazione

```bash
mkdir -p ~/.cloudflared

cat > ~/.cloudflared/config.yml << 'EOF'
# ID del tunnel creato con "cloudflared tunnel create thinkcentre"
tunnel: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
credentials-file: /home/TUO_UTENTE/.cloudflared/xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx.json

ingress:
  # Uptime Kuma — status.bikerlink.com → localhost:3001
  - hostname: status.bikerlink.com
    service: http://localhost:3001

  # Regola catch-all obbligatoria — restituisce 404 per hostname non configurati
  - service: http_status:404
EOF
```

> **Sostituisci:**
> - `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx` con l'UUID del tuo tunnel (in entrambi i posti)
> - `TUO_UTENTE` con il tuo username Linux (es. `bikerlink`)
> - `status.bikerlink.com` con il sottodominio che vuoi usare

### 5.2 Crea il record DNS su Cloudflare

Cloudflare Tunnel richiede un record CNAME nel DNS del dominio per instradare il traffico verso il tunnel.

```bash
cloudflared tunnel route dns thinkcentre status.bikerlink.com
```

**Output:**

```
Added CNAME status.bikerlink.com which will route to this tunnel thinkcentrexxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx.cfargotunnel.com
```

Verifica nella dashboard Cloudflare → **DNS** che esista un record:
```
CNAME   status   xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx.cfargotunnel.com   Proxied (arancione)
```

### 5.3 Test manuale del tunnel

```bash
# Avvia il tunnel in foreground per testarlo
cloudflared tunnel --config ~/.cloudflared/config.yml run thinkcentre
```

**Output atteso:**

```
INF Starting tunnel tunnelID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
INF Registered tunnel connection connIndex=0 ip=... location=...
INF Registered tunnel connection connIndex=1 ip=... location=...
INF Registered tunnel connection connIndex=2 ip=... location=...
INF Registered tunnel connection connIndex=3 ip=... location=...
```

Con 4 connessioni registrate il tunnel è stabile. Apri `https://status.bikerlink.com` nel browser — dovresti vedere il pannello Uptime Kuma con HTTPS attivo (🔒 nella barra del browser).

Premi `Ctrl+C` per fermare il tunnel dopo il test — lo renderemo un servizio systemd nel passo successivo.

---

## 6. Avvio Automatico al Boot (systemd)

Rendi cloudflared un servizio che si avvia automaticamente quando il ThinkCentre si accende.

### 6.1 Installa il servizio systemd

```bash
sudo cloudflared service install
```

Questo comando:
1. Copia il file di configurazione da `~/.cloudflared/config.yml` a `/etc/cloudflared/config.yml`
2. Crea il file di servizio systemd in `/etc/systemd/system/cloudflared.service`
3. Abilita il servizio (`systemctl enable`)

**Verifica che la copia sia avvenuta correttamente:**

```bash
sudo cat /etc/cloudflared/config.yml
# Deve mostrare il tuo tunnel UUID e il percorso corretto del credentials-file
```

> Se il file in `/etc/cloudflared/config.yml` è vuoto o mancante, copialo manualmente:
> ```bash
> sudo mkdir -p /etc/cloudflared
> sudo cp ~/.cloudflared/config.yml /etc/cloudflared/config.yml
> ```

### 6.2 Avvia il servizio

```bash
sudo systemctl start cloudflared

# Verifica stato
sudo systemctl status cloudflared
# Output atteso: Active: active (running) since ...
```

### 6.3 Verifica log systemd

```bash
sudo journalctl -u cloudflared -f
# Premi Ctrl+C per uscire
```

**Output atteso (normale):**

```
INF Starting tunnel tunnelID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
INF Registered tunnel connection connIndex=0 ...
INF Registered tunnel connection connIndex=1 ...
INF Registered tunnel connection connIndex=2 ...
INF Registered tunnel connection connIndex=3 ...
```

### 6.4 Test riavvio

```bash
# Simula un riavvio del servizio (non riavvia il ThinkCentre)
sudo systemctl restart cloudflared
sudo systemctl status cloudflared
# Deve essere ancora "active (running)"
```

---

## 7. Verifica Finale

Checklist da completare prima di considerare l'installazione terminata:

### 7.1 Uptime Kuma

- [ ] `docker compose ps` mostra `uptime-kuma` in stato `running`
- [ ] `curl -s -o /dev/null -w "%{http_code}" http://localhost:3001` restituisce `200`
- [ ] Il pannello Uptime Kuma è accessibile e l'account admin è configurato

### 7.2 Cloudflare Tunnel

- [ ] `cloudflared tunnel list` mostra il tunnel `thinkcentre`
- [ ] `sudo systemctl status cloudflared` mostra `active (running)`
- [ ] Il tunnel si avvia automaticamente: `sudo systemctl is-enabled cloudflared` restituisce `enabled`

### 7.3 Accesso pubblico

- [ ] `https://status.bikerlink.com` si apre nel browser da una rete esterna (es. hotspot telefono)
- [ ] Il certificato HTTPS è valido (🔒 nella barra del browser) — gestito automaticamente da Cloudflare
- [ ] Il login al pannello Uptime Kuma funziona correttamente
- [ ] Gli altri servizi (GraphHopper, Valhalla, Ollama, Whisper, Nominatim) restano raggiungibili via Cloudflare Tunnel su `*.biker-link.net`

### 7.4 Aggiunge un monitor di test

Dentro il pannello Uptime Kuma:
1. **Add New Monitor** → Type: **HTTP(s)**
2. URL: `https://api.bikerlink.app/health` (o qualsiasi endpoint dell'app)
3. Interval: **60 seconds**
4. Salva e verifica che mostri **Up** in verde

---

## 8. Aggiungere Altri Servizi al Tunnel

Per esporre altri servizi (GraphHopper, Ollama, Nominatim, Whisper) tramite lo stesso tunnel in futuro, basta aggiungere voci al file `config.yml`.

### 8.1 Modifica config.yml

```bash
sudo nano /etc/cloudflared/config.yml
```

Aggiungi le voci prima della regola `http_status:404`:

```yaml
tunnel: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
credentials-file: /home/TUO_UTENTE/.cloudflared/xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx.json

ingress:
  # Uptime Kuma (già configurato)
  - hostname: status.bikerlink.com
    service: http://localhost:3001

  # GraphHopper — routing moto
  - hostname: routing.bikerlink.com
    service: http://localhost:8989

  # Ollama — AI models
  - hostname: ollama.bikerlink.com
    service: http://localhost:11434

  # Nominatim — geocoding
  - hostname: geocoding.bikerlink.com
    service: http://localhost:8080

  # Catch-all obbligatorio
  - service: http_status:404
```

### 8.2 Crea i record DNS per i nuovi sottodomini

```bash
# Ripeti per ogni nuovo hostname aggiunto
cloudflared tunnel route dns thinkcentre routing.bikerlink.com
cloudflared tunnel route dns thinkcentre ollama.bikerlink.com
cloudflared tunnel route dns thinkcentre geocoding.bikerlink.com
```

### 8.3 Riavvia il servizio per applicare la configurazione

```bash
sudo systemctl restart cloudflared
sudo systemctl status cloudflared
```

Il tunnel aggiornato gestisce tutti i sottodomini con un singolo daemon e le stesse 4 connessioni HA verso Cloudflare — non vengono aperte connessioni aggiuntive per ogni servizio aggiunto.

---

## Note Operative

### Quando il ThinkCentre viene spento

Il tunnel si interrompe automaticamente. I servizi esposti (es. `status.bikerlink.com`) restituiranno un errore `502 Bad Gateway` fino al riavvio del ThinkCentre. Questo è il comportamento atteso per un server home.

### Aggiornamento cloudflared

```bash
sudo apt update && sudo apt upgrade cloudflared
sudo systemctl restart cloudflared
```

### Log in tempo reale

```bash
sudo journalctl -u cloudflared -f --since "10 minutes ago"
```

### Dashboard Cloudflare

La dashboard mostra le connessioni attive del tunnel in **Zero Trust** → **Networks** → **Tunnels** → `thinkcentre`. Da qui puoi verificare lo stato del tunnel anche da remoto, senza accedere al ThinkCentre.

### DuckDNS vs Cloudflare Tunnel — confronto

| Aspetto | DuckDNS + Port Forwarding | Cloudflare Tunnel |
|---|---|---|
| Port forwarding sul router | Richiesto | Non necessario |
| IP dinamico | Richiede aggiornamento DDNS | Gestito automaticamente |
| HTTPS | Richiede Let's Encrypt manuale | Automatico, gestito da Cloudflare |
| Sicurezza | Porta esposta su internet | Connessione outbound, nessuna porta aperta |
| Setup iniziale | Medio | Basso (dopo il primo tunnel) |
| Costo | Gratuito | Gratuito (piano Free) |
