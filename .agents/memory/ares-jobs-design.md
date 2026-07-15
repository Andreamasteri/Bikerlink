---
name: Ares long-running jobs (analysis + manual)
description: Design contract for Ares's on-demand full-app analysis and manual-generation background jobs, and why they stay independent from Horus.
---

# Ares long-running jobs

Ares (devstral, dedicated PC via `ARES_OLLAMA_*`) has two on-demand background
capabilities in `server/ai/ares-jobs/`: `analysis` (code+DB → proposals) and
`manual` (feature-organized textual manual for AI agents).

## Durable decisions

- **Independent from Horus.** Ares jobs do NOT reuse Horus's
  `aiAnalysisRuns`/`aiAnalysisArtifacts` tables. Job state + findings/report live
  in dedicated **AppSetting valueJson** keys (`ares_job_analysis`,
  `ares_job_manual`).
  **Why:** the task requires the two capabilities stay independent, and reusing
  Horus's schema would couple them and force a new DB migration for no benefit.
  **How to apply:** keep any new Ares job persistence in AppSettings, not in the
  Horus analysis tables.

- **Manual is saved into Nadir's existing storage, never a new destination.**
  `saveNadirManualWithBackup(text)` archives the current `nadir_manual_text` to a
  separate `nadir_manual_previous` key (`{text,savedAt}`) BEFORE overwriting, then
  the caller must call `reindexNadir("manual")` so it's searchable immediately.
  **Why:** spec forbids inventing a new manual store; Nadir must reindex to make it
  semantically searchable; the previous version must be recoverable/comparable.

- **On-demand ONLY — never scheduled.** No timer/cron. Jobs start only from
  `startAresJob(mode,{trigger})` invoked by: admin HTTP route
  (`/api/admin/ares/jobs/:mode/start`), the admin AI action
  (`ares-analyze-app`/`ares-generate-manual`), or Bowie chat interception
  (`detectAresJobRequest` in `roster.ts`, wired admin-only early in
  `runAssistantAgent`). Bowie must START the job, not answer for Ares.

- **Interactive Ares chat has priority over the background job.** The job calls
  `waitForAresIdle()` before each chunk (yields to any interactive consult) with a
  max-wait cap so it can't be starved forever; interactive consults wrap
  `withAresInteractivePriority` and NEVER wait on the job. This is separate from
  `withAresVramPriority` (VRAM eviction) — the job still uses both.

- **Single-flight + no auto-resume.** One job per mode via an in-process running
  flag + AbortController. A persisted `running` state with a stale `updatedAt`
  (process restarted) is reported as `interrupted`; resuming requires a NEW
  explicit request. If Ares is unconfigured/unreachable the job fails with a clear
  message (no silent hang).

- **Chunk sizing to fit the whole app under the safety cap.** ~2000 TS/TSX source
  files. Chunk byte budget must be large enough that total chunks stay under
  `SAFETY_MAX_CHUNKS`, or later files silently get dropped from coverage.
  **Why:** at an 18 KB budget the app needed ~890 chunks and truncated at the 800
  cap; 36 KB → ~374 chunks (full coverage under a 500 cap).
  **How to apply:** if the codebase grows, re-check `groupIntoChunks` coverage
  (`covered === inventory.length`) and bump budget/cap together.

- **Ares is strictly read-only.** Every Ares output passes `sanitizeAresText`
  (matchesSensitive on RAW text before redactPII — see sanitize-secret-before-pii).
  The only write is the manual into Nadir storage; never repo code or DB rows.
