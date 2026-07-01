---
name: Bowie Terminal instant-close push
description: How the fast-close signal for Bowie Terminal relates to the existing 50s poll, and how iOS silent push differs from Android.
---

The Bowie Terminal standalone app auto-closes (Android: BackHandler.exitApp, iOS: lock screen) when the main BikerLink app comes to foreground. This was originally detected only via a 50s poll.

A push-based fast path was added: the main app's foreground signal endpoint also fires a data-only Expo push (no title/body, so no visible banner) to all tokens registered under app_id "bowie". The terminal listens for this push and triggers the same close logic immediately, with the poll kept as an unconditional fallback (no baseline/ack logic needed for the push path — it's push-event driven, not polled state, so triggering unconditionally on receipt is correct).

**Why:** ExpoPushMessage previously required title/body; made them optional to support silent/data-only pushes without changing the notification-handler's default (visible) behavior for other push types.

**Both platforms now covered, but iOS needs extra APNs plumbing Android doesn't:**
- iOS registers a push token too now (`setupNotifications()` in `bowie-terminal/lib/notifications.ts` skips channel/category/permission-request — those are Android-only quick-reply plumbing — and goes straight to `getExpoPushTokenAsync()`, which calls `registerForRemoteNotifications()` internally regardless of alert-permission grant status).
- A silent/data-only push is invisible to APNs unless the message also sets `priority: "normal"` + `_contentAvailable: true` (added to `sendBowieCloseSignalPush` in `server/push-notifications.ts`) AND the app declares `ios.infoPlist.UIBackgroundModes: ["remote-notification"]` in `bowie-terminal/app.json`. Without both, APNs just drops the payload instead of waking a backgrounded/killed app. These fields are no-ops on Android/FCM.
- Quick-reply (persistent notification with inline text input) is still Android-only by design — iOS only gets the silent close signal, not the reply UI.
- **Hard Apple platform limit, not fixable by any app code:** if the user force-quits an iOS app (swipes it away in the App Switcher), iOS will NOT relaunch or wake that process for any push — silent/content-available included. This can only be verified/observed on a real device with a real build; it cannot be worked around. Backgrounded-but-not-killed apps CAN be woken this way, but delivery timing is OS-throttled/best-effort (no guaranteed latency). Design accordingly: treat the 50s poll as the only guaranteed path for the fully-killed case, and rely on the existing baseline-reset-on-launch behavior (first read after relaunch never triggers) so a stale lock screen never appears when the user manually reopens a killed terminal.
