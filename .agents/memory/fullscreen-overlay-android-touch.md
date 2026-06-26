---
name: fullscreen-overlay Android touch + modal blocking
description: Why a full-screen Animated.View overlay (native-driver opacity) eats button taps on Android and how to fix it without losing modal blocking.
---

# Full-screen overlay che mangia i tap su Android

Un overlay a schermo intero fatto con `Animated.View` (opacity con native driver,
`StyleSheet.absoluteFill`) può intercettare i tocchi e rendere NON tappabili i
bottoni dei suoi figli su Android, anche con `zIndex` alto.

## Regola
1. `pointerEvents="box-none"` sull'Animated.View esterno → la view non diventa
   responder ma delega i tocchi ai figli (card + Pressable tornano tappabili).
2. `elevation` dell'overlay DEVE essere **strettamente maggiore** di TUTTI i
   fratelli flottanti a schermo, non solo `zIndex`. Su Android l'elevation governa
   anche l'hit-testing tra viste sovrapposte. Es. BikerLink: FloatingWidget=12,
   UptimeWidget=20 → overlay a 24 (un pareggio a 20 NON garantisce la priorità).
3. `box-none` ri-apre un buco: i tap sullo sfondo dim passano alle tab dietro →
   si perde il blocco modale. Ripristinarlo con un `<Pressable absoluteFill onPress={()=>{}}/>`
   come PRIMO figlio (dietro la card), dentro l'Animated.View box-none. La card
   sta in un wrapper `pointerEvents="box-none"` sopra il backdrop.

**Why:** Task bottoni bloccati AssistantOnboardingTour (Bowie) su Android dopo
OTA: i bottoni "Avanti"/"X" non rispondevano. zIndex non bastava; serviva
box-none + elevation che batte i widget elevati. Il backdrop Pressable evita la
regressione "tap sullo sfondo attiva le tab dietro".

**How to apply:** ogni overlay fullscreen animato con bottoni interni (tour,
coachmark, popup modali) su React Native + Android. Pattern: Animated.View
(box-none, elevation > fratelli, zIndex 9999) → [Pressable backdrop absoluteFill]
+ [View box-none che centra la card].

## Timing al boot
`setVisible(true)`+fade vanno schedulati dentro `InteractionManager.runAfterInteractions`
+ `setTimeout(...,~600ms)` con un `showTimerRef` pulito nel cleanup dell'useEffect
e un guard `cancelled` controllato anche dentro il timeout: evita di montare
l'overlay durante la finestra di settling iniziale di React Navigation (peggiore
con cache auth idratata che monta le tab all'istante).
