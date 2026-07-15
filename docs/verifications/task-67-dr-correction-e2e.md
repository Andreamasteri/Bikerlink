# Task #67 — Verifica end-to-end del motore di correzione DR/GPS su route fittizia

**Esito: SUPERATA (16/16 check).** Il motore di correzione dead-reckoning/GPS
deterministico introdotto dal Task #47 elabora correttamente i dati sintetici
passati per la pipeline reale e riproduce **esattamente** lo scostamento iniettato.

> Questo NON riguarda l'agente AI "Horus" (routing-health, LLM). Riguarda il
> modulo deterministico DR/GPS: `shared/dr-correction.ts` (matematica pura),
> `server/dr-correction/engine.ts` (ingestione + ricalcolo modello),
> `server/jobs/dr-correction-global.ts` (aggregato globale periodico).

## Come riprodurre

1. Avviare il workflow **Start Backend** (server su `http://localhost:5000`).
2. `npx tsx server/scripts/verify-dr-correction-e2e.ts`
   (override base URL con `DR_E2E_BASE_URL`).

Lo script è auto-contenuto: crea un utente + route fittizi, genera i dati
sintetici, li carica via HTTP reale, verifica il modello prodotto, controlla il
pannello admin + export, e **rimuove tutto** al termine (blocco `finally`).

## Metodo (pipeline reale, non iniezione diretta)

- **Route fittizia**: riga `routes` + 8 `route_points` (leg dritta verso Est da
  45.5, 9.0) — usabile anche per la prova manuale della vista a striscia rossa.
- **Generatore sintetico**: telemetria con 24 fix GPS regolari + **6 campioni
  sensor-only** (lat/lon assenti = blackout DR, stesso formato che
  `shared/tracking-fusion.ts` classifica come `sensor_only`) + riacquisizione
  GPS. Poi **8 campioni di scostamento** identici (deterministici) con uno
  scostamento DR/GPS **noto**.
- **Auth reale**: sessione DB (`session`) + Bearer `connect.sid` firmato con
  `cookie-signature` → le richieste passano da `requireUserId` come un device.
- **Ingestione reale**: `POST /api/telemetry/batch` e
  `POST /api/telemetry/dr-deviation` (nessun bypass, nessun insert diretto nelle
  tabelle DR).
- **Marcatura test**: l'utente ha `is_fake=true`; il flag `is_test` viene
  impostato **lato server** (`ingestDeviationBatch` → `isTestUser`), mai dal
  client.

## Scostamento iniettato vs. misurato

| Parametro          | Iniettato | Misurato (modello per-utente) |
|--------------------|-----------|-------------------------------|
| `distanceScale`    | 1.10      | 1.0999999999967 ✅            |
| `speedScale`       | 1.10      | 1.10 ✅                       |
| `speedBiasKmh`     | +5.0      | +5.0 ✅                       |
| `headingBiasDeg`   | +3.0      | +3.0 ✅                       |
| `sampleCount`      | 8         | 8 ✅                          |

(drDist=0.400 km, gpsDist=0.440 km → ratio 1.10; posErr≈45.6 m; headingErr=3.0°.)

## Meccanismo di trigger (confermato)

- **Per-utente = tempo reale**: ad **ogni** batch di ingestione
  (`ingestDeviationBatch` → `recomputeUserModel`, mediana robusta sui campioni
  dell'utente). Verificato: subito dopo il POST il modello per-utente è
  disponibile via `GET /api/telemetry/dr-correction` e nel pannello admin.
- **Globale = job periodico** (`recomputeDrCorrectionGlobal`, ~6h, sotto
  `withJobGate`): attivato esplicitamente nella prova; esclude i campioni
  `is_test=true` (verificato: 8 `is_test=true`, 0 `is_test=false` per l'utente
  fittizio; il globale non li conta).

## Completezza degli input (richiesta esplicita del task)

**Il modulo dispone di tutti i dati/input necessari** per elaborare questo
scenario. Ogni campione di scostamento porta tutto ciò che serve alla matematica
(`computeModelFromSamples`): `drDistanceKm`, `gpsDistanceKm`, `posErrorM`,
`estSpeedKmh`, `obsSpeedKmh`, `headingErrorDeg`, `recoveryAccuracyM`,
`recoveryFixCount`. Da questi produce `distanceScale`/`speedScale`/`speedBias`/
`headingBias` e li fonde col globale (`blendWithGlobal`). **Nessuna lacuna di
dati o di formato riscontrata** nel percorso ingestione → modello per-utente.

## Osservazioni (non bloccanti)

1. **Modello "grezzo" per-utente vs. "effettivo" fuso** — la tabella
   `dr_correction_model` (e la colonna `distanceScale` nell'elenco admin)
   memorizza il modello **grezzo** calcolato dai campioni dell'utente (qui
   1.10). `GET /api/telemetry/dr-correction` e `export.effectiveModel`
   restituiscono invece il valore **fuso col globale** (qui ≈1.0615, con
   `w = n/(n+K) = 8/13`). È **voluto** (vedi invariante di convergenza), ma un
   admin potrebbe confondersi vedendo 1.10 nell'elenco e ~1.06 nell'export:
   utile una nota/etichetta in `app/admin/dr-correction.tsx`. → follow-up.
2. **Vista a striscia rossa (Task #48) non testabile headless** — la logica di
   degrado (`autoMinimal`) vive dentro l'IIFE `window.navBridge` in
   `lib/leaflet-navigation-html.ts` (nessuna funzione pura esportata per la
   decisione di stato) e richiede una WebView/dispositivo. La web-preview Expo è
   disabilitata e non c'è e2e su device.

## Vista a striscia rossa — verifica statica + prova manuale

- **Trigger** (`lib/leaflet-navigation-html.ts`): passa a `autoMinimal` quando
  `!isCurrentCovered()` (tile della posizione corrente assente) **e** un errore
  tile è recente (`ERROR_WINDOW_MS = 8000`). In minimal disegna la rotta come
  polilinea rossa (`color:#ff0000, weight:8`) senza tile.
- **Ripristino**: probe ogni `PROBE_INTERVAL_MS = 3000`; esce da `autoMinimal`
  dopo `STABLE_MS = 30000` di segnale stabile (un fallimento resetta il timer);
  ignorato in modalità manuale.
- **Prova manuale su device** con la route fittizia: guidare la mappa con
  `navBridge.updateRoute(coords)` + `navBridge.updatePosition(lat,lng,...)`
  lungo la leg Est da (45.5, 9.0); simulare l'assenza di segnale
  (`navBridge.setManualMinimal(true)` o togliere i tile) → deve comparire la
  striscia rossa; ripristinare il segnale → deve tornare la mappa dopo ~30 s.
  Consigliato eseguirla insieme alla verifica su telefono del Task #62.

## Pulizia

Al termine lo script elimina l'utente fittizio (cascade su telemetria, campioni,
modello, route) e le righe `session`, poi ricalcola il globale. Verificato:
0 modelli residui per l'utente; nessun utente reale fittizio nel pannello admin.
