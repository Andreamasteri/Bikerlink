---
name: Bowie Terminal iOS quick-reply category
description: iOS needs its own notification permission + category registration for the reply action to appear; a push token alone (for silent pushes) isn't enough.
---

On iOS, `getExpoPushTokenAsync()` (via `registerForRemoteNotifications`) succeeds even without the user granting the "alert" notification permission — that's enough for silent/data-only pushes (e.g. the auto-close signal), but NOT enough for any visible notification or its actions (like the reply text-input action) to ever appear.

**Why:** an earlier iOS integration only needed the push token for a silent signal, so it skipped `requestPermissionsAsync()` and `setNotificationCategoryAsync()` entirely. When quick-reply was later extended to iOS, those calls had to be added for iOS too, not just Android — otherwise the reply category/action silently never shows up, with no error anywhere.

**How to apply:** if a notification needs to show any visible UI (alert, action buttons, text input) on iOS, `requestPermissionsAsync()` must be called and the category must be registered via `setNotificationCategoryAsync()` on iOS too. Android-only fields on notification content (`sticky`, `autoDismiss`) are silently ignored by iOS — don't rely on them there, but the category/action still works.

**Physical-device verification tasks:** when a task's acceptance criteria require exercising real iOS lock-screen/notification behavior (permission prompt UI, cold-start relaunch timing, actual APNs delivery), the agent has no iOS device/simulator access and cannot fulfill that criteria directly. The established pattern in this project (see `bowie-terminal/E2E-TEST-CHIUSURA.md` and `E2E-TEST-QUICKREPLY-IOS.md`) is: do a thorough static code review, document exactly what was verified vs. what can't be verified without hardware, and leave a step-by-step manual checklist file for the user to run once a device is available — don't claim the behavior is confirmed.
