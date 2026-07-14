---
name: Horus routing-correctness watchdog namespace + AI priority gate
description: Why routing-correctness probes live under a separate "horus" SignalSource and how routing-AI gets priority over Horus background cycles.
---

# Horus routing-correctness namespace + AI priority gate

## Separate watchdog namespace via `SignalSource = "horus"`
Routing/geocoding **correctness** probes (real route + plausibility validation,
not just "online yes/no") emit `Signal`s with `source: "horus"`. Because
`deriveProblems` builds `id = ${source}.${metric}`, every problem auto-lands in the
`horus.*` namespace, isolated from `maps.*`/`db.*`/etc.

**Why:** a future dedicated Horus routing proposer must be able to select ONLY these
problems via `p.source === "horus"` / `p.id.startsWith("horus.")` without touching the
generic watchdog proposer. The generic `runProposer` therefore **excludes**
`source === "horus"` (alongside the existing maps filter) so it never generates premature
proposals for them.

**How to apply:** keep correctness signals under `source:"horus"`. When wiring the
dedicated Horus proposer, filter by that source. Self-hosted `horus.*` ids (graphhopper/
valhalla/photon/pipeline `.correct`) are in `OUTAGE_DOWNSTREAM_IDS` so they're demoted to
warn when the ThinkCentre is powered off — mirror that for any new self-hosted correctness id.

## Dedicated Horus routing proposer (separate from generic watchdog proposer)
The generic `runProposer` excludes `source==="horus"`; those routing/geocoding
correctness problems are handled by a **dedicated** Horus proposer that generates
the fix through Horus's own persona + model (self-hosted Ollama first, cloud
fallback) with a routing-log-interpretation prompt, and writes via the SAME
`writeWatchdogLog` (kind:"proposal") so it appears in the existing admin panel.

**Why:** the fix suggestion for a routing engine must be authored by the routing
specialist (Horus), interpreting the real engine logs, not the generic watchdog
voice; reusing `writeWatchdogLog` + `proposalSchema` means zero new panel infra.

**How to apply:** sign as Horus by adding `persona:"horus"` into the proposal
`details` object (schema has no persona field) — the admin ProposalsCard badges it.
qwen3:4b "thinks" by default and corrupts structured JSON, so structured calls to
Horus's Ollama MUST pass `providerOptions:{ ollama:{ think:false } }` (added to
`generateStructured`). Keep a SEPARATE fingerprint AppSetting key and an
independent scheduler cooldown so the Horus proposer never piggybacks on / bursts
the generic one. Admin chat with Horus injects a live routing-status summary
(GraphHopper/Valhalla/Photon + pipeline + active horus problems) into the system
prompt (admin path only), built from the same ~4min-cached correctness probes.

## AI priority gate — routing AI wins over Horus background cycle
Real route-generation AI (`decideEngineWithAI`) and Horus's background diagnostic
cycle both hit the **same self-hosted Ollama**, whose scheduler in
`provider.ts` (`tryBuildOllama`) is **pass-through — it bypasses Bottleneck**. So a
cloud rate-limiter cannot coordinate them.

**Why:** without coordination, Horus's ~2h diagnostic cycle could start an Ollama call
right when a user is waiting on a live route decision, adding latency to the user path.

**How to apply:** `server/ai/ai-priority-gate.ts` is a tiny in-process counter +
2s grace window. `decideEngineWithAI`'s whole body is wrapped in `withRoutingAiPriority`.
`horus-analyzer.runCycle` (schedule trigger only) yields early if `isRoutingAiBusy()`
(counted in `totalSkippedRoutingBusy`) — it does NOT change the scheduler cadence
(same ~2h candidate / ≥90min cooldown), it just skips this tick and retries next time.
Manual trigger ("analizza ora") never yields. Do NOT touch the cloud Bottleneck limiters.

## Probes call the REAL clients, cached ~4min
Correctness probes call `graphHopperRoute`/`valhallaCalculateRoute` (not raw HTTP):
those clients do NOT record production routing-metrics/pipeline events (that happens only
in `router-selector.ts`), so probing them does not skew dashboards. Results cached ~4min
so the 60s collector doesn't hammer engines; self-hosted probes skipped when TC is
powered-off/in-maintenance (mirror `runMapsHealthChecks`). Pipeline correctness is
**derived** (pure `derivePipelineCorrectness`) from single-engine results + traffic
counters — no extra network call.
