---
name: Auth gate is intentionally distributed (don't centralize into _layout)
description: The isLoading/!user/ready boot decision lives across index.tsx/+not-found/(tabs)/_layout.tsx by design; centralizing into _layout.tsx reintroduces the boot loop. Plus where the only auth-context navigation side-effect now lives.
---

# Auth gate distribution — do NOT centralize into _layout.tsx

The auth boot decision (isLoading → spinner, !user → login, user ready → tabs) is
**deliberately distributed**, NOT in `app/_layout.tsx`:
- `app/index.tsx` — main gate: instant `<Redirect>` to `/(tabs)` when `isAuthenticated`
  (true because the cached-user snapshot is seeded into the query cache before the query
  is enabled), else onboarding/welcome.
- `app/+not-found.tsx` — declarative `<Redirect>` safety net (never imperative).
- `app/(tabs)/_layout.tsx` — safety redirect to `/(auth)/login` after the 150ms
  `hasWaited` window, via routerRef + didRedirectRef.

**Why:** centralizing the gate into `_layout.tsx` (a single `isLoading`/`!user` branch)
recreates the "redirect to tabs while auth loading" trigger that caused the documented
"Maximum update depth exceeded" boot loop. The distributed form is the structural fix
(see boot-loop-cached-user-hydration.md), not residue to consolidate.

**How to apply:** if a task says "consolidate the boot gate into _layout.tsx", treat it
as intentional drift — keep the distribution, record the rationale, do not move it.

## auth-context has no navigation side-effects
The only `router.push` that ever lived in `lib/auth-context.tsx` (the remote-diagnostic
poll) now lives in `components/layout/RemoteDiagnosticPoller.tsx`, mounted in `_layout.tsx`
beside BackgroundNotificationHandler. auth-context must stay navigation-free. The poller
uses the stable `router` singleton from expo-router (not `useRouter()`), so no
router-in-deps loop; it gates on `[!!user]`.
