# Lezione per Ollama — Loop "Maximum update depth exceeded" (React Navigation)

> Documento di addestramento/contesto per il modello locale (Ollama) e per i futuri
> agenti. Spiega il meccanismo del loop, i 7 pattern che lo generano, le regole, i
> comandi grep per trovarli e gli esempi di fix. Sintesi del fix che ha prodotto OTA 208.

---

## 1. Il meccanismo (perché crasha)

React Navigation chiama `navigation.setOptions(...)` internamente, dentro un
`useLayoutEffect`, ogni volta che il **riferimento** dell'oggetto `options` /
`screenOptions` (o di una prop come `headerLeft`) cambia.

```
render
  → si crea un NUOVO riferimento (funzione inline, oggetto literal, value di Context, ecc.)
  → useLayoutEffect rileva il cambio di deps
  → navigation.setOptions(...)
  → aggiornamento dello stato di navigazione
  → re-render
  → si ricrea un NUOVO riferimento
  → loop infinito → ~50 render → "Maximum update depth exceeded" → crash
```

Il crash è **globale** e **deterministico** se il componente che genera il
riferimento instabile è sempre montato (TabLayout, un provider di Context alto
nell'albero, una schermata aperta al boot).

### Aggravante: crash-loop auto-perpetuante

Expo Router **persiste la navigation state** su AsyncStorage. Se una schermata
crasha appena montata (es. `proposals/create`), al riavvio Expo Router
**ripristina quella stessa schermata** → ricrasha → loop al boot che non si
interrompe nemmeno chiudendo e riaprendo l'app. È così che un singolo
`useCallback([router])` ha mandato in crash-loop l'APK rv 10.0.0.

---

## 2. I 7 pattern che generano il loop

| # | Pattern | Dove | Fix |
|---|---------|------|-----|
| 1 | Funzione arrow inline su `tabBar` / `tabBarIcon` / `headerLeft` / `headerRight` / `header` / `headerTitle` | `_layout.tsx`, screen | `useCallback` (o `useMemo` sul parent per `tabBarIcon`) |
| 2 | `options={{...}}` / `screenOptions={{...}}` con oggetto literal inline | `<Stack.Screen>`, `<Tabs.Screen>` | costante module-level (statico) o `useMemo` (dinamico) |
| 3 | Oggetti annidati (`headerStyle:{}`, `contentStyle:{}`, `tabBarStyle:{}`) dentro options | screenOptions | `useMemo` con deps sui valori `colors.*` |
| 4 | `[router]` come unica dep di `useCallback`/`useMemo`/`useEffect` | qualsiasi | `routerRef` (router NON nelle deps), deps `[]` |
| 5 | `router` in deps di `useEffect` che chiama `router.replace/push` | qualsiasi | `routerRef` + `didRedirectRef`, deps senza `router` |
| 6 | `<Context.Provider value={{...}}>` con value oggetto literal | provider | `const value = useMemo(() => ({...}), [deps])` |
| 7 | Oggetti React Query **interi** (mutation/query) nelle deps di un hook | callback/value memo | dipendere dalle **slice primitive** (`.isPending`, `.data`, `.mutate` via ref), MAI dall'oggetto intero |

### Note critiche sui pattern 4 e 7

- **Pattern 4 — `}, [router])` vs `), [router])`**: l'arrow con body a blocco
  chiude con `}, [router])`; l'arrow con body a espressione (`useCallback(() =>
  (...JSX...), [router])`) chiude con `), [router])`. Un gate che cerca solo la
  forma con `}` **non vede** la forma con `)`. Entrambe vanno catturate.
- **Pattern 7**: in React Query v5 l'oggetto restituito da `useMutation`/`useQuery`
  **non è referenzialmente stabile** tra render. Metterlo nelle deps fa cambiare
  il callback a ogni render → se quel callback alimenta `screenOptions`/`value` →
  loop. Le **uniche** parti stabili sono `.mutate` / `.mutateAsync` e `.refetch`.
  I campi di stato (`.isPending`, `.data`, `.variables`) sono primitivi: usarli è OK.

---

## 3. Regole d'oro

1. **Mai** una funzione inline su una prop di React Navigation. Sempre `useCallback`/`useMemo`.
2. **Mai** un oggetto literal inline come `options`/`screenOptions`/`value` di Context.
3. **Mai** `router` nelle deps. Usa `routerRef` (un `useRef` aggiornato a ogni render):
   il singleton di Expo Router è stabile, ma metterlo nelle deps fa scattare i gate
   ed è fragile ai refactor. `routerRef.current.push(...)` cattura il router al
   momento della chiamata, quindi funziona con deps `[]` e non genera warning
   `react-hooks/exhaustive-deps` (i ref sono esenti).
4. **Mai** un oggetto React Query intero nelle deps. Usa `.mutate` via ref + le slice primitive.
5. Gli **hook vanno PRIMA di qualsiasi early return** (Regole dei Hook).
6. Se un caso `[router]` è verificato safe, marcalo esplicitamente con
   `// rnav-memo-guard-ok` sulla riga delle deps (opt-out del gate).

---

## 4. Comandi grep per trovarli

```bash
# Pattern 1 — arrow inline su prop di navigazione
rg -n 'tabBarIcon:\s*\(\{|header(Left|Right|Title):\s*\(\)\s*=>|tabBar=\{\s*\('

# Pattern 2 — options/screenOptions inline in screen file (esclude _layout)
rg -n '<(Stack|Tabs)\.Screen[^/]*options=\{\{' app --glob '!app/**/_layout*.tsx'

# Pattern 3 — nested *Style:{} dentro screenOptions/options
rg -U -n 'screenOptions=\{\{[^}]{0,300}\w+Style:\s*\{'

# Pattern 4 — [router] come dep (CATTURA SIA `}, [router])` SIA `), [router])`)
rg -n '\[router\]' app hooks

# Pattern 6 — Context.Provider con value oggetto inline
rg -U -n 'Context\.Provider\s+value=\{\s*\{'

# Pattern 7 — oggetto mutation/query intero nelle deps di un hook (revisione manuale)
rg -n '\}, \[[^]]*Mutation[^]]*\]\)|\}, \[[^]]*Query[^]]*\]\)'
```

Il gate automatico è `scripts/check-rnav-inline-props.sh` (gira in post-merge).

---

## 5. Esempi di fix

### Pattern 1 — headerLeft inline → useCallback + routerRef

```tsx
// ❌ PRIMA — nuovo headerLeft a ogni render → screenOptions instabile → loop
const headerLeft = useCallback(() => (
  <TouchableOpacity onPress={() => router.back()}>
    <Ionicons name="close" size={24} color={Colors.text} />
  </TouchableOpacity>
), [router]);

// ✅ DOPO — routerRef stabile, deps []
const routerRef = useRef(router);
routerRef.current = router;

const headerLeft = useCallback(() => (
  <TouchableOpacity onPress={() => routerRef.current.back()}>
    <Ionicons name="close" size={24} color={Colors.text} />
  </TouchableOpacity>
), []);
```

### Pattern 6 — Context.Provider value → useMemo

```tsx
// ❌ PRIMA — nuovo oggetto a ogni render → tutti i consumer ri-renderano
const value: MapConfig = { enabled, provider, isLoading };
return <MapContext.Provider value={value}>{children}</MapContext.Provider>;

// ✅ DOPO
const value = useMemo<MapConfig>(
  () => ({ enabled, provider, isLoading }),
  [enabled, provider, isLoading],
);
return <MapContext.Provider value={value}>{children}</MapContext.Provider>;
```

### Pattern 7 — mutation object nelle deps → ref + slice primitive

```tsx
// ❌ PRIMA — deleteAllMutation non è stabile → handleDeleteAll instabile →
//            headerRight instabile → screenOptions instabile → loop
const handleDeleteAll = useCallback(() => {
  Alert.alert("...", "...", [{ text: "OK", onPress: () => deleteAllMutation.mutate() }]);
}, [deleteAllMutation, t]);

// ✅ DOPO — .mutate via ref, deps solo primitive
const deleteAllMutateRef = useRef(deleteAllMutation.mutate);
deleteAllMutateRef.current = deleteAllMutation.mutate;

const handleDeleteAll = useCallback(() => {
  Alert.alert("...", "...", [{ text: "OK", onPress: () => deleteAllMutateRef.current() }]);
}, [t]);
```

---

## 6. Procedura di triage rapido (per Ollama)

Quando ti arriva un report "Maximum update depth exceeded" o un crash-loop al boot Android:

1. **Sospetta primo la schermata aperta al crash**, non la mappa: Expo Router
   ripristina la nav state, quindi il crash-loop riparte sempre dalla schermata
   che ha crashato per prima.
2. Cerca nei file coinvolti i 7 pattern con i comandi grep della sezione 4.
3. Distingui **crash** (alimenta `screenOptions`/`options`/Context `value`) da
   **perf** (alimenta solo `renderItem` di una FlatList o props di componenti
   normali): il primo è prioritario, il secondo può andare in follow-up.
4. Applica i fix della sezione 5.
5. Fai girare `bash scripts/check-rnav-inline-props.sh`, typecheck e lint.
6. Se è un hotfix utenti, valuta di pubblicare via OTA (solo JS) senza nuovo APK.

---

## 7. Memoria correlata

File in `.agents/memory/` da consultare:
`auth-context-react-query-deps.md`, `context-provider-value-memo.md`,
`stack-screen-inline-options.md`, `rnav-screenoptions-nested.md`,
`router-in-useEffect-deps.md`, `rnav-memo-guard.md`, `react-query-batching-tabbarlayout-loop.md`.
