---
name: Bowie Terminal instant-close push
description: How the fast-close signal for Bowie Terminal relates to the existing 50s poll, and why iOS is excluded.
---

The Bowie Terminal standalone app auto-closes (Android: BackHandler.exitApp, iOS: lock screen) when the main BikerLink app comes to foreground. This was originally detected only via a 50s poll.

A push-based fast path was added: the main app's foreground signal endpoint also fires a data-only Expo push (no title/body, so no visible banner) to all tokens registered under app_id "bowie". The terminal listens for this push and triggers the same close logic immediately, with the poll kept as an unconditional fallback (no baseline/ack logic needed for the push path — it's push-event driven, not polled state, so triggering unconditionally on receipt is correct).

**Why:** ExpoPushMessage previously required title/body; made them optional to support silent/data-only pushes without changing the notification-handler's default (visible) behavior for other push types.

**How to apply:** The push path only benefits Android — `initNotifications()` in `bowie-terminal/lib/notifications.ts` returns early on iOS and never registers a token, so iOS Bowie Terminal still relies solely on the 50s poll. Don't assume the fast path covers iOS without extending push registration there first.
