---
name: screenOptions nested objects loop
description: screenOptions/options con oggetti annidati causano loop Maximum update depth exceeded — fix e gate
---

## Regola
`screenOptions={{...}}` o `options={{...}}` con oggetti annidati (`headerStyle:{...}`, `contentStyle:{...}`, `tabBarStyle:{...}`) inline in JSX = nuovi riferimenti a ogni render → React Navigation chiama `navigation.setOptions` via `useLayoutEffect` → navigation state update → re-render → loop.

**Fix**: avvolgere con `useMemo` e dichiarare come deps i valori `colors.*` usati:
```tsx
const myScreenOptions = useMemo(() => ({
  headerStyle: { backgroundColor: colors.surface },
  headerTintColor: colors.text,
}), [colors.surface, colors.text]);
<Stack screenOptions={myScreenOptions}>
```

**Why**: `commitLayoutEffectOnFiber` → `commitHookEffectListMount` nel stack trace = useLayoutEffect che chiama setState in loop; React limita a 50 iterazioni → "Maximum update depth exceeded".

**How to apply**:
- Ogni `_layout.tsx` che usa `useColors()` E ha `screenOptions={{` o `options={{` con oggetti annidati
- Colpisce: `app/(tabs)/_layout.tsx`, `app/_layout.tsx`, `app/admin/_layout.tsx`, `app/giro/_layout.tsx`, `app/navigate/_layout.tsx`, `app/giri/_layout.tsx`
- Gate CI: `scripts/check-rnav-inline-props.sh` → `check_pattern_multiline 'screenOptions=\{\{[^}]{0,300}\w+Style:\s*\{'`
