---
name: AI Assistant config contract & default-safe enabled
description: Per-platform shape of the assistant config endpoints and the default-safe "enabled" rule the client must follow.
---

## Endpoint shape is PER-PLATFORM, not combined
Both `/api/ai/assistant/config` (user) and `/api/admin/ai/assistant/config` (admin)
return ONE platform at a time: `{ platform, config }` where `config` is a single
`AssistantPlatformConfig` (enabled, modes, actions, proactive, customFaqKeys).
Platform is chosen via the `?platform=android|ios` query param (defaults to android).

**How to apply:** any admin UI that shows both Android + iOS tabs must fetch the two
platforms separately (Promise.all of two GETs) and combine into `{android, ios}`.
The PUT also saves one platform at a time: body is the platform config DIRECTLY
(NOT wrapped in `{config}`), platform in the query param. Sending `{config:{android,ios}}`
fails Zod validation and the page hangs on its spinner (white screen) because
`draft[tab]` stays undefined.

## Default-safe "enabled" on the client
Server `loadAssistantConfig` returns DEFAULT_CONFIG with `enabled: true` only AFTER
the row loads. The client must treat a missing/loading config as enabled:
`adminEnabled = cfgQ.data?.config?.enabled !== false` (NOT `!!...enabled`).
Same idea for `modes` default `{ fab:true, selective:false, onboarding:false }`.

**Why:** `!!cfgQ.data?.config?.enabled` is false while the query is loading or if the
config was never saved → profile shows "Disabilitato dall'amministratore" and locks
the switches even though the admin never disabled anything. Only an explicit
`enabled === false` should disable.

## FloatingWidget handler ordering (Hermes TDZ)
The menu-item navigation handlers (handleChatPress/Notifications/Player) MUST be
declared ABOVE the Gesture.Tap() objects that capture them via runOnJS(). Under
Hermes a `const` referenced before its declaration is in the Temporal Dead Zone →
ReferenceError when the gesture fires (crashed on "Notifiche"). They also close the
menu synchronously (closeMenuJS) before router.push so the full-screen backdrop is
removed immediately.

## FAB vs FloatingWidget backdrop paint order
AssistantFab is rendered AFTER FloatingWidget in app/_layout.tsx so the FAB paints
above the FloatingWidget's full-screen backdrop and stays tappable while the menu is
open. The onboarding tour uses a Modal, so sibling order around it is irrelevant.
