---
name: TabLayout boot guard — loop setOptions fresh install
description: Causa e fix del crash "Maximum update depth exceeded" su fresh install dopo StartupGate=passthrough
---

## Il problema

Con StartupGate corretto a pass-through (OTA 170), TabLayout si montava subito — anche quando `user=null` e `isLoading=true`. Questo esponeva due loop pre-esistenti:

1. **15 Tabs.Screen con tabBarIcon arrow function** — React Navigation processa in batch `setOptions` al mount; ogni render crea nuovi riferimenti → `setOptions` → `setState` → re-render → loop → crash "Maximum update depth exceeded"
2. **useHomeMapState() in MapScreen** — hook pesante con ~8 useEffect che si montava quando auth non era pronto

## Il fix

**app/(tabs)/_layout.tsx** — Boot guard:
```tsx
const minimalTabsScreenOptions = useMemo(() => ({ ... }), []);
const hiddenTabOptions = useMemo(() => ({ ... }), []);

if (isLoading || !user) {
  return (
    <Tabs screenOptions={minimalTabsScreenOptions}>
      {/* solo Tabs.Screen con options={hiddenTabOptions}, nessun tabBarIcon */}
    </Tabs>
  );
}
```
- Condizione: `isLoading || !user` (non `&&`) — copre sia init che la finestra `isLoading=false, user=null`
- Le options **devono** essere memoizzate con deps `[]` per stabilità dei riferimenti
- Tutti gli hook chiamati **prima** del conditional return (Rules of Hooks)

**app/(tabs)/index.tsx** — MapScreen wrapper:
```tsx
export default function MapScreen() {
  const { isLoading } = useAuth();
  if (isLoading) return <View style={{ flex: 1 }} />;
  return <MapScreenContent />;
}
```

## Invarianti

- Il redirect verso `/(auth)/login` è gestito dall'useEffect esistente in TabLayout con `hasWaited=true` dopo 150ms — NON serve un Redirect component aggiuntivo
- Il boot guard deve renderizzare Tabs minimali (non null) per non smontare la Stack (v. `map-ready-gate-null-bug.md`)

**Why:** arrow function inline nei tabBarIcon (e in tabBar custom) crea nuovi riferimenti ad ogni render → React Navigation chiama setOptions in cascata → loop; la soluzione è bloccare il mount delle Tabs complete finché user è pronto, con options memoizzate anche per le Tabs minimali.
