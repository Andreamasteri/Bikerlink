---
name: Bowie notification quick-reply reliable delivery
description: Why the persistent-notification text reply uses opensAppToForeground + cold-start recovery instead of a headless task
---
# Bowie notification quick-reply — reliable delivery

The persistent Android notification lets users reply to Bowie from the lock
screen (bowie-terminal). The original POC relied on a headless expo-task-manager
task to forward the typed text when the app was fully killed.

**Rule:** do NOT rely on the headless notification-response task for the
app-killed case — it is unvalidated and can silently drop the typed text.
Instead:
- Category REPLY action uses `opensAppToForeground: true` → Android always
  launches/foregrounds the app on send, guaranteeing JS runs.
- App-alive path: `addNotificationResponseReceivedListener` callback.
- Cold-start (killed→launched) path: `getLastNotificationResponse()` at mount,
  then `clearLastNotificationResponse()` to dedupe (otherwise it re-fires on
  every later normal open).
- Both paths feed the text into the terminal's send flow inline (via a
  submitTextRef, kept out of the bootstrap useEffect deps to avoid replaying the
  welcome), so the answer shows in chat, not as a separate push.

**Why:** with a single static category action, `opensAppToForeground` cannot be
dynamic (silent-when-alive vs open-when-killed). Guaranteed "no lost input"
requires the app to open, so we always open. The cold-start listener does NOT
fire for the launching response — only getLastNotificationResponse returns it.

**Side effect:** server POST /ai/assistant/notification-reply (push-back path)
and the client notificationReply() are now unused by the terminal.
