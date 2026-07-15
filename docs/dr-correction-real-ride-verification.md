# DR-correction real-ride verification checklist (Task #90)

Confirm the dead-reckoning (DR) correction engine actually improves accuracy on a
**real ride through a real GPS blackout** (tunnel / gallery). The engine was added
in Task #47 and validated statically + with a synthetic engine test; the pieces
below that need a **physical device with real GPS loss** cannot be exercised by the
agent and must be run once by a rider.

> **Status:** the full code path is verified complete and internally consistent
> (see "Verified without hardware"). The three acceptance criteria are **NOT yet
> confirmed on a real ride** — run the rider steps below and tick each box.

---

## How the path fits together (reference)

```
ride through tunnel
   │  GPS goes stale → fusion enters sensors_only
   │  useTrackingState fusion tick (1 Hz):
   │    rawDistKm = dr/3600 * dt
   │    total   += rawDistKm * distanceScale   ← learned model applied LIVE
   │    drGapKm += rawDistKm                    ← stays RAW (learning ground truth)
   ▼
tunnel exit → GPS returns
   │  onNativeLocation (useTrackingEffects): drGapKm>0 ⇒ recovery mode
   │    wait for RECOVERY_FIXES_REQUIRED (3) coherent fixes (≤240 km/h between them)
   │    on the 3rd coherent fix → build DrDeviationSample, reportDrDeviation()
   │    zero drGapKm, reseed anchor to recovery pos (NO bridging segment = no double count)
   ▼
POST /api/telemetry/dr-deviation  (lib/dr-deviation-uploader.ts)
   │  server parseSample() quality gate: recoveryFixCount≥3, recoveryAccuracyM≤35,
   │                                      drDistanceKm≥0.03, blackoutMs>0
   ▼
ingestDeviationBatch → INSERT dr_deviation_samples → recomputeUserModel (real time)
   │  per-user median model upserted into dr_correction_model
   │  is_test set SERVER-SIDE from user flags (isFake/isSystem/mapTester)
   ▼
periodic job (~6h, dr-correction-global.ts) → recomputeGlobalModel (non-test only)
   ▼
next ride start: GET /api/telemetry/dr-correction → effective model → drCorrectionRef
   → distanceScale applied live on the next blackout
```

---

## Verified WITHOUT hardware (done by the agent)

- [x] **Client capture path is wired.** `useTrackingEffects.onNativeLocation` requires
  `RECOVERY_FIXES_REQUIRED` (=3) coherent consecutive fixes before confirming recovery,
  builds a `DrDeviationSample` with the **fresh** accumulated gap (read at confirmation,
  not snapshotted at the first fix), and calls `reportDrDeviation`.
- [x] **No double-count on recovery.** The GPS anchor stays frozen through the blackout
  AND the multi-fix wait; on confirm the gap is zeroed and the anchor is reseeded with
  no bridging segment. DR keeps accumulating continuously during the recovery wait
  (freshness deferred until confirmation).
- [x] **Live `distanceScale` applied, gap stays RAW.** `useTrackingState` fusion tick
  scales the LIVE total contribution by `drCorrectionRef.current.distanceScale` but
  accumulates `drGapKmRef` raw — so the learning loop isn't corrupted.
- [x] **Model fetched at session start.** `useTrackingHandlers` (`handleStart`) does
  `GET /api/telemetry/dr-correction` and stores the effective model in `drCorrectionRef`
  (identity fallback if it fails).
- [x] **Server ingestion + quality gate.** `POST /api/telemetry/dr-deviation`
  (`server/routes/telemetry-dr-correction.ts`) mirrors the client gate and drops
  unstable/imprecise recoveries (reported in `dropped`).
- [x] **Per-user real-time recompute + global periodic job.** `ingestDeviationBatch`
  recomputes the per-user model immediately; global aggregate runs via the scheduler
  job under `withJobGate` and excludes test users (`is_test = false`).
- [x] **Admin page reachable + wired.** `app/admin/telemetry.tsx` → "Correzione Dead
  Reckoning" → `/admin/dr-correction`, which reads `/api/admin/dr-correction/users`,
  `/global`, and per-user `/export` (JSON).
- [x] **Schema / migration present.** `migrations/0145_dr_correction.sql` defines
  `dr_deviation_samples`, `dr_correction_model`, `dr_correction_global`
  (boot-gated via `server/migrate.ts`, applied on server boot — **not** publish-diffed).
- [x] **Automated capture-path test passes.** `hooks/__tests__/useTrackingEffects-recovery-accounting.test.ts`
  (3 tests) — proves continuity across the recovery wait, single-fix does NOT confirm,
  and an incoherent jump resets the streak. Run: `npx vitest run hooks/__tests__/useTrackingEffects-recovery-accounting.test.ts`.

**Not verifiable by the agent:** real GPS blackout behaviour on a device (tunnel
multipath, coherence gate against real noisy fixes, real end-to-end upload, and
multi-ride convergence). Those are the checkboxes below.

---

## Pre-flight (once, before the first test ride)

- [ ] Build/OTA in use includes Task #47 (DR correction) — the tracking screen must be
  running the fusion timer with `drCorrectionRef`.
- [ ] Confirm the target environment (production) has the three tables. As admin, on a
  machine with prod access, run (read-only):
  ```sql
  SELECT to_regclass('dr_deviation_samples'),
         to_regclass('dr_correction_model'),
         to_regclass('dr_correction_global');
  ```
  All three must be non-NULL. (They are created on server boot by migration 0145; if any
  is NULL, the deviation upload will 500 and the admin page will error — redeploy so the
  boot migration runs before riding.)
- [ ] Use a **non-test** account (not `isFake`/`isSystem`/`mapTester`) so samples feed the
  per-user model and eventually the global aggregate. (A test account still captures
  samples but is excluded from the global model and flagged `TEST` on the admin page.)
- [ ] Enable phone sensors (accel/gyro) for the ride profile — DR needs the sensor feed to
  accumulate distance during the blackout.

---

## Ride 1 — capture a deviation sample (criterion A)

Pick a real tunnel/gallery long enough to lose GPS for **at least ~30–60 s** at riding
speed (need `drDistanceKm ≥ 0.03 km` = 30 m of DR to pass the server gate).

- [ ] Start a ride, ride normally into the tunnel. The fusion mode should switch to
  `sensors_only` and the km counter should keep advancing inside the tunnel.
- [ ] Exit the tunnel; keep riding straight for a few seconds so GPS locks cleanly
  (need 3 coherent fixes — a jumpy exit fix just delays confirmation, it won't corrupt).
- [ ] Finish/stop the ride.
- [ ] On the admin **Correzione Dead Reckoning** page, open your user card: `campioni`
  (sample count) increased by ≥1 and `ultimo` (last sample) shows just now.
- [ ] (Optional, admin with prod access) confirm the raw row:
  ```sql
  SELECT recorded_at, blackout_ms, dr_distance_km, gps_distance_km,
         pos_error_m, recovery_fix_count, recovery_accuracy_m, is_test
  FROM dr_deviation_samples
  WHERE user_id = '<your-user-id>'
  ORDER BY recorded_at DESC LIMIT 5;
  ```
  Expect `recovery_fix_count ≥ 3`, `recovery_accuracy_m ≤ 35`, `dr_distance_km ≥ 0.03`.
- [ ] **If no sample appears:** blackout was too short (`dr_distance_km < 0.03`), the exit
  never gave 3 coherent fixes, or the recovery accuracy was > 35 m. Try a longer tunnel /
  cleaner exit. (These are the exact drop reasons; nothing to fix in code.)

## No double-count on recovery (criterion B)

- [ ] During the blackout, note the live total distance shown on screen just before GPS
  returns, and the final saved total at ride end.
- [ ] Cross-check against **Telemetria** totals for that session: the saved total distance
  should equal the live total at the moment of recovery **plus** any post-recovery riding —
  i.e. the tunnel distance is counted **once**, not doubled by a bridging segment on GPS
  return. No sudden jump in total km at the instant GPS re-locks.

## Rides 2..N — convergence (criterion C)

Repeat the tunnel test over several rides (ideally the same tunnel, so the true GPS
distance is a stable reference).

- [ ] After each ride, on the admin page watch the user card trend:
  - [ ] `err. pos. medio` (`meanPosErrorM`) trends **down** across rides.
  - [ ] `err. vel. medio` (`meanSpeedErrorKmh`) trends **down** across rides.
  - [ ] `scala dist.` (`distanceScale`) moves **away from 1.000** toward the rider's true
    ratio (e.g. if DR under-reports ~10%, it climbs toward ~1.1 — but note it is
    **intentionally damped early** via blend-with-global, so with few samples it shrinks
    toward 1.0; this is correct, not a bug).
- [ ] Use the per-user **Esporta dati (JSON)** button to snapshot the model + samples for
  the record / to attach evidence to this task.

---

## Sign-off

- Tester: __________________  Device / OS: __________________  App/OTA version: __________
- Tunnel used: __________________  Approx blackout duration: ______ s
- [ ] A — sample captured after 3 coherent fixes (row in `dr_deviation_samples`)
- [ ] B — no double-count (saved total == live total, cross-checked with Telemetria)
- [ ] C — over N rides `meanPosErrorM`/`meanSpeedErrorKmh` trend down, `distanceScale` converges
- Notes: ___________________________________________________________________________
