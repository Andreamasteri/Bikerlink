---
name: RootLayout InteractionManager boot guard
description: NormalRootLayout mount DEVE passare per InteractionManager.runAfterInteractions o causa loop React Navigation al boot.
---

## Regola

Qualsiasi mount di `NormalRootLayout` (o di uno Stack di navigazione fresco) deve essere ritardato con `InteractionManager.runAfterInteractions` prima che React Navigation processi le screen.

## Why

Il mount immediato di `NormalRootLayout` dopo una transizione di stato asincrona (es. `resolveBootGateActive()`) scatena la cascata `useLayoutEffect → setOptions` di React Navigation prima che il navigatore si stabilizzi → "Maximum update depth exceeded".

Questo bug era latente: con BootGate ON (OTA 211), il delay era fornito da `BootGateController.showApp` (che già usava InteractionManager). Con BootGate OFF (OTA 214), `RootLayout` montava NormalRootLayout immediatamente dopo il null→false della `decision` state → loop.

## How to apply

In `app/_layout.tsx`:
- `showNormalLayout` state inizializzato a `false`
- Nell'effect async, dopo `setDecision(false)`: `InteractionManager.runAfterInteractions(() => setShowNormalLayout(true))`
- Il render mostra `<View />` placeholder finché `!showNormalLayout`
- Cleanup dell'handle con `imHandle?.cancel()`

Identico al pattern `showApp` in `components/boot-gate/BootGateController.tsx`.
