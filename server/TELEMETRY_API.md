# BikerLink — Telemetry API Contract

Versione: 1.0  
Data: 2026-05-20

---

## Overview

Il server BikerLink espone due endpoint REST per la raccolta dei log dei sensori del telefono durante la guida.  
Tutti gli endpoint sono protetti via Bearer token (sessione utente).

**Frequenza consigliata**: 1 campione/secondo (1 Hz) durante la guida attiva.  
**Batch size consigliato**: 50–200 campioni per chiamata (flush ogni ~1–3 minuti).  
**Campi obbligatori per campione**: `ts`, `lat`, `lon`.  
**Campi opzionali**: tutti gli altri — il server accetta campioni parziali senza errore.

---

## Autenticazione

Tutti gli endpoint richiedono:

```
Authorization: Bearer <session_token>
```

Il token è il valore del cookie `connect.sid` salvato in AsyncStorage dall'app mobile.

---

## POST `/api/telemetry/batch`

Invia un batch di campioni telemetrici al server.

### Request

```
POST /api/telemetry/batch
Authorization: Bearer <token>
Content-Type: application/json
```

```json
{
  "session_id": "uuid-string",
  "session_type": "ride",
  "samples": [
    {
      "ts": 1716200000123,
      "lat": 45.4654,
      "lon": 9.1859,
      "speed_kmh": 72.4,
      "lean_angle": 18.3,
      "gforce_x": 0.12,
      "gforce_y": 0.05,
      "gforce_z": 0.98,
      "heading": 245.0,
      "altitude_m": 134.0
    }
  ]
}
```

### Campi payload

| Campo | Tipo | Obbligatorio | Descrizione |
|---|---|---|---|
| `session_id` | string (UUID) | ✅ | Identificatore univoco della sessione di guida |
| `session_type` | string | ✅ | Tipo sessione: `ride`, `trip`, `free` (default: `ride`) |
| `samples` | array | ✅ | Lista di campioni (1–N) |

### Campi per campione

| Campo | Tipo | Obbligatorio | Descrizione |
|---|---|---|---|
| `ts` | number (epoch ms) | ✅ | Timestamp in millisecondi (es: `Date.now()`) |
| `lat` | number (float) | ✅ | Latitudine WGS84 |
| `lon` | number (float) | ✅ | Longitudine WGS84 |
| `speed_kmh` | number | ❌ | Velocità in km/h |
| `lean_angle` | number | ❌ | Angolo di piega in gradi (positivo = destra) |
| `gforce_x` | number | ❌ | Accelerometro asse X (g) |
| `gforce_y` | number | ❌ | Accelerometro asse Y (g) |
| `gforce_z` | number | ❌ | Accelerometro asse Z (g) |
| `heading` | number | ❌ | Direzione bussola in gradi (0–360) |
| `altitude_m` | number | ❌ | Altitudine in metri |

**Nota**: campioni senza `ts`, `lat` o `lon` validi vengono scartati silenziosamente.  
La risposta indica quanti campioni sono stati effettivamente inseriti.

### Response 200

```json
{
  "inserted": 187,
  "session_id": "uuid-string"
}
```

### Response 400

```json
{ "message": "session_id obbligatorio" }
```
```json
{ "message": "samples[] obbligatorio e non vuoto" }
```
```json
{ "message": "Nessun campione valido (ts, lat, lon obbligatori per ogni campione)" }
```

### Esempio curl

```bash
curl -X POST https://your-server/api/telemetry/batch \
  -H "Authorization: Bearer s%3Ayour-session-token.signature" \
  -H "Content-Type: application/json" \
  -d '{
    "session_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "session_type": "ride",
    "samples": [
      { "ts": 1716200000000, "lat": 45.4654, "lon": 9.1859, "speed_kmh": 72.4, "lean_angle": 18.3 },
      { "ts": 1716200001000, "lat": 45.4655, "lon": 9.1861, "speed_kmh": 73.1, "lean_angle": 17.8 },
      { "ts": 1716200002000, "lat": 45.4657, "lon": 9.1863, "speed_kmh": 71.9, "lean_angle": 18.1 }
    ]
  }'
```

---

## GET `/api/telemetry/stats`

Restituisce le statistiche aggregate della telemetria per l'utente autenticato.

### Request

```
GET /api/telemetry/stats
Authorization: Bearer <token>
```

### Response 200

```json
{
  "km_collected": 148.3,
  "sample_count": 312400,
  "session_count": 23,
  "progress_pct": 37,
  "target_km": 400
}
```

| Campo | Tipo | Descrizione |
|---|---|---|
| `km_collected` | number | Km totali raccolti (haversine su campioni consecutivi) |
| `sample_count` | number | Totale campioni nel DB per l'utente |
| `session_count` | number | Numero di sessioni distinte |
| `progress_pct` | number | Percentuale avanzamento (capped a 100) |
| `target_km` | number | Obiettivo km (default 400, configurabile via `TELEMETRY_TARGET_KM` env) |

### Esempio curl

```bash
curl https://your-server/api/telemetry/stats \
  -H "Authorization: Bearer s%3Ayour-session-token.signature"
```

---

## Schema DB — Tabella `ride_telemetry`

```sql
CREATE TABLE ride_telemetry (
  id          SERIAL PRIMARY KEY,
  user_id     VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_id  VARCHAR(36) NOT NULL,
  session_type VARCHAR(10) NOT NULL DEFAULT 'ride',
  ts          BIGINT NOT NULL,          -- epoch ms
  lat         DOUBLE PRECISION NOT NULL,
  lon         DOUBLE PRECISION NOT NULL,
  speed_kmh   REAL,
  lean_angle  REAL,
  gforce_x    REAL,
  gforce_y    REAL,
  gforce_z    REAL,
  heading     REAL,
  altitude_m  REAL,
  matched     BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ride_telemetry_user_id_idx   ON ride_telemetry (user_id);
CREATE INDEX ride_telemetry_session_id_idx ON ride_telemetry (session_id);
CREATE INDEX ride_telemetry_ts_idx        ON ride_telemetry (ts);
```

**Indice `matched`**: riservato per il futuro map-matching su segmenti OSM (Task #1681).

---

## Note implementative

### session_id
Generare lato app con `Crypto.randomUUID()` (expo-crypto) all'inizio di ogni sessione di guida.  
La stessa sessione può essere inviata in più batch successivi — il server li accumula correttamente.

### Frequenza campionamento
- **Guida attiva**: 1 Hz (1 campione/sec) — bilanciamento accuratezza/batteria
- **Sosta/pausa**: sospendere il campionamento
- **Flush**: ogni 60–180 secondi oppure alla fine della sessione

### Batch size
- Minimo consigliato: 50 campioni
- Massimo consigliato: 200 campioni
- Il server gestisce chunk da 500 righe internamente

### Calcolo km
Il server usa la formula haversine su campioni consecutivi per la stessa `session_id`.  
Campioni con delta lat/lon > 0.5° vengono scartati dal calcolo (anti-GPS-spike).

---

## Scope futuro (out of scope per questo task)

- **Map matching** su segmenti OSM → campo `matched` (Task #1681)
- **UI indicatore progresso** nell'app (Task #1680)
- **Chiamata degli endpoint** dall'app mobile (gestita separatamente)
