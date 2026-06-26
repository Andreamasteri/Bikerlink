---
name: Boot-loop cached-user hydration
description: Structural fix for the Android boot "Maximum update depth exceeded" loop — seed the auth query cache before enabling it; never optimistic-redirect to /(tabs) with user=undefined. Plus the refetchQueries-vs-disabled-query gotcha.
---

# Boot-loop: hydrate cached user, don't optimistic-redirect

## Root cause (confirmed by git bisection)
The Android boot loop was triggered by an **optimistic `Redirect` to `/(tabs)` in `app/index.tsx`
while auth was still loading** (`user=undefined`). Mounting the authed subtree with
`user=undefined` and then resolving `/api/auth/me` produced an **undefined→defined transition of
the AuthContext value**, which re-rendered the freshly-mounted tree → React Navigation
`setOptions` cascade → "Maximum update depth exceeded". ~10 prior OTA fixes were **symptomatic
patches inside the subtree** (inline-prop memoization, screenOptions, guards) and never removed
the trigger.

## Structural fix (no new guard)
Persist a `SafeUser` snapshot in AsyncStorage and on cold boot **seed the query cache
(`queryClient.setQueryData(["/api/auth/me"], cached)`) BEFORE flipping the query to enabled**
(`setStorageChecked(true)`). Then `/(tabs)` mounts with `user` already defined — no
undefined→defined transition, no cascade. The index/landing gate must rely on `isAuthenticated`
(derived from the seeded cache) for an instant redirect, and only show a spinner when there is
genuinely **no** cached session.
**Why:** removes the trigger instead of damping its effects; symptomatic patches kept regressing.
**How to apply:** never reintroduce a "redirect to tabs while authIsLoading" branch. Keep the
full `SafeUser` in the snapshot (it excludes password/token; AsyncStorage is app-sandboxed) so
tab consumers never read undefined fields during the revalidation window — narrowing it risks
partial-data render crashes.

## TanStack Query gotcha: refetchQueries ignores disabled queries
`queryClient.refetchQueries()` does **NOT** refetch a query whose observer has `enabled:false`.
A `setState` that flips `enabled` (e.g. `setStorageChecked(true)`) only applies on the **next
render**, so calling `refetchQueries` synchronously in the same tick hits the **still-disabled**
query and silently no-ops → a seeded-but-expired session is never revalidated (stays
authenticated forever with `staleTime:Infinity`).
**Why:** caught in review — the first cut put revalidation in the storage-load effect and the
401 check never ran.
**How to apply:** force the one-shot revalidation from a **post-`useQuery` effect** using the
observer's `userQuery.refetch()` (which bypasses `enabled` and, by then, runs with the query
enabled). Gate it with a pure predicate (`shouldRevalidateHydratedSession`) so it fires exactly
once and only when the cache was seeded.
