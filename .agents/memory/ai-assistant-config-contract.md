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

## FAB ↔ FloatingWidget backdrop gesture coordination (Task #4449 secondary fix)
The FloatingWidget renders a full-screen `Gesture.Tap()` backdrop while its menu is
open; it overlaps the FAB corner and on Android RNGH's native hit-test could route a
FAB tap to the backdrop instead. Fixed by sharing the FAB gesture via
`lib/assistant-fab-gesture-context.tsx` (context whose default is a module-level
fallback ref `{current:undefined}` so consumers never crash without a provider). The
FAB attaches `.withRef(fabGestureRef)`; the backdrop declares
`.simultaneousWithExternalGesture(fabGestureRef)`. Provider mounts in RootProviders
INSIDE `GestureHandlerRootView`, wrapping both consumers.

**Why:** `simultaneousWithExternalGesture` is additive — it never blocks the
backdrop's own recognition, so the working FloatingWidget is unchanged; it only stops
the backdrop from winning the FAB's touch. Tapping the FAB while the menu is open now
opens the AI sheet AND closes the menu (coherent). `simultaneousWithExternalGesture`
lives on `BaseGesture`, so apply it to the inner `Gesture.Tap()`/`Pan()`, NOT to a
`Gesture.Exclusive(...)` ComposedGesture (the ball's composed gesture).
