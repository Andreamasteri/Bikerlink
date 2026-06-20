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

## ONE floating ball, RNGH Gesture.Pan() (not PanResponder), NOT two widgets
The floating UI is a SINGLE `components/FloatingWidget.tsx` ball. It uses
react-native-gesture-handler `Gesture.Pan()` + reanimated shared values
(`useSharedValue` posX/posY/startX/startY + `useAnimatedStyle` transform) for
drag/tap. Its tap opens one overlay menu (Assistente AI, Chat, Notifiche, Nuovi
Match, Player); the AI item is gated by `useAssistantEnabled().fabEnabled`. There
is NO separate AssistantFab anymore. The admin `components/admin/ai-console/FabWidget.tsx`
uses the same RNGH+reanimated pattern (tap/long-press still discriminated via
`Date.now()` timing in `onBegin`/`onEnd`, drag via translation).

**Why (PanResponder → RNGH):** Expo Router mounts everything under
`GestureHandlerRootView` and uses RNGH natively, so RNGH reclaims gestures before
the JS `PanResponder` ever sees them — the ball was neither tappable nor draggable
on real Expo Router screens. The fix is to speak RNGH's own language
(`Gesture.Pan()` driven by reanimated shared values on the UI thread), the exact
pattern `components/UptimeWidget.tsx` already uses and which works on real devices.

**Why NOT the old broken RNGH design:** an EARLIER attempt had TWO floating
components (orange FloatingWidget + purple AssistantFab) both on RNGH and was
chronically broken on Android APKs — but the cause was NOT `Gesture.Pan()` itself.
It was: inline `Gesture.Tap()` objects re-registering asynchronously and dropping
taps; menu handlers hitting Hermes TDZ when declared below the gesture; and
cross-tree gesture coordination (`withRef` / `simultaneousWithExternalGesture`
through a context ref) corrupting RNGH's gesture-tree registration. Two overlapping
floating components also caused touch-routing conflicts.

**How to apply:** keep this ball on a SINGLE `Gesture.Pan()` recreated each render
(like UptimeWidget). Position via `transform` translateX/translateY (NOT left/top —
on Android animating left/top leaves the touch hitbox at the original layout spot).
Tap-vs-drag is decided by a `TAP_THRESHOLD` translation check in `onEnd` (drag past
threshold suppresses the tap-toggle). Use `runOnJS` to cross back to JS for
`setMenuOpen`/AsyncStorage. Clamp/drag worklets carry a `"worklet"` directive
(no-op string under vitest, so `clampPos`/`isDragGesture` stay pure and testable).
Position persists in AsyncStorage key `floating_widget_position`, clamped on-screen.
Do NOT reintroduce `Gesture.Tap()`, do NOT split the AI action into a second floating
component, and do NOT coordinate floating gestures across separate components.
