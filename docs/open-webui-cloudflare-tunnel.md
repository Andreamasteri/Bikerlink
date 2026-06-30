# Open WebUI — Accesso remoto via Cloudflare Tunnel

> Guida per rendere la GUI di **Bowie (Open WebUI)** raggiungibile da internet con HTTPS valido,
> tramite il Cloudflare Tunnel già attivo sul ThinkCentre.
>
> **Sottodominio target:** `ai.biker-link.net` → `127.0.0.1:3010`

---

## Stato attuale (verificato al 30 giugno 2026)

| Componente | Stato |
|---|---|
| Container `open-webui` | ✅ Up (healthy), `--network host`, porta `3010` |
| `curl http://127.0.0.1:3010` sul TC | ✅ HTTP 200 |
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

## Protezione con Cloudflare Access (raccomandato)

Senza Access, la pagina di login di Open WebUI è pubblica. Chiunque può tentare il login.
Open WebUI ha la propria autenticazione, ma aggiungere Cloudflare Access aggiunge un layer
che blocca l'accesso prima ancora di raggiungere l'app.

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
# 200 = OK, 502 = container spento, 403 = Cloudflare Access attivo (normale)
```

### Open WebUI e Ollama

Open WebUI è già configurato per parlare con Ollama su `127.0.0.1:11434` (rete host).
Il routing interno non cambia con l'esposizione pubblica.

### Aggiornamento Open WebUI

```bash
docker pull ghcr.io/open-webui/open-webui:main
docker stop open-webui && docker rm open-webui
# ri-lancia con gli stessi parametri originali (--network host, -e PORT=3010, ecc.)
```

---

## Riepilogo azioni

| # | Chi | Dove | Azione |
|---|---|---|---|
| 1 | ✅ Agente | ThinkCentre | Verificato: Open WebUI healthy su porta 3010 |
| 2 | 👤 Tu | Cloudflare dashboard | Aggiungi public hostname `ai` → `localhost:3010` |
| 3 | 👤 Tu (opzionale) | Cloudflare dashboard | Crea Access Application con policy email |
| 4 | 👤 Tu | Browser | Verifica `https://ai.biker-link.net` funziona |
