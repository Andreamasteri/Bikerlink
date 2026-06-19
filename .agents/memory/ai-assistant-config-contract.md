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

## ONE floating ball, PanResponder only — NOT RNGH, NOT two widgets
The floating UI is a SINGLE `components/FloatingWidget.tsx` ball that uses
react-native `PanResponder` (Animated.ValueXY) for drag/tap — deliberately NOT
react-native-gesture-handler. Its tap opens one overlay menu (Assistente AI, Chat,
Notifiche, Nuovi Match, Player); the AI item is gated by `useAssistantEnabled().fabEnabled`.
There is NO separate AssistantFab anymore.

**Why:** the previous design had TWO floating components (orange FloatingWidget +
purple AssistantFab) both built on RNGH. On real Android APKs this was chronically
broken: inline `Gesture.Tap()` objects re-registered asynchronously and dropped taps;
menu handlers hit Hermes TDZ if declared below the gesture; and any attempt to
coordinate the two via cross-tree gesture refs (`withRef` /
`simultaneousWithExternalGesture` through a context ref) corrupted RNGH's gesture-tree
registration under `GestureHandlerRootView`, breaking the ball's own drag/menu. Two
overlapping floating components also caused touch-routing conflicts.

**How to apply:** keep gestures on this ball in PanResponder. Tap-vs-drag is decided
by a `TAP_THRESHOLD` movement check (drag past threshold suppresses the tap-toggle).
Position persists in AsyncStorage key `floating_widget_position`, clamped on-screen.
Do not reintroduce RNGH here, do not split the AI action back into a second floating
component, and do not coordinate floating gestures across separate components.
