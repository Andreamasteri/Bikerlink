---
name: large-files-ratchet scans filesystem, not git
description: The 600-line ratchet gate walks the actual filesystem tree, ignoring .gitignore; any untracked reference clone left on disk (e.g. .bikerblog-ref) gets scanned and can fail post-merge even though it's not part of the codebase.
---

`scripts/lib/large-files-core.ts` → `scanAllSourceFiles()` recursively walks the
real directory tree via `readdirSync`/`statSync`. It has its own hardcoded
`EXCLUDED_DIRS` set and does **not** consult `.gitignore`. Any directory that
exists on disk (even if gitignored and never committed) is scanned like normal
source.

**Incident:** after `scripts/refresh-bikerblog.sh` cloned the read-only
BikerBlog reference repo into `.bikerblog-ref/` (per the
`bikerblog-reference-access` memory), a later merge's post-merge setup ran the
ratchet gate and failed on `.bikerblog-ref/**/*.ts` files >600 lines — code
that isn't part of BikerLink at all.

**Fix applied:** added `.bikerblog-ref` to `EXCLUDED_DIRS` in
`scripts/lib/large-files-core.ts`.

**How to apply:** any time a new *reference-only* / vendored / read-only clone
directory is introduced under the workspace root (regardless of `.gitignore`
status), add it to `EXCLUDED_DIRS` in `large-files-core.ts` up front — don't
wait for a post-merge failure to discover it.
