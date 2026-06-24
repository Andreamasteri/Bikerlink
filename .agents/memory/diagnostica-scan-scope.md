---
name: Diagnostica "Scan" tab scope
description: The admin Diagnostica Scan tab is deliberately a single tab, not the elaborate 3-panel Health Check vision.
---

# Diagnostica "Scan" tab — scope boundary

The fifth "Scan" tab in the admin Diagnostica panel (`app/admin/diagnostica-scan.tsx`,
backend `server/routes/admin/health-check.ts` + `scripts/health-check/`) is
intentionally a **single Scan tab**: checker toggles, AI provider selector with
live status, analysis/fix mode, realtime per-checker progress, severity-grouped
results with deterministic 🟢/🔴 badges, per-finding AI diffs in fix mode, task
creation, save-log, send-to-assistant (opens `AiCopilotDrawer`), export JSON.

**Why:** the original brief sketched a much larger 3-panel vision (separate
Code/Database/Chat panels, a `/api/admin/scan/chat` streaming endpoint, an
install checklist, Ollama model install, GPU/env readiness, a 70+ DB-integrity
checker matrix, AI-autonomous discovery). Those were explicitly cut to keep the
deliverable focused. Code review tends to flag the missing 3-panel pieces as
"incomplete" — that is expected; they are out of scope, not a regression.

**How to apply:** if asked to extend Scan, confirm whether the user wants the
larger vision before adding panels/endpoints. Do not auto-expand scope just
because a reviewer lists the 3-panel items as gaps.

## Safe-fix classifier contract
`scripts/health-check/classify.ts` uses a conservative **allowlist**: only
`imports`, `file-placement`, `dead-code` categories are 🟢 safe-fix; everything
else defaults to 🔴 review. Risky-pattern regexes and critical severity force 🔴
even inside safe categories. "Crea task" buttons are gated to `safeFix===true`.
**Why:** auto-creating tasks for non-mechanical findings is unsafe; default to
review when in doubt.
