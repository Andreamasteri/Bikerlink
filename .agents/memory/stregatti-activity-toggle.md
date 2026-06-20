---
name: Stregatti unified activity toggle
description: How fake-user "attività" (motion + availability rotation) and global visibility cascade are wired.
---

# Stregatti unified activity toggle

Motion GPS simulation and fake-availability rotation are ONE conceptual function
("attività stregatti"), controlled by a single source of truth in `app_settings`:
`fake_motion_enabled`. `server/fake-activity.ts` is the ONLY place that starts/stops
both timers together (motion cron + rotation interval), so the admin toggle works
without a server restart and leaves no ghost interval behind.

**Why:** there used to be a boot-once rotation gate keyed on `fake_users_enabled`
that kept firing `Fake zavorrine rotation error` while activity was off, plus two
duplicate `/motion/toggle` endpoints. Consolidated into the unified controller.

**How to apply:**
- Toggle activity only via `setFakeActivityEnabled()`; boot via `initFakeActivityOnBoot()`.
- `fake_users_enabled` = master "Visibilità Globale". When OFF, activity cannot be
  enabled (server returns 409) and `cascadeGlobalVisibilityOff()` forces motion +
  `chatbot_enabled` OFF and tears down timers.
- The single `/motion/toggle` lives in `routes/admin/stregatti.ts` (NOT misc.ts).
- Defaults: absent `fake_motion_enabled` = activity OFF. `fake_users_enabled` master
  default stays ON (absent = ON) — deliberately NOT changed to OFF (task deviation).
- Rotation lifecycle helpers live in `matching/scheduler.helpers.ts`
  (`startFakeZavorrineRotation`/`stopFakeZavorrineRotation`); `stopMatchingEngine()`
  also stops rotation.
- UI: in `StregattaActions.tsx` the activity + chatbot switches are locked
  (`disabled`) and shown OFF when global visibility is off
  (`motionEnabled = allEnabled && motionStatus.enabled`).
