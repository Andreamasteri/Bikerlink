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

## RNGH gesture objects must be memoized (lost taps)
A `Gesture.Tap()` (or any RNGH gesture) created inline in a component body is rebuilt
every render. `GestureDetector` then re-registers the native handler on each new
object, and RNGH applies that update asynchronously — taps that land during the
re-registration window are silently dropped. The runOnJS callback inside the worklet
also captures its JS function ref at gesture-creation time, so an unstable callback
risks a stale closure under Hermes.

**How to apply:** wrap the JS callback in `useCallback` (deps minimal — useState
setters are already stable) and wrap the gesture in `useMemo([callback, sharedValue])`.
This was the suspected cause of the AssistantFab (bottom-left AI FAB) not responding
to taps while the FloatingWidget ball worked fine.

## DO NOT coordinate FAB ↔ FloatingWidget via cross-tree gesture refs
Tried sharing the FAB's `Gesture.Tap()` through a React context ref so the
FloatingWidget's full-screen backdrop could declare it
`.simultaneousWithExternalGesture(ref)` (and FAB `.withRef(ref)`). On a real Android
APK this REGRESSED the FloatingWidget: the ball could no longer be dragged and its
menu rendered detached from the ball — even though the backdrop only mounts while the
menu is open. Reverted completely (removed the context module, the `.withRef`, the
`.simultaneousWithExternalGesture`, and the provider).

**Why:** a cross-GestureDetector relation resolved from a context ref appears to
corrupt RNGH's gesture-tree registration under `GestureHandlerRootView`, breaking
sibling gestures (the ball's pan/menu), not just the intended pair. It is NOT the
clean additive op the docs imply for refs that live in a different detector subtree.

**How to apply:** keep the FAB tappable over the FloatingWidget backdrop with
PAINT ORDER / z-order only (FAB rendered after FloatingWidget, `zIndex 10000` above
the backdrop). Do not reach for `withRef`/`simultaneousWithExternalGesture` across
separate components. If FAB-tap-while-menu-open ever needs to also close the menu,
solve it locally (backdrop hitbox bounds that exclude the FAB corner), not globally.
