# Whisper sul server di casa — Guida BikerLink

> Guida passo-passo per installare **whisper.cpp** (speech-to-text locale di OpenAI,
> versione C++ ottimizzata per CPU) sul server di casa (ThinkCentre 910q, 32 GB RAM,
> Ubuntu 26.04 LTS) ed esporlo all'app BikerLink tramite l'URL pubblico Tailscale
> Funnel già esistente, con autenticazione a token — stesso pattern di GraphHopper
> (`X-GH-Token` → `X-Whisper-Token`).

Lo script automatico è: [`scripts/setup-whisper-server.sh`](../scripts/setup-whisper-server.sh).

---

## 1. Prerequisiti

Sul server di casa devono essere già presenti e funzionanti:

- **Ubuntu 26.04 LTS** (o versione compatibile) con accesso `sudo`.
- **nginx** installato e configurato con un `server { ... }` servito da
  **Tailscale Funnel** (l'URL pubblico, es. `https://bikerlink.tail5056aa.ts.net`,
  già raggiungibile dall'esterno).
- Connessione internet (per clonare il repo e scaricare il modello).
- ~3 GB liberi su disco (build whisper.cpp ~200 MB + modello medium ~1.5 GB).

> **Hardware**: il 910q ha CPU Intel i5-7500T (4 core, senza GPU).
> whisper.cpp è ottimizzato per CPU e usa automaticamente tutti i core via `-j$(nproc)`.
> Il modello `medium` è il punto ottimale per questo hardware:
> file audio da 10s → trascrizione in ~3s.

> **Nota**: `libsdl2-dev` **non è necessario** — il server gira in modalità headless
> (niente interfaccia grafica o audio locale). SDL serve solo per l'app interattiva
> di whisper.cpp da riga di comando, non per il server HTTP.

---

## 2. Copia ed esegui lo script via SSH

Dal tuo PC, copia lo script sul server e lancialo:

```bash
# 1) Copia lo script sul server (sostituisci utente/host)
scp scripts/setup-whisper-server.sh utente@bikerlink.tail5056aa.ts.net:~/

# 2) Connettiti via SSH
ssh utente@bikerlink.tail5056aa.ts.net

# 3) Esegui (chiederà la password sudo quando serve)
bash setup-whisper-server.sh
```

> In alternativa, se hai già il repo sul server, puoi eseguirlo direttamente da lì.

### Override opzionali

Lo script funziona senza parametri, ma puoi personalizzarlo con variabili d'ambiente:

```bash
# Riusa un token esistente invece di generarne uno nuovo
WHISPER_TOKEN="il-mio-token-esistente" bash setup-whisper-server.sh

# Forza l'hostname pubblico se l'auto-detect Tailscale non funziona
PUBLIC_HOST="bikerlink.tail5056aa.ts.net" bash setup-whisper-server.sh

# Cambia il modello (small, medium, large-v3)
WHISPER_MODEL="small" bash setup-whisper-server.sh

# Cambia la lingua di default
WHISPER_LANG="en" bash setup-whisper-server.sh

# Forza il file nginx da modificare
NGINX_CONF="/etc/nginx/sites-enabled/default" bash setup-whisper-server.sh

# Salta la compilazione (se whisper.cpp è già compilato)
SKIP_BUILD=1 bash setup-whisper-server.sh

# Salta il download del modello (se già presente)
SKIP_MODEL=1 bash setup-whisper-server.sh

# Salta la validazione dei flag del binario whisper-server
# Usare in ambienti CI/test dove il binario non è disponibile o ha versione diversa da prod
SKIP_FLAG_CHECK=1 bash setup-whisper-server.sh
```

### Tabella riepilogativa dei flag SKIP_*

| Flag | Salta | Quando usarlo |
|------|-------|---------------|
| `SKIP_BUILD=1` | Compilazione di whisper.cpp | Il binario è già compilato e presente in `/opt/whisper.cpp/build/bin/` |
| `SKIP_MODEL=1` | Download del modello ggml | Il file modello è già presente in `/opt/whisper.cpp/models/` |
| `SKIP_FLAG_CHECK=1` | Validazione dei flag del binario | Ambienti CI/test senza binario installato, o con versione diversa da prod |

> **Avviso**: i flag `SKIP_*` bypassano controlli di integrità. Non usarli in
> produzione a meno che non tu sappia esattamente cosa stai saltando.

---

### Uso in ambienti CI / pipeline automatizzate

In un ambiente CI (GitHub Actions, GitLab CI, Jenkins, ecc.) il binario
`whisper-server` normalmente non è installato. Eseguire lo script senza override
causerebbe il fallimento sul controllo dei flag del binario, sulla compilazione e
sul download del modello (~1.5 GB).

**Invocazione consigliata per CI/test:**

```bash
SKIP_BUILD=1 SKIP_MODEL=1 SKIP_FLAG_CHECK=1 bash scripts/setup-whisper-server.sh
```

Questa combinazione:
- **`SKIP_BUILD=1`** — non tenta di clonare o compilare whisper.cpp (nessun `git clone`, nessun `cmake`);
- **`SKIP_MODEL=1`** — non scarica il modello ggml (~1.5 GB), evitando timeout di rete;
- **`SKIP_FLAG_CHECK=1`** — non interroga il binario per validarne i flag, evitando errori
  da binario assente o versione non corrispondente.

> **Importante**: con tutti e tre i flag attivi, lo script configura
> solo il servizio systemd, nginx e il token di autenticazione — senza
> verificare che il binario sia funzionante. Assicurati che i passi di
> integrazione reale (avvio del servizio, test audio) avvengano su un
> runner che abbia effettivamente whisper-server compilato e il modello
> scaricato.

**Esempio job GitHub Actions:**

```yaml
- name: Setup whisper (CI dry-run — no build, no model, no binary check)
  run: SKIP_BUILD=1 SKIP_MODEL=1 SKIP_FLAG_CHECK=1 bash scripts/setup-whisper-server.sh
  env:
    WHISPER_TOKEN: ${{ secrets.WHISPER_TOKEN }}
```

**Usare solo `SKIP_FLAG_CHECK=1` (binario presente, versione diversa da prod):**

Se il runner ha whisper-server già compilato ma con una versione non identica
a quella di produzione (es. `HEAD~3` del repo upstream), il controllo dei flag
potrebbe fallire perché un flag sperimentale è stato aggiunto o rimosso.
In questo caso è sufficiente saltare solo la validazione:

```bash
SKIP_FLAG_CHECK=1 bash scripts/setup-whisper-server.sh
```

La compilazione e il download del modello avvengono normalmente; salta solo
l'asserzione sulla lista dei flag supportati dal binario.

---

## 3. Cosa fa lo script (output atteso per fase)

### STEP 1 — Prerequisiti e dipendenze

Installa i pacchetti mancanti tra `git`, `cmake`, `make`, `g++`, `ffmpeg` via apt.
`ffmpeg` è necessario per convertire formati audio (MP3, M4A, AAC → WAV).
`espeak-ng` viene installato se assente per il test audio finale.

```
[ OK  ] Dipendenze di sistema OK.
```

### STEP 2 — Build whisper.cpp

Clona `ggerganov/whisper.cpp` in `/opt/whisper.cpp/` (o aggiorna se già presente)
e compila con `cmake -DWHISPER_BUILD_SERVER=ON`. La compilazione usa tutti i core
disponibili (`-j$(nproc)`) e produce l'eseguibile `/opt/whisper.cpp/build/bin/whisper-server`.

```
[ OK  ] whisper.cpp compilato: /opt/whisper.cpp/build/bin/whisper-server
```

> **Tempo di compilazione atteso**: 3–8 minuti su i5-7500T.

### STEP 3 — Download modello

Scarica `ggml-medium.bin` (~1.5 GB) tramite lo script ufficiale
`models/download-ggml-model.sh` del repo (o direttamente da Hugging Face come fallback).

```
[ OK  ] Modello disponibile: /opt/whisper.cpp/models/ggml-medium.bin (1.5G)
```

> **Tempo di download**: 5–15 minuti (dipende dalla connessione).

#### Confronto modelli disponibili

| Modello   | Dimensione | Velocità (i5-7500T) | Precisione | Consigliato |
|-----------|-----------|---------------------|------------|-------------|
| `small`   | ~460 MB   | ~1s per 10s audio   | Media      | Test rapido |
| `medium`  | ~1.5 GB   | ~3s per 10s audio   | Buona      | **Produzione** ✓ |
| `large-v3`| ~2.9 GB   | ~10s per 10s audio  | Ottima     | Troppo lento su CPU |

> **Sostituire il modello in futuro**: riesegui lo script con `WHISPER_MODEL=<nuovo>`,
> poi riavvia il servizio: `sudo systemctl restart whisper`.

### STEP 4 — Servizio systemd

Crea l'utente di servizio dedicato `whisper`, lo script wrapper
`/opt/whisper.cpp/run-server.sh`, e l'unit file `/etc/systemd/system/whisper.service`.

Il server ascolta **solo su localhost** (`127.0.0.1:8089`) — mai esposto direttamente.
Avvia in automatico al boot e si riavvia in caso di crash (`Restart=on-failure`).

```
[ OK  ] whisper.service attivo: active
```

> **Prima partenza**: il caricamento del modello medium richiede ~10–15 secondi.
> Lo script attende fino a 60s prima di dichiarare il servizio come pronto.

### STEP 5 — Configurazione nginx

Crea lo snippet `/etc/nginx/snippets/bikerlink-whisper.conf` con la
`location /whisper/` che:

- verifica l'header **`X-Whisper-Token`** (restituisce **403** se assente/errato);
- imposta `client_max_body_size 25m` (necessario per file audio — il default nginx è 1 MB);
- rimuove il prefisso `/whisper` con `rewrite`;
- proxya a `http://127.0.0.1:8089` con `proxy_read_timeout 120s` (trascrizione su CPU);
- disabilita il buffering (`proxy_buffering off`) per risposta immediata.

Poi inserisce automaticamente `include snippets/bikerlink-whisper.conf;` dentro il
primo blocco `server { ... }` del vhost (con **backup** e **rollback automatico**
se `nginx -t` fallisce).

```
[ OK  ] include aggiunto in /etc/nginx/sites-enabled/default (dentro il primo server{}).
[ OK  ] nginx validato e ricaricato.
```

> **Se l'inserimento automatico non riesce** (vhost insolito), lo script stampa
> la riga `include ...` da aggiungere a mano dentro il `server { ... }`, seguita da:
> ```
> sudo nginx -t && sudo systemctl reload nginx
> ```

### STEP 6 — Test e output finale

- Servizio locale (`127.0.0.1:8089/inference`) → deve rispondere HTTP 400 (POST vuota attesa).
- Via nginx **senza** token → **403**.
- Via nginx **con** token + file audio di test (espeak-ng) → trascrizione JSON.

---

## 4. Aggiungere i 2 secret su Replit

Nel progetto BikerLink su Replit:

1. Apri **Tools → Secrets** (o il pannello "Secrets" / "Environment variables").
2. Aggiungi i due secret con i valori stampati dallo script:
   - `WHISPER_URL` → l'URL pubblico con suffisso `/whisper` (senza slash finale).
     Esempio: `https://bikerlink.tail5056aa.ts.net/whisper`
   - `WHISPER_TOKEN` → il token (lo stesso verificato da nginx come `X-Whisper-Token`).
3. **Riavvia il backend** perché i secret vengano letti.

> Il token è un segreto: non committarlo nel repo, non condividerlo.
>
> **Riesecuzioni e rotazione**: se rilanci lo script e nello snippet nginx esiste
> già un token, viene **riusato** (i secret su Replit restano validi). Lo script
> genera un token nuovo solo alla prima esecuzione o se passi `WHISPER_TOKEN=<nuovo>`.
> Per forzare la rotazione: rimuovi `/etc/nginx/snippets/bikerlink-whisper.conf` e
> riesegui, poi aggiorna `WHISPER_TOKEN` su Replit con il nuovo valore stampato.

---

## 5. Chiamare l'endpoint dall'app BikerLink

Il server accetta richieste `POST /inference` con un file audio (`multipart/form-data`).

### Parametri principali

| Campo             | Tipo   | Default | Descrizione |
|-------------------|--------|---------|-------------|
| `file`            | file   | —       | File audio (WAV, MP3, M4A, OGG, FLAC) — **obbligatorio** |
| `language`        | string | `it`    | Codice lingua ISO 639-1 (es. `it`, `en`, `fr`, `de`) |
| `response_format` | string | `json`  | `json` (oggetto) o `text` (solo testo) |

### Esempio curl (dal server o da altro PC)

```bash
# Trascrizione di un file WAV
curl -s -X POST \
  -H "X-Whisper-Token: <IL-TUO-TOKEN>" \
  -F "file=@/percorso/audio.wav" \
  -F "language=it" \
  -F "response_format=json" \
  https://bikerlink.tail5056aa.ts.net/whisper/inference

# Risposta attesa:
# { "text": " Inizia navigazione verso Milano." }
```

```bash
# Trascrizione di un file MP3 (ffmpeg converte automaticamente)
curl -s -X POST \
  -H "X-Whisper-Token: <IL-TUO-TOKEN>" \
  -F "file=@/percorso/audio.mp3" \
  -F "language=it" \
  -F "response_format=json" \
  https://bikerlink.tail5056aa.ts.net/whisper/inference
```

### Timeout consigliati lato client

| Durata audio | Tempo trascrizione (i5-7500T, medium) | Timeout client consigliato |
|-------------|---------------------------------------|---------------------------|
| 5–10 s      | ~2–4 s                                | 15 s                      |
| 30 s        | ~8–12 s                               | 30 s                      |
| 1–2 min     | ~20–40 s                              | 90 s                      |

---

## 6. Uso con casco — Comandi vocali navigatore BikerLink

Il caso d'uso principale di Whisper in BikerLink è la **navigazione vocale con casco**:
il pilota registra un comando vocale breve dall'app, il file audio viene inviato al
server Whisper e la trascrizione testuale viene interpretata come comando del navigatore.

### Flusso tipico

```
[Pilota parla nel microfono del casco]
        ↓
[App BikerLink registra 2–5 secondi di audio WAV]
        ↓
[POST /whisper/inference con X-Whisper-Token]
        ↓
[Server whisper.cpp trascrive in ~1–3s]
        ↓
[Backend BikerLink interpreta il testo come comando navigatore]
        ↓
[Risposta audio TTS o UI aggiornata]
```

### Comandi vocali di esempio (lingua italiana)

| Frase pronunciata                        | Azione navigatore attesa          |
|------------------------------------------|-----------------------------------|
| "Inizia navigazione verso Milano"        | Avvia rotta verso Milano          |
| "Dove sono?"                             | Mostra posizione corrente         |
| "Prossima uscita"                        | Indica uscita autostrada più vicina |
| "Ferma la navigazione"                   | Annulla rotta attiva              |
| "Trova distributore benzina"             | Cerca POI più vicino              |

> **Nota pratica**: registra audio breve (max 5–10 secondi) per risposta rapida.
> Per comandi vocali con casco, usa `language=it` (default) per massima precisione
> sull'italiano. Il modello `medium` gestisce bene accenti regionali italiani.

> **Integrazione nell'app**: l'implementazione della navigazione vocale lato app
> (registrazione microfono → invio a Whisper → parsing comando → azione mappa)
> è un task separato non incluso in questo setup.

---

## 7. Verificare che funzioni

### Dal server stesso

```bash
# Servizio attivo
systemctl is-active whisper        # → active

# Log del servizio
journalctl -u whisper -n 50 --no-pager

# Test trascrizione locale (senza nginx)
espeak-ng -v it -w /tmp/test.wav "Inizia navigazione verso Milano"
curl -s -X POST \
  -F "file=@/tmp/test.wav" \
  -F "language=it" \
  -F "response_format=json" \
  http://127.0.0.1:8089/inference
```

### Dall'esterno (da un altro PC, via URL pubblico)

```bash
# Senza token → deve dare 403
curl -i https://bikerlink.tail5056aa.ts.net/whisper/inference

# Con token + file audio → trascrizione JSON
curl -s -X POST \
  -H "X-Whisper-Token: <IL-TUO-TOKEN>" \
  -F "file=@/tmp/test.wav" \
  -F "language=it" \
  -F "response_format=json" \
  https://bikerlink.tail5056aa.ts.net/whisper/inference
```

---

## 8. Troubleshooting

**`whisper.service` non parte**
```bash
sudo systemctl status whisper --no-pager -l
journalctl -u whisper -n 100 --no-pager
# Causa comune: permessi sul modello o sul build binary
sudo chown -R whisper:whisper /opt/whisper.cpp
sudo systemctl restart whisper
```

**nginx restituisce 403 anche col token giusto**
- Verifica che l'header sia esattamente `X-Whisper-Token` (maiuscole/minuscole non contano in HTTP,
  ma nginx confronta il valore con `$http_x_whisper_token`).
- Controlla il token in `/etc/nginx/snippets/bikerlink-whisper.conf`.
- Assicurati che l'`include` sia nel blocco `server { ... }` del Funnel (non in un server{} diverso).

**nginx restituisce 413 (Request Entity Too Large)**
- Il file audio supera 25 MB. Comprimi il file o usa una durata più breve.
- Controlla che `client_max_body_size 25m;` sia nel blocco `location /whisper/`.

**Risposte molto lente (> 30s per audio breve)**
- Verifica che nessun altro processo stia saturando la CPU: `htop`
- Il primo avvio dopo un riavvio del servizio ricarica il modello in RAM (~10-15s): è normale.
  Il servizio systemd mantiene il modello caricato tra una richiesta e l'altra.
- Se la lentezza persiste, considera `WHISPER_MODEL=small` (meno preciso, ma ~3x più veloce).

**Errore `cmake` durante la compilazione**
```bash
# Assicurati che cmake >= 3.14 sia installato
cmake --version
# Se necessario, aggiorna
sudo apt-get install -y cmake
```

**File audio non accettato (formato non supportato)**
- whisper.cpp accetta WAV nativo. ffmpeg (installato dallo script) converte
  automaticamente altri formati. Se ricevi un errore, prova la conversione manuale:
```bash
ffmpeg -i audio.mp3 -ar 16000 -ac 1 -c:a pcm_s16le audio.wav
curl -X POST -F "file=@audio.wav" ... http://127.0.0.1:8089/inference
```

**Cambiare il modello in futuro**
```bash
# Scarica il nuovo modello
sudo bash /opt/whisper.cpp/models/download-ggml-model.sh large-v3

# Aggiorna il wrapper per usare il nuovo modello
sudo nano /opt/whisper.cpp/run-server.sh
# Modifica MODEL="...ggml-medium.bin" → MODEL="...ggml-large-v3.bin"
sudo systemctl restart whisper
```
> In alternativa, riesegui `bash setup-whisper-server.sh` con `WHISPER_MODEL=large-v3`.

---

## 9. Riferimenti

- Script di setup: [`scripts/setup-whisper-server.sh`](../scripts/setup-whisper-server.sh)
- Pattern token auth di riferimento: [`server/graphhopper-client.ts`](../server/graphhopper-client.ts)
- Guida analoga per Ollama: [`docs/ollama-server-setup.md`](./ollama-server-setup.md)
- Repository whisper.cpp: <https://github.com/ggerganov/whisper.cpp>
- Documentazione API server whisper.cpp: <https://github.com/ggerganov/whisper.cpp/tree/master/examples/server>
- Modelli disponibili: <https://huggingface.co/ggerganov/whisper.cpp>
