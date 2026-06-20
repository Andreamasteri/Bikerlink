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

## ONE floating ball, PanResponder (NOT RNGH), NOT two widgets
The floating UI is a SINGLE `components/FloatingWidget.tsx` ball. It uses
**PanResponder** from react-native + reanimated `useSharedValue` + `useAnimatedStyle`
for drag/tap. PanResponder handles gestures (JS thread); reanimated shared values
hold posX/posY for the transform animation. Its tap opens one overlay menu; the AI
item is gated by `useAssistantEnabled().fabEnabled`. There is NO separate AssistantFab.

**Why PanResponder, NOT RNGH Gesture.Pan():**
`Gesture.Pan()` with `minDistance(0)` competes with Expo Router's native RNGH
gesture handlers on Android and crashes the app on the first tap. PanResponder runs
on the JS thread and does not participate in RNGH's native gesture recognition
system → no conflict.

**Why the previous "hitbox invisible" bug does NOT reoccur with PanResponder:**
That bug was caused by using dynamic `left`/`top` style props for positioning (the
pixel moved but the touch hitbox stayed at the original layout spot). The fix is
`transform: [{translateX}, {translateY}]` with fixed `left:0, top:0` — this was
already applied and must be kept regardless of gesture system.

**How to apply:** position via `transform` translateX/translateY (NOT left/top
dynamic). Tap-vs-drag discriminated by `TAP_THRESHOLD` on `gestureState.dx/dy` in
`onPanResponderRelease`. Start position saved in `dragStartX/dragStartY` refs at
`onPanResponderGrant`. Position persists in AsyncStorage key `floating_widget_position`,
clamped on-screen via `clampPos` (pure JS, "worklet" directive is a no-op in tests).
Do NOT migrate to RNGH Gesture.Pan() — it crashes on Android. Do NOT split into two
floating components. The mount test uses `vi.mock("react-native", …)` and must
include `PanResponder: { create: () => ({ panHandlers: {} }) }` or the test crashes.
