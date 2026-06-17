# GPS Architecture — BikerLink

> Last updated: June 2026

## Overview

BikerLink ha due pipeline GPS nettamente separate con responsabilità distinte. Mantenerle separate è una scelta deliberata: hanno frequenze, precisioni e cicli di vita diversi.

---

## Pipeline 1 — Presenza Sociale (foreground, sempre attiva)

**Scopo:** tenere aggiornata la posizione visibile sulla mappa dagli altri utenti.

### Sorgente condivisa: `LocationContext` (`lib/location-context.tsx`)

Un singolo `watchPositionAsync` foreground avviato dal provider al mount, con parametri conservativi:

| Parametro | Valore |
|-----------|--------|
| Accuracy | `Balanced` |
| TimeInterval | 5 000 ms |
| DistanceInterval | 10 m |

Espone `currentPosition` e `positionLoading` a tutti i consumer tramite React Context.

### Consumer

| Hook / Componente | Come consuma |
|-------------------|-------------|
| `useLocationWatch` | thin wrapper su `useLocationGate()` — elimina il watcher duplicato precedente |
| `InteractiveMap` | usa `useLocationWatch` → legge `currentPosition` dal context |
| `useMapLocation` (init mappa home) | usa `getCurrentPositionAsync` one-shot per l'inizializzazione, poi si aggiorna tramite `currentPosition` del context passato come prop |
| `AppStateHandler` (social foreground) | legge `currentPosition` dal context con throttle 30 s per inviare PUT `/api/users/location`; guard ghost-mode + isTrackingActive + socialPausedRef; nessun `watchPositionAsync` proprio |
| `useNavigateState` (navigazione turn-by-turn) | apre `watchPositionAsync` (High/1 s/5 m) privato SOLO mentre è attivo; chiama `suspendSharedWatch()` all'avvio e `resumeSharedWatch()` al cleanup — i due watcher non coesistono mai |

### Aggiornamento server durante tracking attivo

Durante un ride attivo, il task di background `bikerlink-background-location` **non aggiorna** il server da solo (è controllato dal campo `trigger` nelle AppSettings). L'aggiornamento della posizione sociale avviene **in `flushPoints`** ogni 15 s, usando l'ultimo punto del batch GPS del tracker. In questo modo un solo dato GPS alimenta sia il ride che la presenza sociale, senza stream paralleli.

Guard: se ghost mode (`@bikerlink/ghost_mode_active === "true"`) il flush non chiama PUT `/api/users/location`.

### Task background (presenza): `bikerlink-background-location`

Definito in `lib/background-location-task.ts`. Si attiva quando l'app va in background **fuori dal tracking**. Chiama `PUT /api/users/location`.

**Guard tracking (codice hardcoded, non configurabile):** se `@bikerlink/tracking_active === "true"`, il task ritorna immediatamente senza inviare nulla — indipendentemente dal campo `trigger`. Questo rende `flushPoints` la sola fonte autoritativa di aggiornamenti sociali durante un ride. La priorità di questo check è più alta di ghost mode e trigger.

---

## Pipeline 2 — Tracking Ride (foreground + background, solo durante un ride)

**Scopo:** registrare con alta fedeltà il percorso del biker.

### Sorgente: `watchPositionAsync` dedicato in `useTrackingState`

Avviato da `beginActiveTracking`, stoppato da `cleanupTracking`. I parametri variano per profilo:

| Profilo | Accuracy | TimeInterval | DistanceInterval |
|---------|----------|-------------|-----------------|
| easy | Balanced | 2 000 ms | 5 m |
| medium | High | 1 000 ms | 2 m |
| sport | BestForNavigation | 500 ms | 0 m |

Non condivide lo stream con il Context perché frequenze e accuratezze incompatibili creerebbero interferenze.

### Background durante tracking: `bikerlink-bg-location`

Definito inline in `useTrackingState.ts`. Quando l'app va in background con un ride attivo, si avvia questo task separato che accumula i punti GPS in AsyncStorage (`@bikerlink/bg_points_pending`). Al ritorno in foreground, i punti vengono riletti e reiniettati in `onNativeLocation`.

---

## Cache `map_last_gps`

Chiave AsyncStorage: `map_last_gps`  
Formato: `{ latitude: number, longitude: number }`

### Quando viene scritta

| Evento | Chi scrive |
|--------|-----------|
| Apertura mappa (home) | `useMapLocation.fetchGPSLocation()` |
| Fine ride (handleStop) | `useTrackingHandlers.handleStop()` — usa `gps.lastPosRef.current` |

Questo garantisce che alla prossima apertura della mappa la posizione iniziale sia quella reale post-ride, non quella dell'ultima volta che si era aperta la mappa.

---

## Navigazione Attiva: `useNavigateState`

La navigazione mantiene un `watchPositionAsync` **privato** (High / 1 s / 5 m) per due ragioni:

1. **Frequenza diversa** — richiede aggiornamenti a 1 Hz con High accuracy per la ricalibrazione del percorso e le istruzioni vocali in tempo reale.
2. **Ciclo di vita separato** — esiste solo nella schermata `/navigate/[id]`, che è una schermata modale dedicata a tutto schermo. Mount/unmount gestiscono il suo ciclo di vita in modo pulito.

Il watcher di navigazione **non sovrascrive** lo stato della posizione sociale né interferisce con il Context condiviso: è completamente isolato nello scope del hook e viene rimosso in `handleClose`.

---

## Schema riassuntivo

```
┌─────────────────────────────────────────────────────────────────┐
│ LocationContext (lib/location-context.tsx)                       │
│  Balanced / 5s / 10m — foreground                               │
│  ──→ currentPosition (shared)                                    │
│       ├── useLocationWatch  ──→ InteractiveMap (centering)       │
│       └── useMapLocation    ──→ Home map init                    │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ bikerlink-background-location (lib/background-location-task.ts) │
│  Background — quando app in BG fuori tracking                   │
│  ──→ PUT /api/users/location (presenza sociale)                  │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ Tracking watcher (useTrackingState — beginActiveTracking)        │
│  BestForNavigation–Balanced / 0.5–2s — solo durante ride        │
│  ──→ onNativeLocation ──→ buffer GPS + stats + mappa            │
│  ──→ flushPoints ogni 15s ──→ POST /api/routes/:id/points        │
│                          └──→ PUT /api/users/location (social)  │
│  BG fallback: bikerlink-bg-location ──→ AsyncStorage            │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ Navigation watcher (useNavigateState)                            │
│  High / 1s / 5m — solo durante navigazione attiva              │
│  ──→ handlePositionUpdate ──→ istruzioni vocali + rerouting     │
└─────────────────────────────────────────────────────────────────┘
```

---

## Regole anti-regressione

1. **Non aggiungere un nuovo `watchPositionAsync` fuori da questo documento** senza aggiornare questo schema.
2. **Non rimuovere il guard ghost mode** dal flush dei punti tracker.
3. **`map_last_gps` deve essere scritto sia in `fetchGPSLocation` che in `handleStop`** — sono i due soli punti canonici.
4. **La navigazione può mantenere il suo watcher privato** perché la frequenza richiesta (1 Hz / High) è incompatibile con il watcher condiviso (5 s / Balanced).
5. **Durante il tracking, la posizione sociale è alimentata esclusivamente da `flushPoints`**, non dal task `bikerlink-background-location`.
