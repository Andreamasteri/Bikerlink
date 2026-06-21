---
name: Telemetry offline-first upload cadence
description: useTelemetry uploads by distance (5km), not by timer; DR anchor frozen.
---

# Telemetria offline-first (useTelemetry.ts)

Gli upload della telemetria foreground sono **distance-based**, non a timer:
`maybeUploadByDistance()` parte solo dopo `UPLOAD_EVERY_KM` (5km) percorsi dall'ultimo
upload riuscito. Niente flush periodico wall-clock (rimosso FLUSH_INTERVAL_MS/FLUSH_MIN_SAMPLES).
`flush()` ritorna `Promise<boolean>` (true=inviato); il marker `kmAtLastUploadRef`
avanza **solo** se l'upload riesce → un upload fallito viene ritentato al campione
successivo, non saltato. Force flush resta su stop/background/buffer-cap.

**Why:** offline-first — l'app deve uploadare di rado e non bloccare mai il sampling
(fire-and-forget). Avanzare il marker su un fallimento perderebbe ~5km di dati.

**How to apply:** se cambi la logica di upload o aggiungi un nuovo trigger, mantieni
l'invariante "marker avanza solo su successo" e tieni l'upload non-bloccante.

## Dead-reckoning (DR)
- Heading da `DeviceMotion.rotation.alpha` (rad→deg, 0=nord). `computeDestinationPoint`
  (inverse haversine, pura in shared/tracking-fusion.ts) avanza la posizione stimata.
- Campioni DR hanno `estimated:true`; senza alcun fix GPS precedente lat/lon restano
  null (contratto sensor-timer test).
- Nel **live tracking** (useTrackingState sensors_only) la stima usa un `drEstPosRef`
  SEPARATO: l'anchor GPS `lastPosRef` resta **frozen** per non rompere la
  reconciliation GPS-recovery (vedi tracking-fusion-gate). drEstPosRef si resetta a
  null quando il GPS torna autoritativo.
