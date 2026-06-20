---
name: Resume-path async crash hardening
description: Why every AppState listener body must be guarded and resume network calls must time out
---

# Resume-path async crash hardening

Al ritorno dal background (resume), i listener `AppState.addEventListener("change", ...)`
scatenano una raffica di lavoro async: heartbeat, start sessione, invalidazioni
React Query, flush crash-log, drain/replay GPS+telemetria da AsyncStorage,
ricontrollo permessi. Con rete assente/lenta un errore async non gestito
(timeout fetch, JSON.parse su buffer corrotto, modulo nativo che rifiuta) diventa
una **unhandled promise rejection** e chiude l'app.

**Why:** l'`ErrorBoundary` React (components/ErrorBoundary.tsx) cattura SOLO gli
errori di render; NON copre le rejection nei callback di AppState. Un `async` passato
direttamente come listener fa sì che ogni await che rifiuta diventi rejection top-level.

**How to apply:**
- Ogni body di listener AppState (anche quelli "sicuri") va in try/catch. File noti:
  AppStateHandler.tsx, location-context.tsx, useTelemetry.ts, useTrackingEffects.ts,
  crash-logger.ts. Non aggiungere nuovi listener senza guard.
- Le chiamate di rete del resume usano `apiRequest(..., { timeoutMs })` (8s) — apiRequest
  ora supporta `{ timeoutMs, signal }` via AbortController. Fallimento = silenzioso +
  retry su prossimo interval/resume, mai fatale.
- Errori async inattesi (non di rete): `markAsyncError(context, error)` in crash-logger.ts
  li registra come crash_js con prefisso `[resume:<context>]` (filtrabile, non lancia mai).

## Centralizzazione onlineManager/focusManager

RN non ha `navigator.onLine` né `visibilitychange`: senza wiring esplicito React
Query continua a "fetchare nel vuoto" da offline (causa principale dei fallimenti
di resume su rete scarsa). Si wira UNA volta per tutta la vita dell'app:
`onlineManager` ← NetInfo e `focusManager` ← AppState.

**Why / regole durature:**
- Stato sconosciuto (`isConnected === null`, emesso brevemente all'avvio) va trattato
  come ONLINE; solo `false` esplicito = offline. Mettere in pausa su stato ignoto
  blocca le query al cold start.
- `refetchOnReconnect:"always"` va impostato SELETTIVAMENTE per-key, MAI globale:
  il default globale è `staleTime:Infinity`, quindi un refetchOnReconnect normale non
  scatterebbe mai, e uno globale "always" farebbe uno storm a ogni reconnect.
- `focusManager` coi default globali (`staleTime:Infinity` + `refetchOnWindowFocus:false`)
  NON causa storm al resume — solo le query esplicitamente stale rifetchano.
- I flussi NON-React-Query (heartbeat, startSession) NON sono coperti da onlineManager:
  vanno riagganciati esplicitamente sull'evento offline→online, e solo se l'app è in
  foreground (`AppState.currentState === "active"`), altrimenti si crea churn in background.
- Il listener `focusManager` non si disiscrive di proposito: wiring singleton a vita-app
  (guard di idempotenza), nessuno scope ne possiede il teardown.
