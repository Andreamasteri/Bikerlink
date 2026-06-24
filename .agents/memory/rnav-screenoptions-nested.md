---
name: screenOptions nested objects loop
description: screenOptions/options con oggetti annidati causano loop Maximum update depth exceeded — fix e gate
---

## Regola
`screenOptions={{...}}` o `options={{...}}` con oggetti annidati (`headerStyle:{...}`, `contentStyle:{...}`, `tabBarStyle:{...}`) inline in JSX = nuovi riferimenti a ogni render → React Navigation chiama `navigation.setOptions` via `useLayoutEffect` → navigation state update → re-render → loop.

Colpisce TUTTI i file tsx: non solo `_layout.tsx` ma anche screen individuali che usano `<Stack.Screen options={{...headerStyle:{...}}} />`.

## Fix

**Layout file con `useColors()` hook** → `useMemo` con deps `colors.*`:
```tsx
const screenOptions = useMemo(() => ({
  headerStyle: { backgroundColor: colors.surface },
}), [colors.surface]);
<Stack screenOptions={screenOptions}>
```

**Layout file con `Colors` statico (import costante)** → costante module-level (creata una volta, non cambia mai):
```tsx
const LAYOUT_OPTIONS = {
  headerStyle: { backgroundColor: Colors.surface },
  contentStyle: { backgroundColor: Colors.background },
} as const;
export default function XxxLayout() {
  return <Stack screenOptions={LAYOUT_OPTIONS} />;
}
```

**Screen individuale con titolo statico** → costante module-level:
```tsx
const SCREEN_OPTIONS = {
  headerShown: true,
  title: "Testo fisso",
  headerStyle: { backgroundColor: Colors.surface },
} as const;
// In componente:
<Stack.Screen options={SCREEN_OPTIONS} />
```

**Screen individuale con titolo dinamico** → `useMemo` con deps sul valore dinamico:
```tsx
const screenOpts = useMemo(() => ({
  headerShown: true,
  title: profile.nickname,
  headerStyle: { backgroundColor: Colors.surface },
  headerRight: isSelf ? undefined : headerRight,
}), [profile.nickname, isSelf, headerRight]);
<Stack.Screen options={screenOpts} />
```

**Why**: `commitLayoutEffectOnFiber` → `commitHookEffectListMount` nel stack trace = `useLayoutEffect` che chiama setState in loop; React limita a 50 iterazioni → "Maximum update depth exceeded". Il loop avviene anche con valori identici: è la REFERENZA dell'oggetto a triggerare il `useLayoutEffect`.

**How to apply**:
- Qualsiasi file in `app/` (layout o screen) che passa `screenOptions={{...}}` o `options={{...}}` con almeno un oggetto annidato (es. `headerStyle:{...}`) inline in JSX
- Se il componente usa navigation hooks (`useLocalSearchParams`, `useNavigation`, `useRouter`), il rischio di loop è alto perché re-renderà a ogni `setOptions`
- Gate CI: `scripts/check-rnav-inline-props.sh` cattura tutti i pattern: `screenOptions`, `Stack.Screen options`, `Tabs.Screen options`, `header/headerLeft/headerRight` inline, `router` in hook deps senza `routerRef`
- Gate complementare: `scripts/check-router-in-effect-deps.sh` (Python) — rileva `useEffect/useCallback` con `router.replace/push` nel corpo + `[router]` nelle deps

## Caso speciale: tabBarIcon inline in funzioni helper (non in JSX diretto)

`_layout.part2.tsx` conteneva 15 funzioni `tabBarIcon: ({ color, size, focused }) => (...)` dentro `options={{...}}` di `Tabs.Screen`. Anche se `getTabScreens()` era chiamata dentro un `useMemo` in `_layout.tsx`, ogni re-evaluation del useMemo (al cambio di `newMatchCount`, `unreadCount`, ecc.) creava NUOVE arrow function → `setOptions` → loop.

**Fix definitivo**: spostare il rendering delle icone tab nel `renderCustomTabBar` (useCallback), che riceve tutti i dati dinamici nelle sue deps. Le `options` dei `Tabs.Screen` diventano solo valori primitivi stabili (title stringhe, href, headerShown). Il `tabScreens` useMemo passa da 9 deps a 3 deps (`t`, `gpsTabHref`, `isBikerOrCoppia`).

**Why**: il loop del custom tab bar si origina da `tabBarIcon` nelle options, non dal rendering visivo: React Navigation legge le options internamente via `useLayoutEffect` e chiama `setOptions`. Anche se il custom tab bar usa `options.tabBarIcon` per filtrare route, la soluzione è spostare il rendering direttamente nel custom tab bar e usare una logica di filtro alternativa (come il flag `tabBarButton` già settato da Expo Router per `href:null`).

**Gate miss**: il gate `check-rnav-inline-props.sh` con `rg 'tabBarIcon:\s*\(\{'` trova correttamente il pattern in `_layout.part2.tsx` se eseguito direttamente. Il miss era dovuto a un bug di scope nell'esecuzione del gate come workflow CI — ora risolto fixando il codice.

## File fixati (audit completo)
Layout file:
- `app/(tabs)/_layout.tsx`, `app/_layout.tsx`, `app/admin/_layout.tsx`, `app/giro/_layout.tsx`, `app/navigate/_layout.tsx`, `app/giri/_layout.tsx` → `useMemo` (usano `useColors()`)
- `app/route/_layout.tsx`, `app/routes/_layout.tsx`, `app/profile/_layout.tsx`, `app/proposals/_layout.tsx`, `app/motoclub/_layout.tsx`, `app/evento/_layout.tsx`, `app/moderator/_layout.tsx`, `app/contest/_layout.tsx`, `app/(auth)/_layout.tsx` → costante module-level (usano `Colors` statico)
- `app/admin/sensors/_layout.tsx` → `useMemo` (usa `useColors()`)

Screen individuali:
- `app/profile/[id].tsx` → costante per loading/not-found, `useMemo` per main (title dinamico)
- `app/proposals/[id].tsx` → costante per loading/not-found, `useMemo` per main (title dinamico)
- `app/contest/winners.tsx` → `useMemo` (title con `t()`)
- `app/routes/user/[userId].tsx` → costante module-level
