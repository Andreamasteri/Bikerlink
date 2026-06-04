---
name: Black map diagnosis via maps_telemetry_events
description: How to diagnose the "mappa nera" using prod telemetry; what the data actually proves about the cause.
---

# Mappa nera — diagnosi data-driven

La causa NON si vede come `map_init_failed` o `webview_crash`: in tutto il DB prod
`maps_telemetry_events` quei due eventi sono **sempre 0**. La mappa nera è un errore
di **render React** del componente mappa (InteractiveMap), intercettato
dall'ErrorBoundary, quindi **a monte** del try/catch di init di Leaflet → nessun
evento d'errore viene loggato. Per questo è "nera" e non "errore mappa".

## Segnale decisivo (tecnica di diagnosi)
Conta `map_init` / `map_ready` per `app_version` (e per `user_id`) in prod:
```sql
SELECT app_version, event, COUNT(*) FROM maps_telemetry_events
WHERE event IN ('map_init','map_ready') GROUP BY 1,2 ORDER BY 1 DESC;
```
- Sui build dove il componente monta, `map_init ≈ map_ready` (la mappa funziona).
- Lo **stesso device** che apriva la mappa decine di volte su un build vecchio (es.
  54.10.36: map_init=map_ready=34) dopo l'update a un OTA del ramo 55.x emette
  **0 map_init** pur continuando a mandare eventi GPS (stessa pipeline telemetria,
  quindi non è "telemetria persa": è la mappa che **non si inizializza**).

`map_init` è emesso al **mount** di InteractiveMap (useEffect), prima della WebView:
se non parte mai, il componente mappa crasha in render / non monta su quel ramo.

**Why:** distingue nettamente "WebView/tile rotti" (init OK, paint KO) da
"componente che non monta" (0 map_init). Nel caso BikerLink era il secondo.

## Cosa è (e non è) la causa
- La WebView NON era stata toccata; leaflet-rotate era **codice morto** (bundle non
  importato) — rimuoverlo da solo non basta se il crash è nel **render** (es. la
  bussola `MapNorthCompass` aggiunta a InteractiveMap dalla feature rotazione
  due-dita). Rimuovere anche il compass dal render è la parte che conta.

## CAUSA CONFERMATA (Fabric/New Arch) — measureLayout non monta la mappa
Il `map_init=0` NON era un crash di render: InteractiveMap nella home è gated da
`{compactLayout && <InteractiveMap/>}` in `app/(tabs)/index.tsx`. `compactLayout`
viene valorizzato SOLO dal callback `onCardLayout` di `HomeMapSection`, che
nell'implementazione fragile chiamava **solo** `cardRef.measureLayout(findNodeHandle(root), success, error)`.
**Sotto New Architecture (Fabric) `measureLayout` può non chiamare NÉ success NÉ
error** → `onCardLayout` mai → `compactLayout` resta `null` → mappa mai montata →
si vede solo il placeholder scuro = "mappa nera", con GPS attivo e zero crash.
Per questo la **vecchia APK (old arch) funziona** ma il **nuovo build EAS / OTA
(Fabric) no** = "EAS ha usato file sbagliati".
**Fix:** in `HomeMapSection.handleLayout` usare direttamente
`e.nativeEvent.layout` dell'evento `onLayout` (scatta sempre, su entrambe le
architetture; a scroll offset 0 le coords sono già root-relative) per chiamare
`onCardLayout` e garantire il mount; `measureLayout(root)` resta solo come
raffinamento. In `index.tsx` `handleCardLayout` deve risincronizzare i valori
`anim*` ad OGNI report compatto (non solo il primo) o il refine viene ignorato →
"mappa fuori posto".
**Why:** `measure`/`measureLayout` basati su node handle sono inaffidabili su
Fabric; `onLayout` no. Non far MAI dipendere il mount di un componente solo da una
callback di `measureLayout`/`measure`.

## Trappola operativa adozione OTA
Un device può restare bloccato su un OTA **vecchio** (es. 55.10.10) mentre esistono
già fix più recenti approvati (55.10.6x) con ~0 download. "Continuo a vedere nero"
spesso = non ha ancora scaricato il fix, NON che il fix non funziona. Verifica
sempre l'`app_version` reale del device nella telemetria prima di ri-pubblicare.
Conferma del fix = ricomparsa di `map_init`/`map_ready` per il ramo 55.x.

## Blindatura (per non riperderci 12h)
Guard statico in CI: `scripts/check-leaflet-map-guard.sh`, agganciato a
`scripts/typecheck.sh`. Vieta di reintrodurre nel **path Leaflet HOME**
(InteractiveMap.tsx, lib/leaflet-*-html.ts, components/map/createMapMessageHandler.ts)
i simboli che hanno causato il crash di render: `leaflet-rotate`, `MapNorthCompass`,
`bearing` (word-boundary), `resetBearing`, `getMapBearing`, `rotateend`.
**Why:** il crash era a monte del try/catch Leaflet → nessun errore loggato; un
typecheck verde non lo prendeva. Il guard lo blocca alla fonte.
**How to apply:** se serve rotazione/bussola va nel renderer **MapLibre 3D**
(components/MapLibre*.tsx, lib/maplibre/*), che usa MapNorthCompass per design ed è
SEPARATO — NON aggiungere file MapLibre alla lista `PROTECTED` del guard.
Triage rapido futuro: 1) query map_init/map_ready per app_version; 2) se 0 su un
ramo mentre il GPS gira → componente non monta, NON è WebView/tile; 3) `git log`
sui file del path mappa per trovare la feature che ha rotto il render.
