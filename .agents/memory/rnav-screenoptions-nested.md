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

## Caso speciale: tabBar* in screenOptions con custom tabBar

**Regola critica**: quando si usa `tabBar={renderCustomTabBar}`, le opzioni `tabBarStyle`, `tabBarLabelStyle`, `tabBarActiveTintColor`, `tabBarInactiveTintColor` in `screenOptions` sono **completamente ignorate** da React Navigation. Includerle è inutile E PERICOLOSO perché:
- `tabBarStyle: { height: tabBarHeight }` dove `tabBarHeight = 60 + insets.bottom` introduce una dipendenza da `useSafeAreaInsets()`
- Su Android, la Modal (es. OnboardingTour) anima la navigation bar frame-per-frame → `insets.bottom` cambia ad ogni frame → `tabsScreenOptions` nuovo ref ad ogni frame → `setOptions` per tutti i tab screen ad ogni frame → 50+ livelli → "Maximum update depth exceeded"

**Fix**: rimuovere completamente `tabBarStyle`, `tabBarLabelStyle`, `tabBarActiveTintColor`, `tabBarInactiveTintColor` da `screenOptions` quando si usa un custom `tabBar`. Il custom tab bar gestisce visuale, altezza e colori autonomamente.

**Questo era il crash dell'OnboardingTour — FIX PARZIALE OTA #182.** Rimossi `tabBar*` da `screenOptions`, ma il crash persisteva (OTA #183 chiude definitivamente).

## Caso speciale: renderCustomTabBar deps con insets → tabBar prop cascade (OTA #183)

**Pattern pericoloso**: `renderCustomTabBar` con `tabBarHeight`/`tabBarPaddingBottom` nelle deps di `useCallback`, dove questi valori derivano da `insets.bottom`.

```tsx
// SBAGLIATO — crea loop:
const tabBarHeight = 60 + insets.bottom;          // dipende da insets
const renderCustomTabBar = useCallback((...) => {
  return <CustomTabBar tabBarHeight={tabBarHeight} ... />;
}, [..., tabBarHeight]);                           // deps instabili

<Tabs tabBar={renderCustomTabBar} />               // tabBar prop cambia ogni frame
```

**Loop mechanism** (post-OTA#182, con `tabsScreenOptions` già stabile):
1. Modal → Android anima navigation bar → `insets.bottom` cambia (anche un solo frame)
2. `tabBarHeight` aggiornato → `renderCustomTabBar` nuovo ref (useCallback)
3. `tabBar={renderCustomTabBar}` → prop cambia → React Navigation ri-renderizza il tab navigator
4. Il ri-render del navigator triggera `useLayoutEffect` sui child screens → `setOptions`
5. → cascade → 50+ livelli → crash

**Fix definitivo**: spostare `useSafeAreaInsets()` DENTRO `CustomTabBar`. Il componente calcola `tabBarHeight`/`tabBarPaddingBottom` autonomamente. `renderCustomTabBar` non dipende più da insets → ref stabile → nessun cascade.

**Regola generale**: qualsiasi valore derivato da `useSafeAreaInsets()` NON deve finire nelle deps di `useCallback` che restituisce il `tabBar` prop di `<Tabs>`. Il custom tab bar deve leggere insets internamente.

**Why**: anche con `screenOptions` stabile, cambiare la `tabBar` prop causa un ri-render del tab navigator; se questo ri-render scatena `setOptions` (per qualsiasi ragione interna a React Navigation), il loop è garantito.

## File fixati (audit completo)
Layout file:
- `app/(tabs)/_layout.tsx` → `useMemo` per `tabsScreenOptions` (solo `headerStyle`/`headerTintColor`/`headerTitleStyle`; rimossi tutti i `tabBar*` che dipendono da `insets`)
- `app/_layout.tsx`, `app/admin/_layout.tsx`, `app/giro/_layout.tsx`, `app/navigate/_layout.tsx`, `app/giri/_layout.tsx` → `useMemo` (usano `useColors()`)
- `app/route/_layout.tsx`, `app/routes/_layout.tsx`, `app/profile/_layout.tsx`, `app/proposals/_layout.tsx`, `app/motoclub/_layout.tsx`, `app/evento/_layout.tsx`, `app/moderator/_layout.tsx`, `app/contest/_layout.tsx`, `app/(auth)/_layout.tsx` → costante module-level (usano `Colors` statico)
- `app/admin/sensors/_layout.tsx` → `useMemo` (usa `useColors()`)

Screen individuali:
- `app/profile/[id].tsx` → costante per loading/not-found, `useMemo` per main (title dinamico)
- `app/proposals/[id].tsx` → costante per loading/not-found, `useMemo` per main (title dinamico)
- `app/contest/winners.tsx` → `useMemo` (title con `t()`)
- `app/routes/user/[userId].tsx` → costante module-level
