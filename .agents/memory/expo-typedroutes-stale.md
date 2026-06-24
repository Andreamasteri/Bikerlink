---
name: Expo typed-routes stale in validation/CI
description: New Expo Router routes must not use typed-route pathname syntax; validation env has stale .expo types
---

# Expo Router typed-routes stale in validation/CI

**Rule:** when navigating to a route, use the cast pattern the rest of the
codebase uses — `router.push(\`/business/${id}\` as never)` — NOT the typed form
`router.push({ pathname: "/business/[id]" as const, params })`.

**Why:** `.expo/types/router.d.ts` is gitignored and the validation/CI typecheck
does NOT regenerate it before running `tsc`. For a NEW route file the generated
type lacks the route, so the typed `pathname: "/x/[id]" as const` form fails
client typecheck with `"/x/[id]" not assignable`. Existing routes only pass
because they predate the stale snapshot. The `as never` cast removes the
dependency on typed routes entirely and is the established codebase convention.

**How to apply:** any time you add a new route under `app/` and navigate to it,
cast with `as never`. Do not rely on regenerating `.expo` locally to "fix" the
typecheck — it passes locally but still fails in validation.

## Verifying the slow client tsc locally
- The full client tsc takes several minutes. Run it synchronously in one call:
  `timeout 115 npx tsc --noEmit -p tsconfig.client.json` (EXIT 0 = clean).
- `pgrep -f "tsc --noEmit"` self-matches your own polling command line (false
  "still running"); use `ps -eo pid,args | grep "tsc --noEmit" | grep -v grep`.
- Background log files written to workspace root / `.local/` get cleaned by a
  platform process mid-run, so nohup-to-file polling loses output.
