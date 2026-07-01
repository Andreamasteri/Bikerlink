---
name: Bowie Terminal shares expoPushToken with main app
description: Standalone bowie-terminal APK registers on the same users.expoPushToken column as the main BikerLink app — installs overwrite each other.
---

Bowie Terminal (`bowie-terminal/`, bundle `com.bikerlink.bowieterminal`) is a
separate Android APK that logs into the SAME BikerLink account and registers its
Expo push token via `PUT /api/users/me/push-token`, which writes the single
`users.expoPushToken` column (`shared/db/users.ts`).

**Constraint:** there is only ONE push-token slot per user. Whichever app
(main BikerLink app or Bowie Terminal) registered its token LAST is the one that
receives push notifications. Installing both on the same account means the
lock-screen quick-reply / notifications silently move to the last install.

**Why:** the backend has no per-device / per-app token table; push targeting is
user-scoped on a single column.

**How to apply:** if you touch push registration in either app, or add a second
companion app, don't assume a token you just registered is still there — the
other app may have overwritten it. A real fix requires a multi-device token
table (device_id → token, app_id) server-side, not a client change.

The notification quick-reply headless path (app fully killed) is an unvalidated
POC in `bowie-terminal/lib/notifications.ts`; accepted fallback = notification
opens the app.
