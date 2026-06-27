---
name: Stack.Screen inline options loop
description: options={{}} inline in screen files → nuovo oggetto ogni render → useLayoutEffect React Navigation setOptions → loop infinito
---

## Regola

`<Stack.Screen options={{...}}>` o `<Tabs.Screen options={{...}}>` con oggetto
inline in una **screen component** (non in `_layout.tsx`) crea un nuovo oggetto
a ogni render del componente.

React Navigation usa internamente:
```js
useLayoutEffect(() => {
  navigation.setOptions(options);
}, [navigation, options]);
```

Nuovo riferimento `options` → `useLayoutEffect` si attiva → `setOptions` →
navigation state update → ri-render del navigator → ri-render della screen →
nuovo oggetto `options` → loop → "Maximum update depth exceeded".

**Why:** I file `_layout.tsx` si ri-renderano raramente MA possono farlo (cambio
tema, cambio `renderKey` lingua, remount) o vengono montati al passaggio di
navigazione (sub-layout annidati: `app/route`, `app/routes`, `app/contest`,
`app/admin/sensors`). Anche un `options={{ title: "…" }}` statico è un nuovo
oggetto literal a ogni render → stesso loop. Per questo il gate CI ORA copre
ANCHE i `_layout*.tsx` (vedi sotto), non solo le screen.

**How to apply:**
- Options **statiche** (valori primitivi costanti): estrarre in costante module-level
  ```ts
  const MY_SCREEN_OPTIONS = { headerShown: false } as const;
  // oppure
  const MY_SCREEN_OPTIONS = { title: "Titolo fisso" } as const;
  ```
- Options **dinamiche** (dipendono da state/props/context): useMemo con deps minimali
  ```ts
  const screenOptions = useMemo(
    () => ({ headerRight: hasContent ? headerRight : undefined }),
    [hasContent, headerRight]
  );
  ```
- Gate CI: `scripts/check-rnav-inline-props.sh` cattura il pattern
  `<(Stack|Tabs)\.Screen.*options=\{\{` SIA nelle screen (`SCREEN_INLINE_OPTS`)
  SIA nei `_layout*.tsx` (`LAYOUT_INLINE_OPTS`, ignora le righe-solo-commento).

## Convenzione fix
- Layout con molti screen (es. `app/admin/_layout.tsx`): usa una lookup table
  module-level (pattern `ADMIN_OPTS`/`SENSORS_OPTS`/…) che mappa name→options
  `as const`; il JSX referenzia `OPTS[name]`, mai oggetti inline.
- Layout con hook (`useTheme()`/`useColors()`): le options statiche restano
  costanti module-level; quelle che dipendono dai colori vanno in `useMemo`.
