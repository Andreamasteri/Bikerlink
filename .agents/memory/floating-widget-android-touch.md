---
name: FloatingWidget Android touch hitbox
description: Why the floating navigation pallino must use transform, not left/top, to stay tappable on Android
---
Il pallino flottante (components/FloatingWidget.tsx) deve posizionarsi con
`transform: [{translateX: pan.x}, {translateY: pan.y}]`, NON con `{left, top}`.

**Why:** su Android animare le layout-prop `left`/`top` di un Animated.ValueXY
sposta il pixel renderizzato ma lascia l'hitbox del touch alla posizione di
layout originale → il pallino "si vede ma non si tocca" (né drag né tap).
I transform invece spostano anche l'area di tocco. Su iOS/web entrambi gli
approcci funzionano, quindi il bug è Android-only.

**How to apply:** ancorare il container a `left:0, top:0` (così le coord
absolute restano nel pan value) e usare il transform. pan value continua a
contenere coordinate assolute → clamp/persistenza/setOffset/flattenOffset
invariati. Aggiungere anche `elevation` al container esterno: su Android
l'elevation governa l'hit-testing tra fratelli sovrapposti, dando priorità di
tocco al pallino. Non reintrodurre RNGH; resta su PanResponder.
