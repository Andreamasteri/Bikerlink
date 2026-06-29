# Deploy Log — Dismantling DuckDNS + nginx + certbot (29 Giugno 2026)

## Obiettivo
Con il Cloudflare Tunnel (`cloudflared.service`) attivo e stabile, il vecchio stack DuckDNS + nginx + Let's Encrypt è diventato ridondante e aumentava la superficie d'attacco. Questo log documenta la disattivazione completa.

## Azioni eseguite sul ThinkCentre

```bash
# 1. DuckDNS — timer e service disabilitati
sudo systemctl disable --now duckdns.timer duckdns.service

# 2. nginx — fermato e disabilitato
sudo systemctl disable --now nginx

# 3. certbot — timer di rinnovo disabilitato
sudo systemctl disable --now certbot.timer certbot.service
```

## Stato finale verificato

| Servizio | is-active | is-enabled |
|---|---|---|
| `duckdns.timer` | inactive | **disabled** |
| `duckdns.service` | inactive | disabled |
| `nginx` | inactive | **disabled** |
| `certbot.timer` | inactive | **disabled** |
| `cloudflared` | **active** | **enabled** ✅ |

## Cosa rimane attivo

- **Cloudflare Tunnel** (`cloudflared.service`) — unico punto di esposizione esterna
- Tutti i servizi backend girano ancora su `localhost` (GraphHopper, Valhalla, Nominatim, Whisper, Ollama, TC Agent)
- Il cert Let's Encrypt (`/etc/letsencrypt/live/bikerlink/`) rimane sul disco ma non viene più rinnovato né usato — può essere rimosso manualmente in futuro con `sudo certbot delete --cert-name bikerlink`

## Verifica esposizione (post-disattivazione)

I servizi sono raggiungibili solo via Cloudflare Tunnel sugli URL `*.biker-link.net`:
- `gh.biker-link.net` → GH multi-area
- `valhalla.biker-link.net` → Valhalla
- `whisper.biker-link.net` → Whisper
- `nominatim.biker-link.net` → Nominatim
- `tc.biker-link.net` → TC Agent metrics

Le vecchie URL `*.bikerlink.duckdns.org` non sono più funzionanti (DuckDNS fermato, porte router non più necessarie).

---

# Deploy Log — nginx catch-all listen (27 Giugno 2026)

## Obiettivo
Applicare il config nginx aggiornato (tutti i server block con `listen 443 ssl` catch-all invece di `listen 192.168.1.35:443 ssl` IP-specifico) per consentire l'ascolto su entrambe le interfacce: eth `192.168.1.35` e WiFi USB `192.168.1.36`.

## Procedura eseguita

### 1. Upload template aggiornato sul TC
Il template `nginx-bikerlink.conf` era già aggiornato nel repo Replit (606 righe, catch-all ovunque), ma la versione sul TC aveva ancora `listen 192.168.1.35:443 ssl` nel block TC agent (riga 551). Upload via SFTP.

### 2. Rigenerazione config con setup-expose.sh
```
NONINTERACTIVE=1
BASE_DOMAIN=bikerlink.duckdns.org
APP_ORIGIN=https://bikerlink.app
ENV_LOCAL_FILE=/tmp/.bikerlink-env.local  (token scritti via SFTP, cancellati dopo)
```
Output:
```
✓ Template trovati (nginx-bikerlink.conf, cloudflared-config.yml)
✓ .env.local trovato
✓ Dominio: bikerlink.duckdns.org
✓ App origin: https://bikerlink.app
✓ GRAPHHOPPER_TOKEN coincide con .env.local
✓ VALHALLA_API_KEY coincide con .env.local
✓ OLLAMA_TOKEN coincide con .env.local
✓ WHISPER_TOKEN coincide con .env.local
✓ NOMINATIM_TOKEN coincide con .env.local
✓ TC_AGENT_TOKEN coincide con .env.local
✓ Generato generated/nginx-bikerlink.conf (7 server block: 1 HTTP + 6 HTTPS)
✓ Fatto.
```

### 3. Copia config in /etc/nginx/sites-available/bikerlink
```bash
sudo cp generated/nginx-bikerlink.conf /etc/nginx/sites-available/bikerlink
sudo chmod 640 /etc/nginx/sites-available/bikerlink
```

### 4. nginx -t
```
nginx: the configuration file /etc/nginx/nginx.conf syntax is ok
nginx: configuration file /etc/nginx/nginx.conf test is successful
```

Cert `bikerlink` già copre tutti i sottodomini incluso `tc.bikerlink.duckdns.org` (scade 2026-09-07).

### 5. systemctl reload nginx
```
rc=0 (OK)
ActiveState=active, SubState=running
```

## Verifica listen directives nel config live

```
listen 80;
listen [::]:80;
listen 443 ssl;      # GH
listen [::]:443 ssl;
listen 443 ssl;      # Valhalla
listen [::]:443 ssl;
listen 443 ssl;      # Ollama
listen [::]:443 ssl;
listen 443 ssl;      # Whisper
listen [::]:443 ssl;
listen 443 ssl;      # Nominatim
listen [::]:443 ssl;
listen 443 ssl;      # TC agent
listen [::]:443 ssl;
```

## Verifica ss -tlnp | grep :443

```
LISTEN 0  511  0.0.0.0:443  0.0.0.0:*  users:(("nginx",...))
LISTEN 0  511     [::]:443     [::]:*  users:(("nginx",...))
```

nginx in ascolto su `0.0.0.0:443` (catch-all) — risponde su **qualsiasi** interfaccia attiva.

## Verifica curl verso 192.168.1.35

Con header Host forzato (`--resolve`) e token di autenticazione:

| Sottodominio | Path | HTTP | Note |
|---|---|---|---|
| `gh.bikerlink.duckdns.org` | `/areas/grecia/health` | **502** | Container GH fermo (normale) |
| `valhalla.bikerlink.duckdns.org` | `/status` | **502** | Container Valhalla fermo |
| `nominatim.bikerlink.duckdns.org` | `/` | **404** | nginx → Nominatim (up, healthy). 404 = path `/` non valido in Nominatim. Auth OK |
| `ollama.bikerlink.duckdns.org` | `/` | **502** | Ollama (systemd) fermato |
| `whisper.bikerlink.duckdns.org` | `/` | **502** | Container fermo |
| `tc.bikerlink.duckdns.org` | `/` | **502** | TC agent non avviato |

Tutti i 6 server block rispondono (nginx li gestisce). I 502 sono attesi: i backend container sono fermi (build in corso per GH, Valhalla/Ollama non ancora riavviati). Nominatim è up: 404 conferma che nginx ha autenticato e forwardato correttamente la richiesta.

## Verifica curl verso 192.168.1.36

L'adattatore WiFi USB `wlxccbabdb51e2e` (MAC cc:ba:bd:b5:1e:2e) è fisicamente presente ma **NO-CARRIER** (nessun profilo NetworkManager configurato). nginx con `0.0.0.0:443` risponderà automaticamente su 192.168.1.36 non appena il profilo NM viene configurato.

**Azione manuale richiesta** — sul TC, come root:
```bash
cd ~/bikerlink/infra/self-host/expose
sudo WIFI_SSID="<ssid>" WIFI_PASSWORD="<password>" -E ./setup-wifi-usb.sh
```
Poi verificare:
```bash
ip addr show wlxccbabdb51e2e  # deve mostrare 192.168.1.36/24
sudo ss -tlnp | grep :443     # 0.0.0.0:443 = risponde su entrambe
curl -sk --resolve "valhalla.bikerlink.duckdns.org:443:192.168.1.36" \
  https://valhalla.bikerlink.duckdns.org/status
```

## Interfacce di rete al momento del deploy

```
enp0s31f6:        inet 192.168.1.35/24  (ethernet, UP)
wlp2s0:           NO-CARRIER           (WiFi integrata, DOWN)
wlxccbabdb51e2e:  NO-CARRIER           (WiFi USB, DOWN - senza profilo NM)
```

## Certificati Let's Encrypt

```
Certificate Name: bikerlink
  Domains: gh.bikerlink.duckdns.org nominatim.bikerlink.duckdns.org
           ollama.bikerlink.duckdns.org tc.bikerlink.duckdns.org
           valhalla.bikerlink.duckdns.org whisper.bikerlink.duckdns.org
  Expiry Date: 2026-09-07 15:55:23+00:00 (VALID: 71 days)
```

## Test raggiungibilità esterna (da Replit sandbox, fuori LAN)

Test eseguiti da Replit (sandbox esterna alla LAN, via Cloudflare tunnel → nginx → backend):

```
Date: Sat Jun 27 15:58:47 UTC 2026

Nominatim (X-Nominatim-Token): HTTP 200  time=0.424s  ← PROVA nginx+Cloudflare funzionanti
Unauthenticated request:        HTTP 401              ← nginx correttamente rejecter
GH /areas/grecia/health:        HTTP 502              ← container GH fermo (build in corso)
Valhalla /status:               HTTP 502              ← container Valhalla fermo
Ollama /api/tags:               HTTP 502              ← Ollama (systemd) inattivo
TC agent /:                     HTTP 502              ← TC agent non avviato
```

**Interpretazione:** Nominatim HTTP 200 conferma il percorso completo end-to-end (Replit→Internet→Cloudflare→TC nginx→Nominatim container). Il 401 senza token prova che nginx autentica correttamente tutte le richieste. I 502 sono attesi: GH era in build, Valhalla/Ollama/Whisper/TC agent fermi per manutenzione.

## Stato finale

| Check | Stato |
|---|---|
| Template TC aggiornato (catch-all listen) | ✅ |
| setup-expose.sh eseguito, tutti 6 token validati | ✅ |
| nginx -t | ✅ |
| systemctl reload nginx (active/running) | ✅ |
| ss -tlnp: 0.0.0.0:443 (copre 192.168.1.35 e 192.168.1.36) | ✅ |
| curl LAN su 192.168.1.35: tutti 6 sottodomini raggiungono nginx | ✅ |
| Test esterno (Replit sandbox): Nominatim 200, 401 no-auth | ✅ |
| WiFi USB 192.168.1.36 profilo NM | ⏳ manuale (SSID/pwd non in env) |
| curl su 192.168.1.36 | ⏳ dopo setup NM |
| Test post-reboot WiFi USB autoconnect | ⏳ dopo setup NM |

## Azione manuale per completare WiFi USB

Eseguire sul ThinkCentre (con le credenziali WiFi di casa):
```bash
cd ~/bikerlink/infra/self-host/expose
sudo WIFI_SSID="<ssid-rete-casa>" WIFI_PASSWORD="<password>" -E ./setup-wifi-usb.sh
```
Poi verificare:
```bash
ip addr show wlxccbabdb51e2e      # deve mostrare 192.168.1.36/24
sudo ss -tlnp | grep :443         # ancora 0.0.0.0:443
curl -sk --resolve "nominatim.bikerlink.duckdns.org:443:192.168.1.36" \
  -H "X-Nominatim-Token: <token>" \
  https://nominatim.bikerlink.duckdns.org/status    # atteso 200
sudo reboot
# post-reboot:
ip addr show wlxccbabdb51e2e      # deve mostrare 192.168.1.36 (autoconnect)
sudo systemctl status nginx       # active/running
```
