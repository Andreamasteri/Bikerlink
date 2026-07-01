---
name: Bowie Terminal push tokens — per-app scoping
description: How the standalone bowie-terminal APK and the main BikerLink app avoid overwriting each other's Expo push token.
---

Bowie Terminal (`bowie-terminal/`, bundle `com.bikerlink.bowieterminal`) is a
separate Android APK that logs into the SAME BikerLink account. Historically it
registered its Expo token into the single `users.expoPushToken` column, so
whichever app installed LAST stole the other's notifications.

**Current model — per-app token storage.** Tokens live in a `push_tokens` table
scoped by `app_id` ('main' | 'bowie'), with the Expo token itself as the natural
unique key (upsert on token). `PUT /me/push-token` accepts an optional `appId`:
- `appId="main"` (the default when omitted) still writes `users.expoPushToken`
  AND a push_tokens row. **Main-app behavior must stay unchanged** — all the
  existing main senders read `users.expoPushToken`, so do not remove that write.
- any non-main `appId` writes push_tokens ONLY and must never touch
  `users.expoPushToken`. That separation is the whole point.

**Why the legacy column still exists:** to guarantee zero regression, only the
Bowie reply path was switched to read push_tokens (via a per-app token lookup);
the ~15 main senders were intentionally left on the legacy column.

**Stale-token gotcha:** the default DeviceNotRegistered handler nulls
`users.expoPushToken`, which is wrong for a companion app. Companion senders must
pass a handler that deletes the offending push_tokens row by token instead.

**How to apply / add a companion app:** register with its own `appId` (add it to
the endpoint's allowed-appId set) and read tokens scoped to that appId. Never
route a companion app's token through `users.expoPushToken`. No backfill is
needed — each app self-heals by re-registering into its own scope on next open.

**Known gaps:** unknown/typo `appId` currently falls back to "main" (could
re-introduce stealing — consider rejecting instead); no uniqueness on
(user_id, app_id, device_id), so stale per-device rows can accumulate until a
send fails with DeviceNotRegistered.

The notification quick-reply headless path (app fully killed) remains an
unvalidated POC in `bowie-terminal/lib/notifications.ts`; accepted fallback =
notification opens the app.
