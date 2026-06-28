# Ollama sul server di casa — Guida BikerLink

> Guida passo-passo per installare **Ollama** (LLM locale) sul server di casa
> (ThinkCentre 910q, 32 GB RAM, Ubuntu 26.04 LTS) ed esporlo all'app BikerLink
> tramite l'URL pubblico Tailscale Funnel già esistente, con autenticazione a
> token — stesso pattern di GraphHopper (`X-GH-Token` → `X-Ollama-Token`).

Lo script automatico è: [`scripts/setup-ollama-server.sh`](../scripts/setup-ollama-server.sh).

---

## 1. Prerequisiti

Sul server di casa devono essere già presenti e funzionanti:

- **Ubuntu 26.04 LTS** (o versione compatibile) con accesso `sudo`.
- **nginx** installato e configurato con un `server { ... }` servito da
  **Tailscale Funnel** (l'URL pubblico, es. `https://bikerlink.tail5056aa.ts.net`,
  già raggiungibile dall'esterno).
- Connessione internet (per scaricare Ollama e i modelli).
- ~10 GB liberi su disco (Ollama + mistral-nemo:latest ~7GB + overhead).

> **Hardware**: il ThinkCentre ha CPU Intel i5-7500T e GTX 1070 (8GB VRAM). Lo script
> NON installa CUDA. Con GPU: `mistral-nemo:latest` (12B, ~7GB) gira a 13–16 token/s
> con `OLLAMA_FLASH_ATTENTION=1`. Su CPU-only: consigliati modelli ≤ 8B.

---

## 2. Copia ed esegui lo script via SSH

Dal tuo PC, copia lo script sul server e lancialo:

```bash
# 1) Copia lo script sul server (sostituisci utente/host)
scp scripts/setup-ollama-server.sh utente@bikerlink.tail5056aa.ts.net:~/

# 2) Connettiti via SSH
ssh utente@bikerlink.tail5056aa.ts.net

# 3) Esegui (chiederà la password sudo quando serve)
bash setup-ollama-server.sh
```

> In alternativa, se hai già il repo sul server, puoi eseguirlo direttamente da lì.

### Override opzionali

Lo script funziona senza parametri, ma puoi personalizzarlo con variabili
d'ambiente:

```bash
# Riusa un token esistente invece di generarne uno nuovo
OLLAMA_TOKEN="il-mio-token-esistente" bash setup-ollama-server.sh

# Forza l'hostname pubblico se l'auto-detect Tailscale non funziona
PUBLIC_HOST="bikerlink.tail5056aa.ts.net" bash setup-ollama-server.sh

# Cambia i modelli scaricati
CHAT_MODEL="llama3.2:3b" bash setup-ollama-server.sh

# Forza il file nginx da modificare
NGINX_CONF="/etc/nginx/sites-enabled/default" bash setup-ollama-server.sh

# Salta il download dei modelli (solo install + nginx)
SKIP_MODELS=1 bash setup-ollama-server.sh
```

---

## 3. Cosa fa lo script (output atteso per fase)

### STEP 1 — Installazione Ollama
Usa il metodo ufficiale (`curl -fsSL https://ollama.com/install.sh | sh`), che
installa **sempre l'ultima versione stabile** e crea il servizio systemd.

```
[ OK  ] Ollama installato: ollama version is 0.x.x
```

### STEP 2 — Servizio systemd
Verifica `ollama.service`. Forza il bind su **solo localhost**
(`OLLAMA_HOST=127.0.0.1:11434`) tramite drop-in: Ollama non è mai esposto
direttamente, solo via nginx + token. Se il service non esiste, ne crea uno minimo.

```
[ OK  ] ollama.service attivo: active
```

### STEP 3 — Download modelli
Scarica un unico modello:
- **`mistral-nemo:latest`** → 12B parametri, luglio 2024, ottimo per chat/parsing
  e multilingue. Con GTX 1070 (8GB VRAM) + `OLLAMA_FLASH_ATTENTION=1` raggiunge
  13–16 token/s. Richiede ~7GB disco.

Crea inoltre il modello custom **`bikerlink`** basato su `mistral-nemo:latest` con
system prompt e parametri ottimizzati (vedere `BikerLink.Modelfile`).

```
[ OK  ] Modello scaricato: mistral-nemo:latest
[ OK  ] Modello custom 'bikerlink' creato con successo.
```

> **Sostituire il modello in futuro**: riesegui lo script con
> `CHAT_MODEL=<nuovo>` (vedi i modelli su <https://ollama.com/library>), poi
> aggiorna il secret `OLLAMA_MODEL` su Replit.

### STEP 4 — Configurazione nginx
Crea lo snippet `/etc/nginx/snippets/bikerlink-ollama.conf` con la
`location /ollama/` che:
- verifica l'header **`X-Ollama-Token`** (restituisce **403** se assente/errato);
- rimuove il prefisso `/ollama` con `rewrite`;
- proxya a `http://127.0.0.1:11434` con `proxy_buffering off` (streaming LLM) e
  timeout generosi (CPU lenta).

Poi inserisce automaticamente `include snippets/bikerlink-ollama.conf;` dentro il
primo blocco `server { ... }` del vhost (con **backup** del file e **rollback
automatico** se `nginx -t` fallisce).

```
[ OK  ] include aggiunto in /etc/nginx/sites-enabled/default (dentro il primo server{}).
[ OK  ] nginx validato e ricaricato.
```

> **Se l'inserimento automatico non riesce** (vhost insolito), lo script stampa
> la riga `include ...` da aggiungere a mano dentro il `server { ... }`, seguita da:
> ```
> sudo nginx -t && sudo systemctl reload nginx
> ```

### STEP 5 — Test
- API locale (`127.0.0.1:11434/api/tags`) → deve rispondere.
- Via nginx **senza** token → **403**.
- Via nginx **con** token → **200**.

### STEP 6 — Output finale (i 3 secret)
Lo script stampa i valori da copiare su Replit:

```
  OLLAMA_URL   = https://bikerlink.tail5056aa.ts.net/ollama
  OLLAMA_TOKEN = <token di 64 caratteri esadecimali>
  OLLAMA_MODEL = bikerlink
```

---

## 4. Aggiungere i 3 secret su Replit

Nel progetto BikerLink su Replit:

1. Apri **Tools → Secrets** (o il pannello "Secrets" / "Environment variables").
2. Aggiungi i tre secret con i valori stampati dallo script:
   - `OLLAMA_URL` → l'URL pubblico con suffisso `/ollama` (senza slash finale).
   - `OLLAMA_TOKEN` → il token (lo stesso verificato da nginx come `X-Ollama-Token`).
   - `OLLAMA_MODEL` → il modello custom (es. `bikerlink`).
3. **Riavvia il backend** perché i secret vengano letti.

> Il token è un segreto: non committarlo nel repo, non condividerlo.
>
> **Riesecuzioni e rotazione**: se rilanci lo script e nello snippet nginx esiste
> già un token, viene **riusato** (i secret su Replit restano validi). Lo script
> genera un token nuovo solo alla prima esecuzione o se passi `OLLAMA_TOKEN=<nuovo>`.
> Per forzare la rotazione: rimuovi `/etc/nginx/snippets/bikerlink-ollama.conf` e
> riesegui, poi aggiorna `OLLAMA_TOKEN` su Replit con il nuovo valore stampato.

---

## 5. Verificare che funzioni

### Dal server stesso
```bash
# Servizio attivo
systemctl is-active ollama        # → active

# Modelli presenti
ollama list

# API locale
curl http://127.0.0.1:11434/api/tags
```

### Dall'esterno (da un altro PC, via URL pubblico)
```bash
# Lista modelli (deve dare 200 + JSON con i modelli)
curl -H "X-Ollama-Token: <IL-TUO-TOKEN>" \
  https://bikerlink.tail5056aa.ts.net/ollama/api/tags

# Senza token deve dare 403
curl -i https://bikerlink.tail5056aa.ts.net/ollama/api/tags

# Generazione di prova
curl https://bikerlink.tail5056aa.ts.net/ollama/api/generate \
  -H "X-Ollama-Token: <IL-TUO-TOKEN>" \
  -d '{"model":"bikerlink","prompt":"Ciao","stream":false}'
```

### Dall'app BikerLink
Dopo aver impostato i 3 secret e riavviato il backend, l'integrazione lato app
(task gemello "Integrazione Ollama — lato app BikerLink") userà `OLLAMA_URL` +
`OLLAMA_TOKEN` per le chiamate. Verifica nei log del backend l'eventuale riga di
inizializzazione del client Ollama e l'assenza di errori 403/timeout.

---

## 6. Troubleshooting

**`ollama.service` non parte**
```bash
sudo systemctl status ollama --no-pager -l
journalctl -u ollama -n 100 --no-pager
```

**nginx restituisce 403 anche col token giusto**
- Verifica che l'header sia esattamente `X-Ollama-Token` e che il valore coincida
  con quello in `/etc/nginx/snippets/bikerlink-ollama.conf`.
- Ricontrolla che l'`include` sia nel `server { ... }` giusto (quello del Funnel).

**nginx restituisce 404 sulle rotte `/ollama/...`**
- L'`include` non è nel blocco server corretto, oppure manca lo slash finale.
  L'URL deve essere `…/ollama/api/...` (lo script gestisce il `rewrite`).

**Risposte molto lente**
- Normale su CPU senza GPU per il primo token (caricamento modello in RAM).
  Mantieni il servizio sempre attivo per evitare ricaricamenti. Considera un
  modello più piccolo (es. `llama3.2:3b`) per ridurre la latenza se la RAM
  disponibile è insufficiente per mistral-nemo (12B, ~7GB).

**Cambiare/aggiungere un modello**
```bash
# Scarica un nuovo modello
ollama pull llama3.2:3b
# Aggiorna il secret OLLAMA_MODEL su Replit (bikerlink o il nuovo modello) e riavvia
```

---

## 7. Riferimenti

- Script di setup: [`scripts/setup-ollama-server.sh`](../scripts/setup-ollama-server.sh)
- Pattern token auth di riferimento: [`server/graphhopper-client.ts`](../server/graphhopper-client.ts)
- Libreria modelli Ollama: <https://ollama.com/library>
- Documentazione API Ollama: <https://github.com/ollama/ollama/blob/main/docs/api.md>
