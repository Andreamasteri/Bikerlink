---
name: Telemetry collector state machine
description: Il collector telemetria è guidato da una macchina a stati pura; come/dove vivono le invarianti e perché.
---

# Telemetry collector — macchina a stati esplicita

Il lifecycle del collector (`hooks/useTelemetry.ts`) NON è più pilotato da boolean
ref sparsi (`activeRef`/`inBackgroundRef`): è guidato da una macchina a stati pura
in `lib/telemetry-collector-machine.ts` — `createTelemetryCollector(fx)`.

Stati: `idle → acquiring → foreground ↔ background → stopping`.

**Why:** i due bug storici erano (a) doppia raccolta — subs foreground e task
background entrambi attivi durante un handoff sciatto — e (b) campioni persi
nell'handoff. La macchina concentra l'invariante in UN punto.

**How to apply:**
- L'invariante "una sola sorgente attiva" vive SOLO nella macchina: ogni
  transizione ferma la sorgente uscente prima di avviare quella entrante
  (stopForeground prima di startBackground; stopBackground+drainBackground prima
  di startForeground). Non reintrodurre guardie/handoff nel hook.
- Tutte le transizioni sono serializzate su una singola promise-chain
  (`enqueue`): un flip rapido bg↔fg non può interlacciare due handoff. Se aggiungi
  una transizione, passa sempre da `enqueue`.
- La macchina è pura (nessun React/native): gli effetti sono iniettati via
  `CollectorEffects`, quindi le transizioni sono unit-testabili con mock
  (`lib/__tests__/telemetry-collector-machine.test.ts`, runner
  `vitest.config.lib.ts`). L'invariante è asserito via `maxConcurrentSources===1`.
- Il hook espone gli effetti reali: `beginSession` (no subs) + `startForegroundSubs`
  + `teardown` + `flush` + start/stop/drain background task + `finishSession`
  (flush forzato + retry + persist AsyncStorage + clear). `finishSession` NON
  ferma/draina il background — lo fa la macchina prima di chiamarlo.
- I callback di raccolta (pushLocation/GPS watch/sensorTimer) sono guardati da
  `canRecordForeground()` (true solo in `foreground` o `acquiring`).
- C'è UN solo AppState listener nel collector: chiama solo
  `machine.toBackground()`/`toForeground()` (body in try/catch, vedi
  resume-path-async-crash). Concerns session/heartbeat/online restano in
  `components/layout/AppStateHandler.tsx` (#4585), non duplicare.
