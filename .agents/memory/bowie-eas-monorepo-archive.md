---
name: Bowie/nested-Expo EAS archive pollution
description: why an EAS build for a nested Expo app (no own .git) uploads a huge archive and how to scope it, plus a real sandbox limitation on submitting builds from the agent
---

`bowie-terminal/` has no `.git` of its own — it shares the root repo's `.git`. EAS CLI's default VCS-based archiving strategy walks up to the git root and packs ALL git-tracked files in the whole monorepo (main app's assets/migrations/docs included), not just the subproject. Confirmed empirically: `git ls-files | grep -v '^bowie-terminal/'` totaled ~74MB, matching the inflated upload size almost exactly, for a subproject that is ~1MB on disk.

**Fix:** always build nested/non-git-root Expo subprojects with `EAS_NO_VCS=1` (forces plain directory copy from cwd) plus a project-local `.easignore`. Also set `EAS_SKIP_AUTO_FINGERPRINT=1` — `@expo/fingerprint`'s workspace-root detection has the same climb-up behavior and can hang independently of the archive step.

**Do not fix this by editing the root `.gitignore`/`.easignore`** — that's a shared resource that could alter the main app's own (already-working) build. Scope the fix entirely on the nested subproject's side.

**Why:** without this, a build for a small nested app can appear to hang indefinitely at "Compressing project files" for no visible reason, and it's easy to misdiagnose as a network or sandbox issue instead of an archive-scope issue.

**Separate sandbox limitation (not the same problem):** even after fixing the archive scope, submitting a real `eas build` from this agent's bash tool was unreliable — the CLI process died before reaching a queued build ID in most attempts (varied: foreground, background, detached with `setsid`, heartbeat-polled), succeeding at compress+upload only once out of ~7 varied attempts. This matches other confirmed cases of long-running network operations not surviving this sandbox's process lifecycle. If a real build genuinely needs to be verified end-to-end and repeated attempts fail identically, it should be launched from the Replit Shell tab (a real terminal), not the agent's bash tool.
