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
tema, cambio `renderKey` lingua, remount). Se il componente in `_layout.tsx`
usa hooks come `useTheme()` o `useColors()`, i `options={{}}` inline causano lo
stesso loop. I gate CI escludono `_layout.tsx` per evitare falsi positivi, ma
i layout con hooks vanno fixati manualmente con costanti module-level.

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
  `<(Stack|Tabs)\.Screen.*options=\{\{` in file non-`_layout.tsx`.

## Fix applicati (OTA #180)
- `app/notifications.tsx` → useMemo (deps: hasContent, headerRight)
- `app/match/archived.tsx` → useMemo (deps: t)
- `app/recap.tsx` → costante RECAP_SCREEN_OPTIONS
- `app/admin/ai-assistant.tsx` → costante AI_ASSISTANT_SCREEN_OPTIONS
- `app/admin/match-explain.tsx` → costante MATCH_EXPLAIN_SCREEN_OPTIONS

## Fix applicati (OTA #181) — layout files con hooks
- `app/_layout.tsx` → `RootLayoutNav` (usa `useTheme()`): aggiunte costanti
  module-level `ROOT_HIDDEN_HEADER` e `ROOT_ONBOARDING_SCREEN_OPTIONS`.
  Tutte le 15 Stack.Screen ora usano le costanti (non più inline).
- `app/admin/_layout.tsx` → `AdminLayout` (usa `useColors()`): introdotto
  lookup table module-level `ADMIN_OPTS` con tutti i 75+ titoli/opzioni.
