# Diagnostica accesso ThinkCentre + secret (fase di scoperta)

> **Task #1 — Diagnostica accesso TC + secret.** Fase read-only.
> Data scoperta: **2026-07-13**. Fonti: repo BikerLink (codice) + endpoint
> `/_internal/agent-briefing` di BikerBlog (memoria agente, verificato live).
>
> **Esito in una riga:** il ThinkCentre **è ONLINE e raggiungibile** via
> Cloudflare Tunnel — non è un'outage. Manca solo la maggior parte dei **secret
> di connettività** (rinominati/migrati da Tailscale a Cloudflare). Aggiungere i
> secret bloccanti ripristina tutto senza toccare il TC.

---

## 1. Stato connettività (probe live 2026-07-13)

Probe HTTP dalla sandbox Replit verso ogni hostname del tunnel `bikerlink-tc`
(**senza** service token CF Access — che manca). Un `403 cloudflare` NON è un
guasto: è l'edge Cloudflare Access che rifiuta perché non ha il token → **il
tunnel e l'origine sono su**.

| Servizio  | Hostname                     | HTTP | Interpretazione |
|-----------|------------------------------|------|-----------------|
| GraphHopper | `gh.biker-link.net`        | 403  | UP — serve CF Access token |
| Valhalla  | `valhalla.biker-link.net`    | 403  | UP — serve CF Access token |
| Nominatim | `nominatim.biker-link.net`   | 403  | UP — serve CF Access token |
| Photon    | `photon.biker-link.net`      | 403  | UP — serve CF Access token |
| Ollama    | `ollama-tc.biker-link.net`   | 403  | UP — serve CF Access token |
| Whisper   | `whisper.biker-link.net`     | 403  | UP — serve CF Access token |
| AI Hub    | `hub.biker-link.net`         | 404  | UP — root senza route; auth app-level `HUB_GATE_TOKEN` |
| Analysis  | `analysis.biker-link.net`    | 401  | UP — gate proprio `X-Analysis-Gate-Token` (NON CF Access) |
| SSH       | `tc.biker-link.net`          | 502  | UP — host SSH-only (nessun origine HTTP), atteso |

> **Nota rete sandbox:** il DNS della sandbox può fallire su host dietro tunnel
> CF anche quando sono su. In questo caso tutti gli host hanno risposto con
> `server: cloudflare` + `cf-ray`, quindi la risoluzione ha funzionato e i codici
> sopra sono affidabili.

### Tunnel & DNS
- Tunnel unico per l'host fisico: **`bikerlink-tc`** =
  `86122511-2752-4002-aec9-1fdd7c25b9f5.cfargotunnel.com` (healthy).
- Account Cloudflare `biker-link.net`: `d116d3d97b133c543d02934be4bc98d2`.
- Hostname sul tunnel: `analysis, gh, hub, nominatim, ollama-tc, searxng, ssh,
  tc, valhalla, whisper, photon`.
- **Residuo da pulire:** `ollama.biker-link.net` (vecchio, senza `-tc`) CNAME
  ancora al tunnel morto `bikerlink-pc`
  (`4626e124-4601-43c2-bbda-78ef4295da2d`) — record DNS da eliminare (lato
  dashboard Cloudflare, non in questo repo).

---

## 2. Autenticazione

### CF Access — service token condiviso (riusabile)
- Policy Access **riusabile** `Allow bikerlink-tc-access service token`,
  condivisa da: `gh, valhalla, nominatim, whisper, ollama-tc, photon`.
- **Un solo** service token `bikerlink-tc-access` per tutti → credenziali =
  `CF_ACCESS_CLIENT_ID` (formato `<uuid>.access`) + `CF_ACCESS_CLIENT_SECRET`.
- Header su ogni richiesta: `CF-Access-Client-Id` / `CF-Access-Client-Secret`
  (vedi `server/lib/cf-access.ts`, già pronto). Gli stessi secret sono usati da
  `server/cache/redis-tunnel.ts` per il bridge TCP DragonflyDB (`cloudflared
  access tcp`).
- I token custom legacy (`X-GH-Token`/`Authorization: Bearer` per
  gh/valhalla/nominatim/whisper/ollama) restano attivi come **fallback in
  transizione** (dual-read): il codice invia entrambi.

### AI Hub / Analysis — gate applicativo (NON CF Access)
- **AI Hub** (`hub.biker-link.net`): env canonico `AI_HUB_URL` + token
  `HUB_GATE_TOKEN` (gate a livello app). Serve la directory condivisa tra agenti
  (`/home/andrea/agent-shared`).
- **Analysis** (`analysis.biker-link.net`): gate proprio via header
  `X-Analysis-Gate-Token` = `ANALYSIS_GATE_TOKEN`; env `HORUS_ANALYSIS_URL`.
  Gira su TC via pm2, porta 4600.

### SSH — cloudflared ProxyCommand (mai porta 22 diretta)
Metodo corretto (verificato live; **ricablato nel codice in Task #19**):
```bash
ssh -i ~/.ssh/tc_key \
    -o ProxyCommand="cloudflared access ssh --hostname %h" \
    "$TC_SSH_USER@$TC_SSH_HOST" 'comando'
```
- `TC_SSH_HOST` = **`ssh.biker-link.net`** (hostname SSH del tunnel; `tc.biker-link.net` NON è instradato come SSH → `bad handshake`).
- `TC_SSH_USER` = utente con sudo passwordless (probabile `andrea`, da
  confermare — un mismatch dà lo stesso `Permission denied (publickey)` di una
  chiave errata).
- `TC_SSH_KEY` = chiave **privata** OpenSSH (`-----BEGIN OPENSSH PRIVATE
  KEY-----`). Il paste nell'UI secret spesso **collassa i newline in spazi** →
  vanno riparati programmaticamente, mai chiedere all'utente di sistemarli a
  mano. Verificare il fingerprint con `ssh-keygen -l -f` (chiavi con nomi simili
  possono essere keypair diversi).
- `cloudflared` richiede `CF_ACCESS_CLIENT_ID/SECRET` in env per autenticarsi in
  modo non interattivo.

> ✅ **Ricablaggio completato (Task #19).** Entrambi i percorsi SSH usano ora
> Cloudflare Access, non più la password diretta (`TC_SSH_PASSWORD`, dismesso):
> - **Agente** — `.agents/skills/thinkcentre-access/tc.py` usa `ssh` di sistema con
>   `ProxyCommand="cloudflared access ssh --hostname %h"`, scaricando `cloudflared`
>   on-demand se assente e usando `TC_SSH_KEY` (chiave privata, newline ricostruiti)
>   in un file temporaneo `0600` rimosso a fine sessione.
> - **Server** — `server/routes/ssh-exec.ts` apre (lazy) il bridge
>   `server/lib/tc-ssh-bridge.ts` (`cloudflared access tcp` → listener locale, stesso
>   pattern di `server/cache/redis-tunnel.ts`) e si collega con `ssh2` + chiave privata.
> Il binario `cloudflared` è baked in `./bin/cloudflared` dal deploy-build (condiviso
> col bridge Redis); nella sandbox viene scaricato on-demand. Verificato live
> 2026-07-14: entrambi i percorsi eseguono comandi reali sul TC (uptime/hostname
> `bikerlink`).

---

## 3. Istanze Ollama, modelli e GPU/VRAM

Endpoint Ollama **unico e condiviso** da tutti gli agenti:
`ollama-tc.biker-link.net` (env per-agente puntano allo stesso URL).

| Agente     | Modello (realtà TC) | Residenza VRAM | Note |
|------------|---------------------|----------------|------|
| **Horus**  | `qwen3:4b`          | Residente      | AI routing / analisi |
| **Bowie**  | `qwen3:1.7b`        | Residente      | Assistente in-app |
| **Nadir**  | `all-minilm`        | Residente      | Embedding / semantic search |
| **Quebracho** | `granite4:tiny-h`| **CPU+RAM** (`num_gpu:0`) | ~4.5GB RAM, ~3.1s load |
| **Ares**   | `devstral:24b`      | Heavy on-demand | Evicts economy lineup, poi ripristina |

> **DIVERGENZE rispetto al testo del task (da correggere nei secret):**
> - Bowie: il briefing (decisione utente **2026-07-05**) usa **`qwen3:1.7b`**,
>   non `llama3.2:3b`. → `BOWIE_OLLAMA_MODEL=qwen3:1.7b`.
> - Ares: la policy di naming del briefing indica **`devstral:24b`**, mentre il
>   default nel codice (`server/lib/ares-client.ts`) è ancora
>   `qwen3-coder:30b`. → impostare `ARES_OLLAMA_MODEL=devstral:24b` per allineare
>   alla realtà TC.

### GPU/VRAM (novità di questa riconfigurazione)
- **GPU ora abilitata** sul TC per gli agenti Ollama (driver/BIOS risolti).
  ~8.19GB VRAM totali.
- Lineup residente ~6.1GB (Horus + Bowie + Nadir), headroom confortevole.
- Quebracho forzato su CPU (`options.num_gpu:0`) — switch reversibile via flag.
- Whisper (`bikerlink-whisper` Docker, faster_whisper/large-v2) è **CPU-only**,
  non compete per la VRAM.
- **Alert GPU/VRAM dedicati** esistono lato BikerBlog. → **La topologia dei
  probe di sistema (task #3 monitor) deve includere una metrica GPU/VRAM**, non
  solo CPU/RAM.

### Regole client Ollama (obbligatorie)
- `stream:true` **sempre** (il tunnel CF chiude ~100s idle).
- `think:false` per i modelli Qwen3 (altrimenti `content` vuoto).
- `keep_alive:-1` come **numero**, non stringa (Ollama 400 sulla stringa).

---

## 4. Ares e Photon

- **Ares** — ⚠️ **due accezioni, da non confondere** (riconciliazione = task #4):
  - **Ares agente Ollama (design attuale, BikerBlog):** 4° agente **heavy
    on-demand** che gira il modello **`devstral:24b` SUL TC**, via l'**endpoint
    Ollama condiviso** `ollama-tc.biker-link.net` ("stesso tunnel condiviso" —
    briefing). Admin-only: evicts la lineup economy e ripristina in `finally`.
    → `ARES_OLLAMA_URL=https://ollama-tc.biker-link.net`,
    `ARES_OLLAMA_MODEL=devstral:24b`. **NON** è una macchina separata in questo
    ruolo.
  - **Ares macchina LAN (path legacy nel repo BikerLink):** un PC fisico
    separato sulla stessa LAN, **LAN-only** via ProxyJump dal TC
    (`scripts/thinkcentre/ares/ares.py`, chiave `ARES_SSH_KEY`, provider
    diagnostica `DIAG_OLLAMA_*`), con WoL `wake-ares.sh` (MAC
    `A8:E2:91:2C:90:6A`). Questo riflette il **vecchio** design; verificare in
    task #4 se è ancora in uso o superato dall'Ares-su-TC. I secret
    `ARES_SSH_KEY`/`ARES_LAN_IP/MAC/USER` appartengono a QUESTO path, non
    all'endpoint Ollama.
- **Photon**: nuovo servizio geocoding su TC (`photon.biker-link.net`,
  `photon-1.2.1.jar`, systemd `photon.service`, bind `127.0.0.1:2322`, index
  Europa 44GB OpenSearch). **Riusa** la stessa policy/service-token CF Access
  degli altri servizi geo (nessun secret nuovo dedicato). Env: `PHOTON_URL`.

---

## 5. Canale BikerBlog (`/_internal/agent-briefing`)

- **Verificato live 2026-07-13:** `GET
  {BIKERBLOG_BRIEFING_URL}/…/agent-briefing` con `Authorization: Bearer
  {BIKERBLOG_INTERNAL_TOKEN}` → **HTTP 200**, ~204 KB di memoria agente markdown.
- `BIKERBLOG_INTERNAL_TOKEN` è un **secret** (presente). `BIKERBLOG_BRIEFING_URL`
  è un **env var shared** (presente) che punta al dominio `.replit.dev` del repl
  BikerBlog.
- ⚠️ **Stabilità URL:** il dominio `.replit.dev` cambia se il repl BikerBlog
  viene ricreato/rinominato. Se in futuro il briefing dà errore DNS/404,
  aggiornare `BIKERBLOG_BRIEFING_URL`. Questo è la **fonte di sincronizzazione
  continua** per i task successivi — usarlo prima di assumere la topologia.

---

## 6. Report secret (presente / mancante / valore o dove ricavarlo)

### ✅ Già presenti (non toccare)
`DATABASE_URL`, `SESSION_SECRET`, `GRAPHHOPPER_TOKEN`, `VALHALLA_API_KEY`,
`NOMINATIM_TOKEN`, `WHISPER_TOKEN`, `THINKCENTRE_METRICS_URL`, `TC_REDIS_URL`,
`DIAG_GITHUB_TOKEN`, `BIKERBLOG_INTERNAL_TOKEN` (secret) +
`BIKERBLOG_BRIEFING_URL` (env var shared). Verificato: `BIKERBLOG_*` funzionanti.

### ❌ Mancanti — con valore noto (derivabile, NON credenziale)
Questi hanno un valore già determinato dalla topologia (hostname pubblici / tag
modello upstream). Vanno aggiunti come da convenzione del team (URL server =
secret):

| Secret | Valore |
|--------|--------|
| `GRAPHHOPPER_URL` | `https://gh.biker-link.net` |
| `VALHALLA_URL` | `https://valhalla.biker-link.net` |
| `NOMINATIM_URL` | `https://nominatim.biker-link.net` |
| `PHOTON_URL` | `https://photon.biker-link.net` |
| `AI_HUB_URL` | `https://hub.biker-link.net` |
| `HORUS_ANALYSIS_URL` | `https://analysis.biker-link.net` |
| `HORUS_OLLAMA_URL` | `https://ollama-tc.biker-link.net` |
| `BOWIE_OLLAMA_URL` | `https://ollama-tc.biker-link.net` |
| `ARES_OLLAMA_URL` | `https://ollama-tc.biker-link.net` (vedi §4 — Ares = modello heavy sul TC, non la vecchia macchina LAN) |
| `QUEBRACHO_OLLAMA_URL` | `https://ollama-tc.biker-link.net` |
| `WHISPER_URL` | `https://whisper.biker-link.net` **(primario)** |
| `HORUS_OLLAMA_MODEL` | `qwen3:4b` |
| `BOWIE_OLLAMA_MODEL` | `qwen3:1.7b` |
| `ARES_OLLAMA_MODEL` | `devstral:24b` |
| `QUEBRACHO_OLLAMA_MODEL` | `granite4:tiny-h` |

> **Whisper URL — nome secret corretto:** i path runtime principali
> (`server/routes/whisper.ts`, `server/ai/whisper-provider-config.ts`,
> `server/routes/admin-whisper-config.ts`, monitor probes) leggono **`WHISPER_URL`**
> con auth **CF Access** (`cfAccessHeaders()`), non `WHISPER_TOKEN` (legacy).
> `THINKCENTRE_WHISPER_URL` (con fallback `WHISPER_HOME_URL`) è usato **solo** da un
> path admin secondario (`admin-whisper-config.part2.ts`). → aggiungere
> **`WHISPER_URL`** come primario; `THINKCENTRE_WHISPER_URL` opzionale per quel
> fallback admin.

### ❌ Mancanti — credenziali (valore SOLO dall'utente / dashboard CF / TC)
| Secret | A cosa serve | Dove ricavarlo |
|--------|--------------|----------------|
| `CF_ACCESS_CLIENT_ID` | Service token CF Access (tutti i servizi HTTP TC + bridge Redis + SSH) | Dashboard CF → Access → Service Tokens `bikerlink-tc-access` (formato `<uuid>.access`) |
| `CF_ACCESS_CLIENT_SECRET` | idem | idem (mostrato una sola volta alla creazione; rigenerare se perso) |
| `TC_SSH_HOST` | Host SSH ProxyCommand | `tc.biker-link.net` |
| `TC_SSH_USER` | Utente SSH sudo | utente TC (probabile `andrea`) — confermare |
| `TC_SSH_KEY` | Chiave privata OpenSSH per SSH | keypair dell'agente; pubblica già in `authorized_keys` sul TC |
| `HUB_GATE_TOKEN` | Gate AI Hub | token app-level AI Hub (lato BikerBlog/TC) |
| `ANALYSIS_GATE_TOKEN` | Gate servizio analysis | token app-level analysis (lato TC) |
| `THINKCENTRE_AGENT_TOKEN` | Agent token metrics/health-infra probes | agent sul TC |
| `QUEBRACHO_GITHUB_TOKEN` | PAT GitHub per Quebracho | GitHub (fine-grained PAT — attenzione al prefisso `github_pat_` che il paste può perdere) |
| `ARES_SSH_KEY` | Chiave privata ed25519 per Ares (ProxyJump dal TC) | keypair agente Ares |
| `ARES_LAN_IP` / `ARES_MAC` / `ARES_USER` | (opzionali) risoluzione IP/utente Ares | LAN; MAC noto `A8:E2:91:2C:90:6A`, user default `ares-agent`; IP dinamico |

### ⚠️ Token Ollama per-agente (opzionali / in transizione)
`HORUS_OLLAMA_TOKEN`, `BOWIE_OLLAMA_TOKEN`, `ARES_OLLAMA_TOKEN` sono i token
custom **legacy** (`Authorization: Bearer`). Con CF Access attivo l'auth
principale è il service token; questi restano solo come fallback dual-read. Se
il TC non richiede più il bearer custom su Ollama, possono restare vuoti.
`OLLAMA_URL/OLLAMA_TOKEN/OLLAMA_MODEL` generici: legacy, il codice usa i nomi
per-agente `*_OLLAMA_*`.

---

## 7. Secret da aggiungere — per criticità

**🔴 Bloccanti (accesso TC) — richiesti all'utente via flusso sicuro:**
`CF_ACCESS_CLIENT_ID`, `CF_ACCESS_CLIENT_SECRET`, `TC_SSH_HOST`, `TC_SSH_USER`,
`TC_SSH_KEY`.
Senza CF Access **nessuna** chiamata HTTP autenticata verso il TC funziona (tutto
403) e l'SSH ProxyCommand non si autentica.

**🟠 Alta (agenti AI + monitor — task #3/#4/#5):**
`AI_HUB_URL` + `HUB_GATE_TOKEN`, `HORUS_ANALYSIS_URL` + `ANALYSIS_GATE_TOKEN`,
`HORUS_OLLAMA_URL` + `HORUS_OLLAMA_MODEL`, `BOWIE_OLLAMA_URL` +
`BOWIE_OLLAMA_MODEL`, `THINKCENTRE_AGENT_TOKEN`.

**🟡 Media (routing/geocoding + Quebracho + Ares):**
`GRAPHHOPPER_URL`, `VALHALLA_URL`, `NOMINATIM_URL`, `PHOTON_URL`,
`WHISPER_URL` (primario; `THINKCENTRE_WHISPER_URL` opzionale),
`QUEBRACHO_OLLAMA_URL` + `QUEBRACHO_OLLAMA_MODEL`,
`ARES_OLLAMA_URL` + `ARES_OLLAMA_MODEL`, `QUEBRACHO_GITHUB_TOKEN`, `ARES_SSH_KEY`
(+ `ARES_LAN_IP/MAC/USER` opzionali — path Ares-LAN legacy, vedi §4).

**🟢 Da valutare/pulire:** token Ollama per-agente legacy (opzionali);
`OLLAMA_*` generici (legacy); record DNS `ollama.biker-link.net` (dashboard CF).

---

## 8. Verifica live 2026-07-14 (dopo l'aggiunta dei 5 secret bloccanti)

Tutte le verifiche pianificate sono state **eseguite con successo** (SSH +
probe HTTP autenticati) usando `cloudflared` scaricato temporaneamente nella
sandbox (binario e chiave privata rimossi a fine sessione — nessun secret o
credenziale è stato lasciato su disco).

### ⚠️ Correzione secret: `TC_SSH_HOST` <!-- pragma: allowlist secret -->
Il tunnel espone **due hostname SSH distinti**: `ssh.biker-link.net` e
`tc.biker-link.net`. **Solo `ssh.biker-link.net` fa da bridge SSH funzionante**
(handshake OK, login riuscito). Il valore attualmente salvato in `TC_SSH_HOST`
punta a `tc.biker-link.net`, che con `cloudflared access ssh` fallisce con
`websocket: bad handshake` (quell'hostname non è instradato come servizio SSH
sul tunnel). **Azione richiesta:** aggiornare il secret `TC_SSH_HOST` a
`ssh.biker-link.net`. `TC_SSH_USER` e `TC_SSH_KEY` sono invece **corretti e
verificati** (fingerprint `SHA256:VedSIgT9hsyOl4BHopnYlWZh4XP5Q9xzm/nVHfbgVC4`,
commento chiave `replit-agent@bikerblog`; login riuscito, hostname box
`bikerlink`).

### Probe HTTP autenticati (con `CF-Access-Client-Id/Secret`)
| Servizio | Esito | Causa (verificata via SSH) |
|----------|-------|------------------------------|
| Photon | **200 OK** | — |
| Whisper | **200 OK** | — (vedi nota implementazione sotto) |
| Ollama (`ollama-tc`) | **200 OK** — `/api/tags` risponde | — |
| GraphHopper (`gh`) | **502** | Ingress del tunnel punta a `http://127.0.0.1:8989`, ma quella porta **non è pubblicata sull'host** (i container GH sono sani — verificato `health` interno via `docker exec` — ma il loro 8989 vive solo nella rete Docker interna). **Bug di configurazione ingress/porta sul lato TC**, non applicativo. |
| Valhalla | **502** | Confermato il problema già noto in memoria: il servizio ascolta realmente su **8002** (pubblicato e in LISTEN), ma l'ingress del tunnel instrada verso **8003** (non pubblicata). |
| Nominatim | **502** | Non è un problema di routing: il servizio **non è in esecuzione** (`systemctl is-active nominatim` → `inactive`, nessun container docker residuo). Verosimilmente sospeso/decommissionato in favore di Photon durante la migrazione. |

> Il tunnel `cloudflared` sul TC gira come servizio **token-managed** (config da
> dashboard Cloudflare, nessun `/etc/cloudflared/config.yml` locale) —
> `systemctl status cloudflared` mostra gli errori `dial tcp 127.0.0.1:8989:
> connection refused` in tempo reale, confermando la diagnosi sopra. Le regole
> ingress si correggono dalla dashboard Cloudflare (Zero Trust → Tunnels),
> fuori dallo scope di questo task e di questo repo.

### Stato box (via SSH)
- Host: `bikerlink`, kernel `7.0.0-22-generic` (Ubuntu), uptime **16h36m**.
- RAM: **30GiB totali**, 16GiB usati, 13GiB disponibili; swap 207GiB (8.1MiB
  usati).
- Disco root: 1.9T totali, 560G usati (32%).
- **GPU**: NVIDIA GeForce **GTX 1070**, VRAM **8192 MiB totali / 6813 MiB
  usati**, utilizzo 96% al momento del check (coerente con gli ~8.19GB della
  memoria BikerBlog). Confermato il ripristino GPU.
- Servizi systemd attivi: `cloudflared`, `ollama`, `photon`, `nginx`.
- Container Docker attivi (17h uptime, tutti healthy): 8 aree GraphHopper
  (`ecuador, germania-centro, francia-benelux, iberia, arco-alpino, est,
  balcani, grecia`), `bikerlink-dragonfly`, `bikerlink-valhalla`,
  `bikerlink-postgres`, `bikerlink-pgadmin`, `bikerlink-uptime-kuma`.

### Correzioni al modello dati (rispetto a quanto documentato prima della verifica live)
- **Ollama residente ORA (`ollama ps` reale, non da briefing):**
  `qwen3:4b`, **`llama3.2:3b`**, `granite4:tiny-h`. **NON** coincide con quanto
  riportato dal briefing BikerBlog (`qwen3:1.7b` per Bowie, `all-minilm` per
  Nadir non risulta caricato). Ipotesi: la "decisione finale 2026-07-05" del
  briefing non è ancora stata applicata/ricaricata sul TC, oppure Bowie sta
  ancora usando `llama3.2:3b` in pratica. **Task #4 (Ricollegamento agenti AI)
  deve verificare quale sia il modello Bowie realmente da configurare** prima
  di fissare `BOWIE_OLLAMA_MODEL` — non fidarsi ciecamente né del testo del
  task né del briefing senza un secondo controllo `ollama ps` al momento del
  ricablaggio.
- **Whisper — implementazione reale diversa da quanto assunto:** il processo
  live è `/opt/whisper.cpp/build/bin/whisper-server` (**whisper.cpp**, modello
  `ggml-medium.bin`, lingua `it`, 4 thread, bind `127.0.0.1:8080` dietro nginx),
  **non** un container Docker `faster_whisper/large-v2` come indicato da una
  nota di memoria precedente (probabilmente riferita a una versione precedente
  del setup, superata dalla migrazione). Nessun impatto sui secret (auth resta
  CF Access + `WHISPER_URL`), ma impatta eventuali assunzioni su formato
  richieste/latenza in task successivi.

### Fallback rete di casa (non necessario in questa sessione — TC è stato online tutto il tempo)
Se in una verifica futura il TC risultasse irraggiungibile per un guasto della
**linea di casa** (non del TC stesso): esiste un fallback già pronto e testato
su **BikerBlog** — script di rete + bundle USB per collegare il TC a internet
via **tethering USB** di uno smartphone Samsung (rilevamento automatico del
gateway). Non è codice applicativo: recuperarlo da BikerBlog. Il tunnel CF è
solo in uscita → basta qualunque connessione, niente IP statico né config
router.
