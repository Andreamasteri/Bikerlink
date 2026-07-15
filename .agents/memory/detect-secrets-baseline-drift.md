---
name: detect-secrets baseline drift (unrelated to edit)
description: ci-secrets-scan can fail on lines you never touched, even for files fetched fresh from main, due to baseline/plugin version drift — not a regression you introduced.
---

The `secrets-scan` gate (detect-secrets-hook + .secrets.baseline) can flag lines as
new "Secret Keyword" findings even when the exact same content, same file, same line
number is already listed in `.secrets.baseline` with the same hash. Verified by
running the same file straight from `git show main:<path>` through
`detect-secrets-hook --baseline .secrets.baseline` directly — it fails identically,
proving the drift is pre-existing (baseline/tool-version mismatch), not caused by
your edit.

**How to apply:** if secrets-scan fails on a file you edited, first check out the
pristine main version of just that file and re-run detect-secrets-hook against it
directly. If it fails the same way unmodified, it's a pre-existing gate/baseline
drift — don't chase it as a regression from your change; note it and move on.
