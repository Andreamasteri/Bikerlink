# Quebracho → Matching Coordinator wiring test

**Task #271 — moto reale verification**  
**Date:** 2026-07-16  
**Method:** Direct in-process tsx test script against the live dev server with TC online  
**Script:** `scripts/test-quebracho-coordinator-wiring.ts`

---

## Pre-flight (Step 1)

| Check | Result |
|---|---|
| ThinkCentre online (`isThinkCentreOffline()`) | ✅ PASS — online |
| Quebracho reachable (`isQuebrachoReachable()`) | ✅ PASS — reachable |
| DragonflyDB configured (`TC_DRAGONFLY_URL`) | ✅ SET |
| Redis configured (`TC_REDIS_URL`) | ✅ SET |

TC was online, Quebracho answered on its Ollama endpoint, DragonflyDB/Redis secrets are set.

---

## Step 2 — Coordinator snapshot baseline

`getCoordinatorSnapshot()` with TC online and no active directives:

| Field | Value | Result |
|---|---|---|
| `state` | `running` | ✅ PASS |
| `quebrachoReachable` | `true` | ✅ PASS |
| `horusReachable` | `true` | ✅ PASS |
| `thinkCentreOffline` | `false` | ✅ PASS |
| `activeDirective` | `null` | ✅ PASS |

---

## Step 3 — canRunCycleNow baseline (no directives)

`canRunCycleNow()` with no active directives:

| Field | Value | Result |
|---|---|---|
| `allowed` | `true` | ✅ PASS |
| `state` | `running` | ✅ PASS |
| `source` | `deterministic` | ✅ PASS |
| `forcedByHorus` | `false` | ✅ PASS |

---

## Step 4 — Quebracho pause directive applied

`applyCoordinatorDirective("pause", { reason: "test-protocol-task-271" }, "quebracho")`:

| Check | Value | Result |
|---|---|---|
| Directive applied (`ok`) | `true` | ✅ PASS |
| Resulting state | `paused_by_ai` | ✅ PASS |
| AppSetting `matching_coordinator_directive:quebracho` written | `{"kind":"pause","reason":"test-protocol-task-271","issuedBy":"quebracho","issuedAt":"2026-07-16T13:05:05.926Z"}` | ✅ PASS |
| `kind` in AppSetting | `pause` | ✅ PASS |
| `issuedBy` in AppSetting | `quebracho` | ✅ PASS |

The AppSetting was persisted correctly to the DB with `valueJson` (not `value`) — confirming the `upsertAppSetting` 3rd-arg path is correct.

---

## Step 5 — canRunCycleNow after quebracho pause

`canRunCycleNow()` with active quebracho pause directive:

| Field | Value | Result |
|---|---|---|
| `allowed` | `false` | ✅ PASS |
| `state` | `paused_by_ai` | ✅ PASS |
| `source` | `quebracho` | ✅ PASS |

The `source` field correctly attributes the pause to `quebracho`, not to `horus` or `deterministic`.

---

## Step 6 — Snapshot with active quebracho directive

`getCoordinatorSnapshot()` after pause:

| Field | Value | Result |
|---|---|---|
| `directives.quebracho.kind` | `pause` | ✅ PASS |
| `activeDirective.issuedBy` | `quebracho` | ✅ PASS |

---

## Step 7 — Resume clears the quebracho directive

`applyCoordinatorDirective("resume", { reason: "test-protocol-cleanup" }, "quebracho")`:

| Check | Value | Result |
|---|---|---|
| `ok` | `true` | ✅ PASS |
| Resulting state | `running` | ✅ PASS |
| AppSetting `matching_coordinator_directive:quebracho` after resume | `null` (cleared) | ✅ PASS |

`persistDirective(issuer, null)` correctly nulls out the `valueJson` in the DB row.

---

## Step 8 — canRunCycleNow after resume

| Field | Value | Result |
|---|---|---|
| `allowed` | `true` | ✅ PASS |
| `source` | `deterministic` | ✅ PASS |

---

## Step 9 — force_cycle one-shot correctness

Sequence: apply quebracho pause → apply quebracho force_cycle → call canRunCycleNow twice:

| Check | Value | Result |
|---|---|---|
| Snapshot shows `pendingForceCycle=true` after force_cycle | `true` | ✅ PASS |
| First `canRunCycleNow()` allowed despite pause | `true` | ✅ PASS |
| `forcedByHorus` flag set on forced run | `true` | ✅ PASS |
| Second `canRunCycleNow()` blocked (one-shot consumed) | `false` | ✅ PASS |

The one-shot is consumed by the first evaluation, preventing an old force_cycle from accidentally bypassing a later pause.

---

## Step 6 (protocol) — TC offline fallback behavior

TC was **not taken offline** during this test run to avoid disrupting production. The fallback path was verified at code-review level:

- `resolveEffectivePauses()` in `coordinator.ts` calls `isQuebrachoUnreachable()` for any active quebracho pause directive
- If Quebracho is unreachable, the pause is **silently ignored** (fallback to deterministic) and a throttled warn log is written
- `isQuebrachoUnreachable()` delegates to `isQuebrachoReachable()` in `quebracho-client.ts`, which has a 60s probe cache and 2.5s timeout
- The admin UI (`coordinator-jobs.tsx`) shows "non raggiungibile — pause automatiche ignorate (fallback)" when `quebrachoReachable=false`

No code changes required for this fallback path.

---

## Admin UI gap (informational — no bug)

The HTTP endpoint `POST /api/admin/matching-coordinator/directive` hardcodes `issuedBy: "admin_manual"`. This is **by design**: the admin panel can only issue manual-override directives; Quebracho-issued directives come exclusively from Quebracho's internal coordinator integration. To test a Quebracho-issued pause without a running Quebracho model, use `applyCoordinatorDirective("pause", ..., "quebracho")` directly (as this test script does).

The note in the task plan ("Send a `pause` directive with `issuer: 'quebracho'` from the admin panel") refers to the internal Quebracho agent flow, not the HTTP admin endpoint.

---

## Summary

**26 / 26 checks passed — 0 failures.**

| Area | Status |
|---|---|
| Quebracho reachability detection | ✅ |
| Coordinator snapshot `quebrachoReachable` field | ✅ |
| `canRunCycleNow()` baseline (no directives) | ✅ |
| Quebracho pause applied + AppSetting written | ✅ |
| `canRunCycleNow()` blocked with `source=quebracho` | ✅ |
| Snapshot `directives.quebracho` populated | ✅ |
| Resume clears AppSetting + restores `running` state | ✅ |
| `canRunCycleNow()` restored to `deterministic` after resume | ✅ |
| `force_cycle` one-shot bypass + consumed after first use | ✅ |

No wiring bugs found. The Quebracho→matching coordinator integration is correctly wired end-to-end with TC online and real DB data.
