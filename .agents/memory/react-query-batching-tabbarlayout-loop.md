---
name: React Query batching + TabBar layout loop
description: Root cause e fix definitivo del crash "Maximum update depth exceeded" quando una Modal appare mentre React Query refetch è attivo.
---

## Regola

`renderCustomTabBar` (o qualsiasi funzione passata come `tabBar` a `<Tabs>`) DEVE avere
deps `[]` e leggere i valori runtime da un `ref` aggiornato ogni render — mai da una
closure con valori che cambiano.

## Root Cause

React 18 automatic batching raggruppa in un unico commit:
1. `setVisible(true)` di una Modal (es. OnboardingTour)
2. State update da React Query refetch completato nello stesso tick async

Quando `TabLayout` è nel commit (re-render da query) E `renderCustomTabBar` ha deps che
includono valori React Query (`hasActiveMatches`, `unreadCount`, `newMatchCount`, ecc.),
il useCallback ottiene un **nuovo ref funzione**. Questo causa:

```
tabBar prop (nuovo ref) su <Tabs>
  → React Navigation "setOptions" su tutti e 15 i Tabs.Screen (via useLayoutEffect)
  → navigation state cambia 15 volte → ogni cambio = nuovo navigation ref
  → Tabs.Screen re-render → useLayoutEffect ri-esegue → setOptions di nuovo
  → 50+ update annidati sincroni → "Maximum update depth exceeded"
```

## Fix Pattern (tabBarStateRef)

```tsx
// 1. Ref per tutti i valori runtime — aggiornato OGNI render (assignment diretto)
const tabBarStateRef = useRef({ showCalibrationBadge, taskbarStyle, ... });
tabBarStateRef.current = { showCalibrationBadge, taskbarStyle, ... };

// 2. renderCustomTabBar legge dal ref → deps [] → ref MAI cambia
const renderCustomTabBar = useCallback((props: BottomTabBarProps) => {
  const { showCalibrationBadge: _sc, taskbarStyle: _ts, ... } = tabBarStateRef.current;
  // usa _sc, _ts, ... invece dei valori di closure
  return <CustomTabBar tabs={tabs} style={_ts} />;
// eslint-disable-next-line react-hooks/exhaustive-deps
}, []);
```

**Why:** il ref è sempre aggiornato al momento della chiamata (React Navigation chiama
renderCustomTabBar durante il suo render cycle, DOPO che tabBarStateRef.current è stato
aggiornato dal render di TabLayout). L'icona tab risultante è sempre fresca.

**How to apply:** ovunque una funzione di render viene passata come prop a un navigator
(`tabBar`, `header`, `drawerContent`, ecc.) e la funzione cattura valori che cambiano
con query data o context values. Usa sempre il pattern ref+`[]` deps.

## Segnali che indicano questo bug

- Crash "Maximum update depth exceeded" SOLO quando una Modal appare in contemporanea
  a un network request che completa
- Stack trace: `enqueueConcurrentRenderForLane` → `batchUpdates` → `latestCallback`
  → `commitHookEffectListMount` → `recursivelyTraverseLayoutEffects`
- Il crash NON avviene se la Modal appare senza query active (es. offline)
- Crash riproducibile su Android, meno frequente su iOS (scheduler timer diverso)
