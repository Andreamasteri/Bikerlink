# Open WebUI — Accesso remoto via Cloudflare Tunnel

> Guida per rendere la GUI di **Bowie (Open WebUI)** raggiungibile da internet con HTTPS valido,
> tramite il Cloudflare Tunnel già attivo sul ThinkCentre.
>
> **Sottodominio target:** `ai.biker-link.net` → `127.0.0.1:3010`

---

## Stato attuale (verificato al 30 giugno 2026)

| Componente | Stato |
|---|---|
| Container `open-webui` | ✅ Up (healthy), bind `127.0.0.1:3010->8080/tcp` |
| `curl http://127.0.0.1:3010` sul TC | ✅ HTTP 200 |
| `curl http://192.168.1.35:3010` (LAN diretta) | ✅ Connection refused — bypass bloccato |
| Ollama raggiungibile dal container | ✅ `host.docker.internal:11434` HTTP 200 |
| `cloudflared` (systemd) | ✅ active, token-managed |
| Config locale `/etc/cloudflared/config.yml` | ❌ Non esiste — tunnel è dashboard-managed |

Il lato ThinkCentre è **già pronto**. Non serve toccare nulla sul server.

---

## Perché solo dalla dashboard

Il tunnel gira con `--token` direttamente nel service systemd (nessun `config.yml`).
Questo significa che le **ingress rule sono gestite interamente dalla Cloudflare Zero Trust dashboard**,
non da file sul server. L'agente non ha accesso alla dashboard né a una Cloudflare API key.

---

## Passi da seguire nella dashboard Cloudflare

### 1. Apri il pannello Zero Trust

1. Vai su [dash.cloudflare.com](https://dash.cloudflare.com)
2. Seleziona il tuo account → **Zero Trust** (nella barra laterale sinistra)
3. Nel menu Zero Trust → **Networks** → **Tunnels**

### 2. Trova il tunnel del ThinkCentre

Nella lista dei tunnel vedrai quello attivo (stato **Healthy**).
Il nome è probabilmente `thinkcentre` o simile.
**Clicca sul nome del tunnel.**

### 3. Aggiungi il public hostname

1. Clicca sulla tab **Public Hostname**
2. Clicca **Add a public hostname**
3. Compila i campi:

| Campo | Valore |
|---|---|
| **Subdomain** | `ai` |
| **Domain** | `biker-link.net` |
| **Path** | *(lascia vuoto)* |
| **Type** | `HTTP` |
| **URL** | `localhost:3010` |

4. Clicca **Save hostname**

Cloudflare crea automaticamente il record CNAME nel DNS e il certificato HTTPS.
Non c'è nient'altro da fare sul ThinkCentre — cloudflared riceve la nuova regola in tempo reale.

### 4. Verifica

Apri `https://ai.biker-link.net` nel browser (da qualsiasi rete, anche hotspot).
Dovrebbe apparire la schermata di login di Open WebUI con il lucchetto HTTPS verde.

---

## Protezione con Cloudflare Access (obbligatorio)

Senza Access, la pagina di login di Open WebUI è pubblica. Chiunque può tentare il login.
Open WebUI ha la propria autenticazione, ma Cloudflare Access aggiunge un layer
che **blocca l'accesso prima ancora di raggiungere l'app**.

### Crea una Access Application

1. Zero Trust → **Access** → **Applications** → **Add an application**
2. Tipo: **Self-hosted**
3. Compila:

| Campo | Valore |
|---|---|
| **Application name** | `Open WebUI (Bowie)` |
| **Session Duration** | `24 hours` (o a piacere) |
| **Application domain** | `ai.biker-link.net` |

4. Clicca **Next**

### Crea una policy di accesso

1. **Policy name:** `Team BikerLink`
2. **Action:** `Allow`
3. **Include** → Rule type: `Emails` → inserisci le email dei membri del team che devono avere accesso
   - Oppure usa `Email domain` → `biker-link.net` per permettere tutti gli indirizzi del dominio
4. Clicca **Next** → **Add application**

Da questo momento, aprendo `https://ai.biker-link.net` Cloudflare mostra prima una pagina di
autenticazione (via email OTP o provider SSO). Solo dopo l'autorizzazione l'utente vede Open WebUI.

---

## Checklist di configurazione e verifica

Spunta ogni voce dopo averla completata. Questa sezione serve come registro operativo.

### Cloudflare Access — configurazione

- [ ] Access Application creata per `ai.biker-link.net` (tipo: Self-hosted)
- [ ] Policy `Team BikerLink` con `Allow` e email allowlist o `Email domain: biker-link.net`
- [ ] Application salvata e visibile in Zero Trust → Access → Applications

### Verifica comportamento — utente non autorizzato

Procedura: apri `https://ai.biker-link.net` in una finestra **privata** (incognito) con un account email
**non** nella allowlist, oppure senza essere autenticato.

Risultato atteso:
```
HTTP 302/200 → Cloudflare Access login page
(NON la schermata di login Open WebUI)
```

Verifica rapida da terminale:
```bash
# Senza cookie di sessione Cloudflare → deve restituire 302 o 403 (mai 200 di Open WebUI)
curl -s -o /dev/null -w "%{http_code}" https://ai.biker-link.net
# Atteso: 302 (redirect a Cloudflare) oppure 403
```

- [ ] Utente non autorizzato → vede pagina Cloudflare, NON Open WebUI ✅

### Verifica comportamento — membro del team

Procedura: apri `https://ai.biker-link.net`, inserisci email autorizzata, ricevi OTP via email, accedi.

- [ ] Email OTP ricevuta correttamente
- [ ] Dopo autenticazione Cloudflare → schermata login Open WebUI visibile ✅
- [ ] Login in Open WebUI funziona normalmente

---

## Hardening di rete — impedisci bypass del tunnel

> **Importante:** Cloudflare Access protegge solo il traffico che passa dal tunnel.
> Se la porta 3010 è raggiungibile direttamente (es. da LAN o con port-forward),
> l'autenticazione può essere bypassata.

### ~~Problema attuale~~ — RISOLTO (30 giugno 2026)

~~Il container usa `--network host`: la porta 3010 è esposta su **tutte le interfacce** del ThinkCentre~~
~~(incluse LAN e Wi-Fi). Chiunque nella rete locale può accedere direttamente a `http://192.168.1.35:3010`~~
~~senza passare per Cloudflare.~~

Il container è stato ricreato con bind loopback. Accesso diretto dalla LAN: **Connection refused**.

### Configurazione attuale del container

```bash
docker run -d \
  --name open-webui \
  --restart unless-stopped \
  -p 127.0.0.1:3010:8080 \
  --add-host=host.docker.internal:host-gateway \
  -e OLLAMA_BASE_URL=http://host.docker.internal:11434 \
  -e WEBUI_NAME="BikerLink AI (Bowie)" \
  -e SCARF_NO_ANALYTICS=true \
  -e DO_NOT_TRACK=true \
  -e ANONYMIZED_TELEMETRY=false \
  -v open-webui:/app/backend/data \
  ghcr.io/open-webui/open-webui:main
```

> **Nota Ollama:** senza `--network host`, il container non può raggiungere `127.0.0.1:11434`
> dell'host direttamente. Sono necessarie due modifiche:
>
> 1. **Ollama bind su `0.0.0.0`** — override systemd in
>    `/etc/systemd/system/ollama.service.d/override.conf`:
>    ```ini
>    [Service]
>    Environment="OLLAMA_HOST=0.0.0.0:11434"
>    ```
>    (protetto da ufw — porta 11434 accessibile solo da LAN + Docker bridge)
>
> 2. **Regola ufw per Docker bridge** — aggiunta manualmente:
>    ```bash
>    sudo ufw allow from 172.17.0.0/16 to any port 11434 proto tcp comment 'Docker bridge → Ollama'
>    ```
>    Questo permette al container (rete `172.17.0.0/16`) di raggiungere Ollama sull'host.

Dopo il fix, verifica che il tunnel funzioni ancora:
```bash
curl -s -o /dev/null -w "%{http_code}" https://ai.biker-link.net
# Con Access attivo: 302 o 403
# Dopo login Cloudflare: 200
```

E che l'accesso diretto sia bloccato:
```bash
# Dall'esterno del loopback NON deve rispondere
curl -s --connect-timeout 3 http://192.168.1.35:3010
# Atteso: Connection refused o timeout
```

- [x] Container ricreato con bind `127.0.0.1:3010:8080`
- [x] Accesso diretto a `http://192.168.1.35:3010` → Connection refused ✅
- [ ] Tunnel `https://ai.biker-link.net` → ancora funzionante ✅ (da verificare dopo setup Cloudflare dashboard)

---

## Note operative

### Se Open WebUI non risponde (502)

Il 502 da Cloudflare significa che il container è spento. Sul ThinkCentre:

```bash
docker start open-webui
# oppure
docker restart open-webui
```

### Verifica rapida da remoto (senza aprire il browser)

```bash
curl -s -o /dev/null -w "%{http_code}" https://ai.biker-link.net
# 200 = OK (nessun Access, o già autenticato)
# 302/403 = Cloudflare Access attivo (normale, utente non autenticato)
# 502 = container spento
```

### Open WebUI e Ollama

Open WebUI parla con Ollama tramite `OLLAMA_BASE_URL=http://host.docker.internal:11434`.
Ollama è configurato per ascoltare su `0.0.0.0:11434` (override systemd), protetto da ufw.
Il container usa `--add-host=host.docker.internal:host-gateway` per risolvere l'host.

### Aggiornamento Open WebUI

```bash
docker pull ghcr.io/open-webui/open-webui:main
docker stop open-webui && docker rm open-webui
# ri-lancia con i parametri della sezione "Configurazione attuale del container"
docker run -d \
  --name open-webui \
  --restart unless-stopped \
  -p 127.0.0.1:3010:8080 \
  --add-host=host.docker.internal:host-gateway \
  -e OLLAMA_BASE_URL=http://host.docker.internal:11434 \
  -e WEBUI_NAME="BikerLink AI (Bowie)" \
  -e SCARF_NO_ANALYTICS=true \
  -e DO_NOT_TRACK=true \
  -e ANONYMIZED_TELEMETRY=false \
  -v open-webui:/app/backend/data \
  ghcr.io/open-webui/open-webui:main
```

---

## Riepilogo azioni

| # | Chi | Dove | Azione | Stato |
|---|---|---|---|---|
| 1 | ✅ Agente | ThinkCentre | Verificato: Open WebUI healthy su porta 3010 | ✅ |
| 2 | 👤 Tu | Cloudflare dashboard | Aggiungi public hostname `ai` → `localhost:3010` | ⬜ |
| 3 | 👤 Tu | Cloudflare dashboard | Crea Access Application + policy email | ⬜ |
| 4 | 👤 Tu | Browser (incognito) | Verifica blocco utente non autorizzato | ⬜ |
| 5 | 👤 Tu | Browser (autenticato) | Verifica accesso membro team | ⬜ |
| 6 | ✅ Agente | ThinkCentre | Ricrea container con bind loopback `127.0.0.1:3010:8080` | ✅ |
| 7 | ✅ Agente | ThinkCentre | Accesso diretto `192.168.1.35:3010` → Connection refused | ✅ |
| 8 | ✅ Agente | ThinkCentre | Ollama bind `0.0.0.0` + ufw regola Docker bridge → 11434 | ✅ |
