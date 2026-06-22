---
name: (tabs) route collision drops group from typegen
description: Why /(tabs) and child routes vanish from expo-router Href types, and the runtime-safe fix
---

# `(tabs)` group dropped from expo-router generated Href types

## Symptom
`npx tsc --noEmit -p tsconfig.client.json` errors on every `router.push/replace("/(tabs)...")`
and `<Redirect href="/(tabs)" />`: `Type '"/(tabs)"' is not assignable to ...`. The generated
`.expo/types/router.d.ts` contains the `(auth)` group but ZERO `(tabs)` entries (neither
`/(tabs)/match` nor the de-grouped `/match`).

## Root cause
A **route collision at `/`**: both `app/index.tsx` and `app/(tabs)/index.tsx` resolve to `/`
(groups add no path segment). When two files map to the same path, expo-router's typed-routes
generation drops the ENTIRE colliding group from the Href union. `(auth)` has no `index.tsx`,
so it survives. Restarting Metro / regenerating types does NOT help — the file is rewritten
byte-identical because the collision is structural, not stale cache.

**Why:** confirmed by `MatchPopupAlert.tsx` historically using `const X: Href = "/(tabs)/match"`
(a plain annotation, only valid when tabs WAS in the union) — i.e. it regressed when the second
`/` index was introduced.

## Fix applied (runtime-safe, no route restructure)
Cast the literals: `"/(tabs)..." as Href` (import `type Href` from `expo-router`). For the
object form `router.push({ pathname, params })`, the object doesn't overlap the Href union →
must use `as unknown as Href`. For a plain `const X: Href = "..."` annotation, switch to a cast
`const X = "..." as Href` (the annotation itself errors otherwise).

**How to apply:** prefer casts when the task forbids runtime changes. The *proper* root fix is
to eliminate the duplicate `/` route (remove/rename one index), but that changes navigation
runtime — only do it if explicitly allowed.
