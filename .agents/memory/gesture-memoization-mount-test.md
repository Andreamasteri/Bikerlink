---
name: Gesture memoization mount tests
description: How the mount-based RNGH gesture-stability tests work and the mock pitfall that breaks them
---

I componenti floating (FloatingWidget, AssistantFab) hanno gesti RNGH che DEVONO
restare memoizzati (stessa referenza tra render) o il drag si rompe a metà
trascinamento. Esistono test che MONTANO i componenti con `react-test-renderer`
(React reale, NON mockato) e verificano la stabilità della referenza del gesto
composto attraverso un re-render da setState.

**Regola critica del mock:** nel mock di `react-native-reanimated`,
`useSharedValue` DEVE restituire una referenza stabile tra i render
(`useRef({value}).current`), come la vera Reanimated. Un mock ingenuo
`(v) => ({value: v})` crea un nuovo oggetto a ogni render: i shared value sono
dep dei `useMemo` dei gesti, quindi i gesti verrebbero invalidati per
costruzione e il test fallirebbe anche con codice corretto (falso negativo).

**Why:** senza questo, il test non distingue tra "gesti non memoizzati" (vero
bug) e "mock instabile" (artefatto di test). Mascherare la memoizzazione reale.

**How to apply:**
- File: `components/__tests__/{AssistantFab,FloatingWidget}.gesture-memo.test.ts`.
- NON mockare `react` in questi file (serve la memoizzazione reale degli hook);
  gli altri file (`*.bottom.test.ts`, `*.gesture.test.ts`) mockano `react` con
  useMemo no-op apposta perché testano solo funzioni pure.
- `Gesture.Tap/Pan/Exclusive` mockati restituiscono un builder con identità unica
  per chiamata + `_type` + `_cb` (callback) + `gestures` (per Exclusive).
- `GestureDetector` mockato spinge `props.gesture` in un array hoisted.
- Trigger del re-render = chiamare il callback del gesto che fa setState:
  FloatingWidget pan `_cb.onStart()` → setIsTouching; AssistantFab tap
  `_cb.onEnd({},true)` → setOpen.
- `react-test-renderer` è una devDependency JS-only (mai nel bundle app); React 19
  la deprecata ma funziona in env node senza DOM.
- Mutation check: rimuovere lo useMemo di `composedGesture` deve far fallire il
  test (verificato).
