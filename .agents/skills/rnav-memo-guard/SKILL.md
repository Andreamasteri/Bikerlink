---
name: rnav-memo-guard
description: Prevenzione loop "Maximum update depth exceeded" in React Navigation su BikerLink. Leggere PRIMA di modificare qualsiasi file _layout.tsx, tab bar, o componente che usa prop di navigazione (tabBar, tabBarIcon, headerLeft, headerRight, header). Obbligatorio anche quando il ratchet 600-line splitta un layout file.
---

# React Navigation — Memo Guard

## ⛔ REGOLA CRITICA

Le funzioni passate come prop a componenti React Navigation **devono sempre essere memoizzate**.

React Navigation chiama `navigation.setOptions` internamente ogni volta che il valore della prop cambia. Una funzione inline (freccia) crea un nuovo riferimento a ogni render:

```
render → nuova fn → setOptions → navigation state update → re-render → nuova fn → loop
```

Questo causa: **"Maximum update depth exceeded"** — crash globale al login se il componente è sempre montato (es. TabLayout).

---

## Prop pericolose

| Prop | Componente | Fix |
|------|-----------|-----|
| `tabBar` | `<Tabs>` | `useCallback` |
| `tabBarIcon` | `<Tabs.Screen options>` | `useMemo` sul parent che chiama la funzione helper |
| `headerLeft` | `<Stack.Screen options>` | `useCallback` |
| `headerRight` | `<Stack.Screen options>` | `useCallback` |
| `header` | `<Stack>` screenOptions | `useCallback` |

---

## Pattern VIETATI

```tsx
// ❌ VIETATO — nuovo riferimento a ogni render → loop
<Tabs tabBar={(props) => <CustomTabBar {...props} />} />

// ❌ VIETATO — 15 nuove funzioni a ogni render
<Tabs.Screen options={{
  tabBarIcon: ({ color, size, focused }) => <TabIcon ... />
}} />

// ❌ VIETATO
<Stack.Screen options={{
  headerLeft: () => <BackButton />,
}} />
```

---

## Pattern CORRETTI

```tsx
// ✅ CORRETTO — tabBar
const renderTabBar = useCallback((props: BottomTabBarProps) => (
  <CustomTabBar {...props} style={taskbarStyle} />
), [taskbarStyle]);

<Tabs tabBar={renderTabBar} />

// ✅ CORRETTO — tabBarIcon (quando viene da funzione helper chiamata nel JSX)
// Wrappare il RISULTATO della funzione helper con useMemo nel parent,
// non i singoli tabBarIcon (che sono dentro la helper e non possono usare hooks)
const tabScreens = useMemo(
  () => getTabScreens(t, { gpsTabHref, unreadCount, ... }),
  [t, gpsTabHref, unreadCount, ...]
);
<Tabs>{tabScreens}</Tabs>

// ✅ CORRETTO — headerLeft / headerRight
const headerLeft = useCallback(() => (
  <TouchableOpacity onPress={router.back}>
    <Ionicons name="close" size={24} />
  </TouchableOpacity>
), [router]);

const options = useMemo(() => ({
  headerLeft,
  title: isZavorrina ? "Richieste" : "Nuova Proposta",
}), [headerLeft, isZavorrina]);

<Stack.Screen options={options} />
```

---

## Regole per le deps di useCallback

1. **Solo variabili del closure esterno** catturate dalla funzione → nelle deps.
2. **Argomenti ricevuti dalla funzione** (es. `props`, `{ color, size, focused }`) → **NON nelle deps**.
3. I valori primitivi (`string`, `number`, `boolean`) da `useState` o da calcoli su valori stabili sono stabili.
4. `useT()` restituisce `useMemo(() => fn, [language])` → è stabile.
5. Verificare che ogni dep sia effettivamente stabile (non ricreata a ogni render).

---

## Ratchet 600-line e split di layout file

Quando il ratchet splitta un `_layout.tsx` o simile:
- **Non spostare mai funzioni inline** da un file all'altro senza memoizzarle.
- Se la funzione helper `getTabScreens` o simile produce JSX con `tabBarIcon` inline, il problema esiste già nel file originale. Wrappare il risultato con `useMemo` nel parent.
- Il gate CI `scripts/check-rnav-inline-props.sh` blocca il merge se trova il pattern.

---

## Storico bug BikerLink

| Data | Pattern introdotto | Effetto | Fix |
|------|--------------------|---------|-----|
| 22 mag 2026 | `renderCustomTabBar` inline in `(tabs)/_layout.tsx` | Crash globale al login — latente per 1 mese | OTA 163 |
| 22 giu 2026 | Split meccanico amplifica: 15× `tabBarIcon` inline in `_layout.part2.tsx` | Loop 16× più veloce → crash immediato | OTA 163 |
| 23 giu 2026 | `headerLeft` inline in `proposals/create.tsx` | Crash locale quando la schermata è aperta | OTA 163 |

---

## Gate CI

`scripts/check-rnav-inline-props.sh` è registrato in `post-merge.sh` come gate bloccante.
Se il check fallisce, il merge viene bloccato — correggere prima di procedere.

Verifica rapida manuale:
```bash
bash scripts/check-rnav-inline-props.sh
```
