---
name: rnav-loop-checker
description: Procedura riutilizzabile per diagnosticare e fixare il loop "Maximum update depth exceeded" / crash-loop al boot Android in app React Navigation + Expo Router (BikerLink). Usa questa skill quando un crash mostra "Maximum update depth exceeded", quando l'app va in crash-loop al boot dopo il login su APK, o prima di pubblicare un OTA che tocca _layout.tsx, schermate con Stack.Screen/Tabs.Screen, provider di Context, o handler di navigazione. Complementare a rnav-memo-guard (che documenta i pattern); questa skill è il *processo* end-to-end in 7 step.
---

# rnav-loop-checker

Processo end-to-end per trovare ed eliminare i loop di re-render di React
Navigation. Per la teoria dei pattern e la tabella delle prop pericolose vedi la
skill `rnav-memo-guard` e il documento `docs/ollama-rnav-loop-lezione.md`.

## Quando usarla

- Crash "Maximum update depth exceeded".
- Crash-loop al boot Android che riparte da solo a ogni riavvio dell'app.
- Prima di un OTA/build che modifica navigazione, layout, provider o handler.

## Concetto in una riga

React Navigation chiama `setOptions` in un `useLayoutEffect` quando cambia il
**riferimento** di `options`/`screenOptions`/una prop → un riferimento nuovo a
ogni render → loop. Expo Router persiste la nav state → la schermata che crasha
viene ripristinata al boot → crash-loop.

---

## Procedura (7 step)

### Step 1 — Identifica la schermata che crasha PER PRIMA
Non assumere che sia la mappa o la home. Expo Router ripristina l'ultima nav
state: il crash-loop riparte dalla schermata che ha crashato per prima. Guarda i
log/diagnostica per il primo stack trace, e considera quale route era aperta.

### Step 2 — Cerca i 7 pattern nei file coinvolti
```bash
# arrow inline su prop di navigazione
rg -n 'tabBarIcon:\s*\(\{|header(Left|Right|Title):\s*\(\)\s*=>|tabBar=\{\s*\('
# options/screenOptions inline in screen file
rg -n '<(Stack|Tabs)\.Screen[^/]*options=\{\{' app --glob '!app/**/_layout*.tsx'
# nested *Style:{} dentro options
rg -U -n 'screenOptions=\{\{[^}]{0,300}\w+Style:\s*\{'
# [router] come dep — cattura sia `}, [router])` sia `), [router])`
rg -n '\[router\]' app hooks
# Context.Provider con value inline
rg -U -n 'Context\.Provider\s+value=\{\s*\{'
# oggetto mutation/query intero nelle deps (revisione manuale)
rg -n '\}, \[[^]]*(Mutation|Query)[^]]*\]\)'
```

### Step 3 — Classifica ogni hit: CRASH vs PERF
- **CRASH (prioritario)**: il riferimento instabile alimenta
  `options`/`screenOptions` di `Stack.Screen`/`Tabs.Screen`, oppure il `value` di
  un `Context.Provider` alto nell'albero, oppure una prop di navigazione.
- **PERF (deferibile)**: alimenta solo `renderItem` di una FlatList o props di
  componenti normali. Niente loop, solo re-render inutili → ok in follow-up,
  specie in un hotfix OTA dove vuoi minimizzare il rischio.

### Step 4 — Applica i fix
- Prop di navigazione inline → `useCallback`/`useMemo` (per `tabBarIcon` memoizza sul parent).
- `options`/`screenOptions` inline → costante module-level (statico) o `useMemo` (dinamico).
- `[router]` nelle deps → `routerRef` (`const routerRef = useRef(router); routerRef.current = router;`) e deps `[]`; usa `routerRef.current.push/back(...)`.
- `Context.Provider value={{...}}` → `const value = useMemo(() => ({...}), [deps])`.
- Oggetto React Query intero nelle deps → ref su `.mutate`/`.refetch` (stabili) + slice primitive (`.isPending`, `.data`, `.variables`).
- Hook dopo early return → spostalo PRIMA del return.

### Step 5 — Aggiorna/verifica il gate
Il gate è `scripts/check-rnav-inline-props.sh`. Deve catturare `[router]` in
**entrambe** le forme (`}, [router])` e `), [router])`) e NON esonerare un intero
file solo perché contiene `routerRef` da qualche parte. Opt-out per riga:
`// rnav-memo-guard-ok` sulla riga delle deps.

### Step 6 — Verde su tutti i check
```bash
bash scripts/check-rnav-inline-props.sh          # gate rnav
npx tsc --noEmit -p tsconfig.client.json         # typecheck client
npm run lint -- --max-warnings=0                  # lint zero warnings
```

### Step 7 — Pubblica (se hotfix utenti)
Se il fix è solo JS (nessuna dipendenza nativa aggiunta), pubblica via **OTA**
senza nuovo APK: aggiorna `.ota-message` (descrive le novità di QUESTA release,
non cita la precedente) e lancia il workflow `OTA Publish`. Il client OTA va in
lockstep col server Express.

---

## Trappole note (dai fix passati)

- **`}, [router])` vs `), [router])`**: il bug che ha fatto slittare
  `proposals/create.tsx` al CI. L'arrow con body a espressione chiude con `)` non
  con `}`; un gate che cerca solo `}` non lo vede.
- **Oggetti React Query non stabili (v5)**: l'oggetto `useMutation`/`useQuery` non
  è referenzialmente stabile; solo `.mutate`/`.mutateAsync`/`.refetch` lo sono.
- **`FORCE_BOOT_GATE`**: flag diagnostico in `app/_layout.tsx` — verifica che sia
  `false` prima di un OTA di produzione.
- **Self-correcting effect ≠ bug**: un `useEffect` con `if (cond) return` in cima
  e `cond` nelle deps NON è un loop (si auto-interrompe). Non "fixarlo" a vuoto.
- **`.refetch` di React Query è una slice stabile**: dipenderci è già corretto,
  non serve blindarlo con un ref.

## Riferimenti
- `rnav-memo-guard` (SKILL) — pattern e tabella prop.
- `docs/ollama-rnav-loop-lezione.md` — lezione completa + esempi.
- `.agents/memory/`: `context-provider-value-memo.md`, `stack-screen-inline-options.md`,
  `router-in-useEffect-deps.md`, `auth-context-react-query-deps.md`,
  `rnav-screenoptions-nested.md`, `react-query-batching-tabbarlayout-loop.md`.
