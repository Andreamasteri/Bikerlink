# Audit Credenziali Servizi — BikerLink

**Data audit:** 2026-05-31  
**Metodo:** inventario dal codice (`grep process.env`), verifica presenza (`viewEnvVars`), validazione funzionale (chiamate read-only ai provider).

---

## Matrice per servizio

### 🗄️ Database

| Credenziale | Obbligatoria | Presente | Validazione | Note |
|---|---|---|---|---|
| `DATABASE_URL` | ✅ Sì | ✅ Sì | ✅ `SELECT 1` OK | Gestita da Replit (runtime-managed) |

---

### 🔐 Sessioni / Sicurezza

| Credenziale | Obbligatoria | Presente | Validazione | Note |
|---|---|---|---|---|
| `SESSION_SECRET` | ✅ Sì | ✅ Sì | ✅ Presente (88 char) | Firma cookie sessione |
| `VISITOR_IP_SALT` | No | ❌ No | — | Fallback: hash non salato |
| `OSM_UPDATE_SECRET` | No | ❌ No | — | Endpoint OSM update non protetto |

---

### 🤖 AI — Modelli linguistici

| Credenziale | Obbligatoria | Presente | Validazione | Fallback | Note |
|---|---|---|---|---|---|
| `OPENAI_API_KEY` | ✅ Sì (primario) | ✅ Sì | ✅ HTTP 200 `/v1/models` | — | Moderation, embeddings |
| `GEMINI_API_KEY` | No (fallback) | ✅ Sì | ✅ HTTP 200 `/v1beta/models` | OpenAI | Letto anche come `GOOGLE_API_KEY` (alias) |
| `GOOGLE_API_KEY` | No (ridondante) | ❌ No | — | `GEMINI_API_KEY` copre | Alias di `GEMINI_API_KEY`; non necessario |
| `ANTHROPIC_API_KEY` | No (opzionale) | ❌ No | — | OpenAI/Gemini | Claude; sistema funziona senza |
| `OLLAMA_URL` | No (opzionale) | ✅ Sì | ⚠️ 403 Forbidden | OpenAI/Gemini | Server self-hosted risponde 403 — token o endpoint cambiato |
| `OLLAMA_TOKEN` | No | ✅ Sì | ⚠️ Vedi OLLAMA_URL | — | Usato come header `X-Ollama-Token` |
| `OLLAMA_MODEL` | No | ✅ Sì | — | — | Es. `llama3.1:8b` |
| `COORDINATOR_DISABLED` | No (flag) | ❌ No | — | — | Assenza = coordinator abilitato (comportamento corretto) |

---

### 🗺️ Routing

| Credenziale | Obbligatoria | Presente | Validazione | Fallback | Note |
|---|---|---|---|---|---|
| `GRAPHHOPPER_URL` | No (self-hosted) | ✅ Sì | ❌ DNS ENOTFOUND | Cloud API | `gh.bikerlink.app` non raggiungibile |
| `GRAPHHOPPER_TOKEN` | No (self-hosted) | ✅ Sì | — | — | Header `X-GH-Token` per self-hosted |
| `GRAPHHOPPER_API_KEY` | ✅ Sì (cloud fb) | ✅ Sì | ✅ HTTP 200 `/api/1/info` | — | Fallback cloud attivo e funzionante |
| `VALHALLA_URL` | No | ✅ Sì (vuota) | — | GraphHopper | Stringa vuota = Valhalla disabilitato |
| `VALHALLA_API_KEY` | No | ❌ No | — | — | Non necessaria con `VALHALLA_URL` vuota |
| `TOMTOM_API_KEY` | ✅ Sì (map match) | ✅ Sì | ✅ HTTP 200 routing API | — | Aggiunta durante audit; snap-to-roads operativo |
| `MAPBOX_ACCESS_TOKEN` | ✅ Sì (emergency fb) | ⚠️ Invalido | ❌ 401 token malformed | — | Token inserito non è formato `pk./sk.eyJ1...`; server lancia errore quando invocato |
| `ROUTING_DISABLED` | ⛔ VIETATA | ❌ No (corretto) | — | — | **DEPRECATA — NON impostare mai**: se presente blocca il deploy e bypassa il toggle admin rendendolo inoperante. Gestire il routing da Admin → Hub Routing → kill-switch |

---

### 🗾 Tile / Mappe

| Credenziale | Obbligatoria | Presente | Validazione | Note |
|---|---|---|---|---|
| `TILES_URL` | No | ✅ Sì (env) | ⚠️ DNS non risolve | `https://tiles.bikerlink.app` — server irraggiungibile |
| `MAPLIBRE_API_KEY` | No | ❌ No | — | Demo mode (bassa risoluzione terrain 3D) — usata da `server/routes/admin/maps/config-handler.ts` |
| `MAPTILER_API_KEY` | No (opzionale) | ❌ No | — | Provider tile MapTiler Streets/Outdoor — usata da `lib/maps/tile-providers.ts`; senza chiave i layer MapTiler non si caricano |
| `THUNDERFOREST_API_KEY` | No (opzionale) | ❌ No | — | Provider tile Thunderforest Cycle — usata da `lib/maps/tile-providers.ts`; senza chiave il layer Thunderforest non si carica |
| `OPENWEATHERMAP_API_KEY` | No (opzionale) | ❌ No | — | Overlay meteo (nuvole) — usata da `lib/maps/tile-providers.ts`; senza chiave l'overlay OWM non si carica |

---

### 📧 Email

| Credenziale | Obbligatoria | Presente | Validazione | Note |
|---|---|---|---|---|
| `GMAIL_USER` | ✅ Sì | ✅ Sì | ✅ OK | `BikerLinkApp@gmail.com` |
| `GMAIL_APP_PASSWORD` | ✅ Sì | ✅ Sì | ✅ `nodemailer.verify()` OK | Aggiornata durante audit |

---

### 🎵 Musica (Last.fm)

| Credenziale | Obbligatoria | Presente | Validazione | Note |
|---|---|---|---|---|
| `LASTFM_API_KEY` | No (feature radio) | ✅ Sì | ✅ API accettata | Radio playlist funzionante |
| `LASTFM_SHARED_SECRET` | No (feature radio) | ✅ Sì | ✅ Presente | Firma richieste autenticate |

---

### 📊 Monitoring

| Credenziale | Obbligatoria | Presente | Validazione | Note |
|---|---|---|---|---|
| `SENTRY_DSN` | No | ❌ No | — | Error tracking disabilitato; log solo su console |

---

### ⚙️ Infrastruttura / Flag interni

| Credenziale | Obbligatoria | Presente | Note |
|---|---|---|---|
| `NODE_ENV` | ✅ Sì | ✅ Sì (production) | |
| `PORT` | ✅ Sì | ✅ Sì (`5000`) | |
| `REPLIT_DOMAINS` / `REPLIT_DEV_DOMAIN` | Auto | ✅ Sì | Runtime-managed da Replit |
| `EAS_TOKEN` | No (OTA build) | ✅ Sì | Pubblicazione OTA Expo |
| `EXPO_WEB_URL` | No | ✅ Sì | |
| `BIKERLINK_BACKEND_URL` | No | ✅ Sì (env) | |
| `BIKERLINK_ADMIN_EMAIL` | No | ✅ Sì | Duplicato env+secret (vedi anomalie) |

---

## ⚠️ Anomalie / Ridondanze

| Anomalia | Descrizione | Azione consigliata |
|---|---|---|
| **`OLLAMA_TOKE`** (typo) | Secret nel pannello con N mancante; nessun codice lo legge | Eliminare dal pannello Secrets |
| **`GOOGLE_API_KEY`** | Alias ridondante di `GEMINI_API_KEY`; il codice usa `GEMINI_API_KEY ?? GOOGLE_API_KEY` | Non necessario; si può ignorare |
| **Duplicati env+secret** | `GRAPHHOPPER_URL`, `BIKERLINK_ADMIN_EMAIL` esistono sia in `userenv.shared` (.replit) sia come Secrets — i Secrets sovrascrivono silenziosamente gli env var | Scegliere uno dei due canali per ciascuno |
| **`MAPBOX_ACCESS_TOKEN` invalido** | Token inserito non è nel formato Mapbox (`pk./sk.eyJ1...`) — 401 su ogni chiamata | Sostituire con token valido da account.mapbox.com |
| **GraphHopper self-hosted offline** | `gh.bikerlink.app` DNS non risolve (ENOTFOUND) | Verificare stato server; il cloud API key copre il fallback |
| **Tiles server offline** | `tiles.bikerlink.app` DNS non risolve | Verificare stato server |
| **Ollama 403** | Server Ollama risponde 403 — `OLLAMA_TOKEN` potrebbe essere scaduto o endpoint cambiato | Verificare configurazione Nginx del server Ollama |

---

## 📋 Riepilogo stato

| Stato | Servizi |
|---|---|
| ✅ Operativi e validati | Database, Sessioni, OpenAI, Gemini, GraphHopper (cloud), TomTom, Gmail, Last.fm |
| ⚠️ Configurati con problemi | Ollama (403), GraphHopper self-hosted (DNS), Tiles (DNS), Mapbox (token invalido) |
| ❌ Mancanti obbligatori | Mapbox (token da correggere) |
| ℹ️ Mancanti opzionali (fallback attivi) | Anthropic, Redis, MapLibre, Sentry, Valhalla API key |

---

## 🔧 Script validazione

Eseguire per rivalidare tutte le credenziali in qualsiasi momento:

```bash
npx tsx scripts/validate-credentials.ts
```
