# BikerLink — Kalman Filter Service (self-hosted)

Servizio Node dedicato che stima nel tempo il **bias di velocità e heading** di
ogni utente a partire dagli scostamenti osservati tra **dead reckoning (DR)** e
**GPS**. Usa la libreria open source [`kalman-filter`](https://github.com/piercus/kalman-filter)
(piercus, MIT, v2.3.0 — Kalman/Extended Kalman Filter multi-dimensionale in JS).

È il componente statistico su cui il **Task #47** (motore di correzione DR/GPS +
pannello admin) costruirà la tabella di scostamento e il modulo di correzione.
Questo servizio fornisce **solo** la matematica del filtro e la persistenza dello
stato per-utente; NON raccoglie dati, non ha DB applicativo, non ha UI.

---

## Il modello

Stato stimato per ogni utente (2 dimensioni):

```
x = [ speedBias , headingBias ]
```

- **Dinamica**: random-walk / `constant-position` (transizione = identità). I
  bias sono considerati quasi costanti, con un piccolo rumore di processo `Q`
  che permette una deriva lenta nel tempo.
- **Osservazione**: si osserva **direttamente lo scostamento** DR−GPS, che è il
  bias corrente più rumore di misura. Matrice di osservazione `H` = identità.

  ```
  z = [ drSpeed - gpsSpeed ,  angleDiff(drHeading, gpsHeading) ]
  ```

  `angleDiff` normalizza la differenza angolare nell'intervallo (−180°, 180°].
- **Fiducia adattiva**: la covarianza di osservazione `R` è scalata
  dall'accuratezza del fix GPS (metri). Un fix impreciso pesa meno; uno preciso
  sposta di più la stima. Riferimento: `refAccuracyM = 10 m` ⇒ `R = obsVar`;
  scaling `(accuracy / 10)²`, limitato tra `0.25×` e `25×`.

I parametri del modello sono in `lib/kalman-model.js` (oggetto `DEFAULTS`) e sono
sovrascrivibili via env `KALMAN_<NOME>` (es. `KALMAN_PROC_SPEED_VAR=0.02`).

---

## Contratto dati dell'API

Base path (dietro il proxy del `thinkcentre-agent`): **`/kalman`**.
Dal backend dell'app: `<KALMAN_SERVICE_URL>` = `https://tc.biker-link.net/kalman`.

Autenticazione: la stessa dell'host `tc.biker-link.net` — header
`X-Agent-Token: <THINKCENTRE_AGENT_TOKEN>` **+** Cloudflare Access Service Token
(`CF-Access-Client-Id` / `CF-Access-Client-Secret`). Il servizio a valle bind
solo su `127.0.0.1` e non ha auth propria (la applica l'agente/edge).

### `POST /update` — assorbe un campione di osservazione

Richiesta:

```jsonc
{
  "userId": "rider42",          // string, 1..128 char (obbligatorio)
  "dr": {                        // stima dead reckoning (obbligatorio)
    "speed": 18.0,               //   m/s   (obbligatorio, numero finito)
    "heading": 275.0,            //   gradi 0..360 (obbligatorio)
    "lat": 45.4642,              //   opzionale (diagnostica/estensioni)
    "lon": 9.1900                //   opzionale
  },
  "gps": {                       // misura GPS alla riacquisizione (obbligatorio)
    "speed": 15.0,               //   m/s   (obbligatorio)
    "heading": 270.0,            //   gradi (obbligatorio)
    "lat": 45.4643,              //   opzionale
    "lon": 9.1901                //   opzionale
  },
  "accuracy": 6.0,               // accuratezza fix GPS in metri (opzionale, raccomandata)
  "timestamp": 1700000000000     // ms epoch (opzionale, default = now del servizio)
}
```

Risposta `200`:

```jsonc
{
  "ok": true,
  "userId": "rider42",
  "biases": {
    "speedBias": 2.84,           // m/s   — DR sovrastima la velocità di ~2.84 m/s
    "headingBias": 4.81,         // gradi — DR sovrastima l'heading di ~4.81°
    "speedBiasStdDev": 1.17,     // incertezza (deviazione standard) sul bias velocità
    "headingBiasStdDev": 5.88,   // incertezza sul bias heading
    "speedBiasVariance": 1.36,
    "headingBiasVariance": 34.62
  },
  "sampleCount": 1,              // campioni assorbiti per questo utente
  "updatedAt": 1700000000000,   // timestamp dell'ultimo update
  "lastObservation": {
    "speedDeviation": 3.0,       // z[0] usato = drSpeed - gpsSpeed
    "headingDeviation": 5.0,     // z[1] usato = angleDiff(drHeading, gpsHeading)
    "accuracy": 6.0,
    "accuracyScale": 0.36        // fattore applicato a R (fix preciso → <1)
  },
  "filterIndex": 0              // indice interno del filtro (numero di step - 1)
}
```

**Interpretazione dei bias** (contratto per il Task #47): `speedBias` e
`headingBias` sono i valori **medi** stimati dello scostamento DR−GPS. Per
correggere una stima DR verso il valore "vero": `corrected = dr - bias`. Le
`*StdDev` indicano quanto fidarsi del bias (grande = ancora incerto: pochi
campioni o fix imprecisi).

Errori: `400` con `{ ok:false, error }` per payload non valido; `500` per errori
interni del filtro.

### `GET /state/:userId` — stato corrente

Risposta `200`: stessa forma di `/update` (senza ri-applicare un campione).
`404 { ok:false, error:"utente sconosciuto" }` se non esiste stato per l'utente.

### `POST /reset/:userId` — azzera il filtro dell'utente

`200 { ok:true, userId, reset:true|false }` (`reset:false` se non esisteva).

### `GET /health` — stato servizio

`200 { ok:true, service, version, users, uptimeSec }`.

---

## Persistenza

Lo stato per-utente è tenuto in memoria e persistito (debounce 2 s + su
shutdown) su `data/state.json` (JSON atomico via file `.tmp` + rename), così
sopravvive a un restart pm2. Evizione LRU oltre `MAX_USERS` (default 50 000).

---

## Installazione e avvio (ThinkCentre)

```bash
cd infra/self-host/kalman
npm ci --omit=dev            # installa la dipendenza kalman-filter
node test-model.js           # (opzionale) smoke test del modello

# Avvio persistente con pm2 (stesso modello del thinkcentre-agent)
pm2 start ecosystem.config.js
pm2 save
pm2 startup                  # una tantum: genera lo script systemd di boot
```

Il servizio ascolta su `127.0.0.1:9210` (env `PORT` / `BIND_HOST`). **Non** va
esposto in LAN né via una nuova ingress Cloudflare: l'accesso pubblico passa
esclusivamente dal `thinkcentre-agent`, che inoltra `/kalman/*` verso questo
servizio (env `KALMAN_URL` dell'agente, default `http://127.0.0.1:9210`).

### Variabili d'ambiente

| Variabile | Default | Descrizione |
|-----------|---------|-------------|
| `PORT` | `9210` | porta di ascolto |
| `BIND_HOST` | `127.0.0.1` | host di bind (NON esporre in LAN) |
| `STATE_FILE` | `./data/state.json` | file di persistenza |
| `MAX_USERS` | `50000` | tetto utenti in memoria (LRU-evict) |
| `KALMAN_*` | vedi `DEFAULTS` | override parametri modello (es. `KALMAN_OBS_SPEED_VAR`) |

---

## Verifica

```bash
# In locale sul ThinkCentre
curl -s http://127.0.0.1:9210/health

# Attraverso il proxy dell'agente (come lo raggiunge il backend cloud)
curl -s https://tc.biker-link.net/kalman/health \
  -H "X-Agent-Token: <THINKCENTRE_AGENT_TOKEN>" \
  -H "CF-Access-Client-Id: <id>.access" \
  -H "CF-Access-Client-Secret: <secret>"

# Un campione di prova
curl -s -X POST https://tc.biker-link.net/kalman/update \
  -H "X-Agent-Token: <THINKCENTRE_AGENT_TOKEN>" \
  -H "CF-Access-Client-Id: <id>.access" \
  -H "CF-Access-Client-Secret: <secret>" \
  -H "Content-Type: application/json" \
  -d '{"userId":"test","dr":{"speed":18,"heading":275},"gps":{"speed":15,"heading":270},"accuracy":6}'
```

---

## Comportamento di fallback (lato app)

Il client backend è `server/services/kalman-client.ts`. È **fail-soft**: se
`KALMAN_SERVICE_URL` non è configurato, o il ThinkCentre è spento, o il tunnel è
giù, ogni metodo ritorna `null` **senza lanciare eccezioni**. Il modulo di
correzione DR/GPS (Task #47) non deve crashare né bloccare l'ingestione della
telemetria: in assenza di stato Kalman, si comporta come "nessuna correzione
disponibile", coerente con gli altri servizi self-hosted opzionali.

### Secret da impostare nel backend (Replit)

| Secret | Valore |
|--------|--------|
| `KALMAN_SERVICE_URL` | `https://tc.biker-link.net/kalman` |
| `THINKCENTRE_AGENT_TOKEN` | (già presente) token dell'agente TC |
| `CF_ACCESS_CLIENT_ID` / `CF_ACCESS_CLIENT_SECRET` | (già presenti) Service Token CF Access |
