---
name: React Query batching + TabBar layout loop
description: Root cause e fix del crash "Maximum update depth exceeded" — include boot-guard TabNavigator remount (OTA-188) e Modal/React Query batching (OTA-186).
---

## Fix Layer 0 — Boot-guard TabNavigator remount (OTA #188 → parziale, #189 → completo)

**OTA #188 — root cause parziale:** Il branch `if (isLoading || !user) return <Tabs minimal>`
nel TabLayout smontava/rimontava il `<Tabs>` navigator al boot. Fix: rimosso il branch minimal,
`renderCustomTabBar` ritorna `null` via ref (deps=[]) durante `!isReady`. Il crash però persisteva.

**OTA #189 — root cause reale (simbolicata da source map OTA-188):**
`useSyncState.js:80` (listeners.forEach) + `useChildListeners.js:54` + `useLatestCallback.js:52`.

`tabScreens = useMemo(getTabScreens, [t, gpsTabHref, isBikerOrCoppia])` viene **invalidato**
quando `isBikerOrCoppia` cambia al boot (`null→user carica`). Questo ricrea 15 nuovi options
objects per i `<Tabs.Screen>` → `useLayoutEffect` in ogni screen fires → `setOptions × 15`
→ `scheduleUpdate × 15` → `useSyncState.listeners.forEach × 50` → `enqueueConcurrentRenderForLane`
× 50 sincrono → "Maximum update depth exceeded".

**La chiave:** il crash non richiede il remount del navigator — basta che i children `<Tabs.Screen>`
ricevano nuovi options objects simultaneamente (15 in un batch) per innescare il loop.

**Fix (OTA #189):**
```tsx
// Module-level (stabili, mai ricreati):
const BOOT_SCREENS: React.ReactElement[] = [
  <Tabs.Screen key="index" name="index" options={{ headerShown: false }} />,
  // ... 14 altri screen con options statiche
];

// In TabLayout — ref congelato:
const frozenTabScreensRef = React.useRef<React.ReactElement[] | null>(null);
if (frozenTabScreensRef.current === null && isTabBarReady) {
  frozenTabScreensRef.current = getTabScreens(t, { gpsTabHref, isBikerOrCoppia });
}
const tabScreens = frozenTabScreensRef.current ?? BOOT_SCREENS;
```

**Why:** `tabScreens` viene creato UNA SOLA VOLTA (al primo render con user disponibile) e
MAI aggiornato → nessun cambio di children dopo il mount → nessun cascade. Prima di isReady
usa BOOT_SCREENS module-level (zero deps runtime → zero cascade).

**How to apply:** i children di un navigator (`<Tabs>`, `<Stack>`) NON devono cambiare dopo il
mount se le modifiche portano a 10+ screen simultanei che aggiornano options. Congela con ref.

**Segnale diagnostico:** source map su `useSyncState.js:80` + `useChildListeners.js:54`
(non solo useSyncState) indica cascade da options-change, non da remount.

---

## Regola generale (layer 1+)

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

## Fix Layer 2 — Nested objects in screenOptions

Anche dopo il fix del `tabBar` prop, il crash può persistere se `screenOptions` passa
**nested objects non stabili** a `<Tabs>` o `<Stack>`. Quando `screenOptions` cambia:

```
tabsScreenOptions = { headerStyle: NEW_OBJ, headerTitleStyle: NEW_OBJ, ... }
  → React Navigation aggiorna screenOptions per tutti gli N screen
  → isEqual(old_merged, new_merged) fallisce sui nested objects (ref compare)
  → setOptions cascade identico a quello su tabBar
```

**Regola:** qualsiasi nested object (`headerStyle`, `headerTitleStyle`, `contentStyle`, ecc.)
dentro un `useMemo` di options DEVE essere estratto in un `useMemo` separato con le sue
proprie deps, o a module-level se i valori sono costanti.

```tsx
// SBAGLIATO: headerTitleStyle creato ad ogni run del useMemo esterno
const tabsScreenOptions = useMemo(() => ({
  headerStyle: { backgroundColor: colors.surface },   // nuovo ref ogni volta
  headerTitleStyle: { fontFamily: "Inter_600SemiBold" }, // nuovo ref ogni volta
}), [colors.surface]);

// CORRETTO: nested objects isolati
const TABS_HEADER_TITLE_STYLE = { fontFamily: "Inter_600SemiBold" } as const; // module-level
const tabHeaderStyle = useMemo(() => ({ backgroundColor: colors.surface }), [colors.surface]);
const tabsScreenOptions = useMemo(() => ({
  headerStyle: tabHeaderStyle,           // ref stabile tra render
  headerTitleStyle: TABS_HEADER_TITLE_STYLE, // ref eternamente stabile
}), [tabHeaderStyle]);
```

## Fix Layer 3 — De-batching Tour setVisible da React Query

`InteractionManager.runAfterInteractions()` intorno a `setVisible(true)` nel Tour
garantisce che il commit del Modal avvenga in un contesto async separato dai refetch
React Query → React 18 non può batcharli insieme → nessuna combinazione pericolosa.

```tsx
InteractionManager.runAfterInteractions(() => {
  if (!cancelled) {
    setVisible(true);
    void logAssistantClientEvent("onboarding_started");
  }
});
```

**Why:** anche se layer 1+2 sono corretti, un futuro cambio potrebbe reintrodurre
instabilità. Il layer 3 è una difesa indipendente che garantisce la separazione dei commit.

## Fix Strutturale Definitivo — Modal → View overlay

**React Native `<Modal>` su Android cambia il system UI** (status bar + navigation bar
animano in/out) → SafeAreaProvider aggiorna gli insets → TUTTI i consumatori di
`useSafeAreaInsets()` re-renderizzano → cascade setOptions se uno di questi è nel
tree di navigazione.

**Regola:** qualsiasi overlay trasparente (Tour, confirm sheet, reminder) che appare
AUTOMATICAMENTE (non su esplicita azione utente) DEVE usare `StyleSheet.absoluteFill`
+ `Animated.View`, NON `<Modal>`. La `<Modal>` di RN è riservata a fogli di sistema
(`presentationStyle="formSheet"`) o contesti dove la separazione dal view tree è
funzionalmente necessaria.

```tsx
// SBAGLIATO — Modal causa inset-cascade:
<Modal visible transparent animationType="fade">
  <View style={styles.overlay}>...</View>
</Modal>

// CORRETTO — View overlay, zero impatto system UI:
<Animated.View style={[StyleSheet.absoluteFill, styles.overlay, { opacity: fadeAnim }]}>
  <View style={[styles.card, { backgroundColor: colors.surface }]}>...</View>
</Animated.View>

const styles = StyleSheet.create({
  overlay: { backgroundColor: "rgba(0,0,0,0.6)", padding: 24, justifyContent: "center", zIndex: 9999 },
  // ...
});
```

Componenti fixati (OTA #186): `AssistantOnboardingTour`, `FakeHomeIntroModal`,
`GarageReminderModal`, `AssistantActionConfirmSheet`.

## Segnali che indicano questo bug

- Crash "Maximum update depth exceeded" SOLO quando una Modal appare in contemporanea
  a un network request che completa
- Stack trace: `enqueueConcurrentRenderForLane` → `batchUpdates` → `latestCallback`
  → `commitHookEffectListMount` → `recursivelyTraverseLayoutEffects`
- Il crash NON avviene se la Modal appare senza query active (es. offline)
- Crash riproducibile su Android, meno frequente su iOS (scheduler timer diverso)
- Se il crash persiste dopo layer 1: cercare nested objects in `screenOptions` useMemo
