---
name: router-in-useEffect-deps
description: useRouter() in useEffect/useCallback deps array + router.replace/push = loop infinito; fix e gate CI.
---

# router in useEffect/useCallback deps → loop infinito

## Il problema

`useRouter()` di expo-router restituisce un **nuovo oggetto** ad ogni render.

### Pattern 1 — useEffect (sempre pericoloso)

```
router.replace() → re-render → nuovo router → effect ri-scatta → loop
```

Crash: **"Maximum update depth exceeded"** — globale, blocca l'intera app.

```tsx
useEffect(() => {
  if (condizione) {
    router.replace("/destinazione"); // ← pericoloso
  }
}, [router]); // ← router cambia ad ogni render
```

### Pattern 2 — useCallback (pericoloso se il callback è dep di useEffect)

```tsx
const navigate = useCallback(() => {
  router.push("/destinazione"); // ← il callback viene ricreato ogni render
}, [router]);

useEffect(() => {
  navigate(); // ← effect ri-scatta ogni render perché navigate cambia
}, [navigate]); // ← loop identico al pattern 1
```

Il gate cattura i `useCallback` con `router` in deps + `router.replace/push` nel corpo, anche se il callback non è ancora in un `useEffect` — è una guardia preventiva.

## Fix: routerRef + didRedirectRef

```tsx
const routerRef = useRef(router);
routerRef.current = router; // sync senza deps

const didRedirect = useRef(false);

useEffect(() => {
  if (!didRedirect.current && condizione) {
    didRedirect.current = true;
    routerRef.current.replace("/destinazione");
  }
}, [condizione]); // router NON è nel deps
```

Per useCallback:
```tsx
const routerRef = useRef(router);
routerRef.current = router;

const navigate = useCallback(() => {
  routerRef.current.push("/destinazione");
}, []); // router NON è nel deps, usa routerRef.current
```

**Why:** `routerRef.current` è sempre aggiornato senza essere nel deps array.
`didRedirectRef` evita redirect duplicati se il componente re-renderizza.

## Colpisce anche listener-setup

```tsx
// SBAGLIATO — router in deps di un useEffect con listener AppState
useEffect(() => {
  const sub = AppState.addEventListener("change", () => router.push("/x"));
  return () => sub.remove();
}, [router]); // ← ricrea il listener ad ogni render
```

Fix: usare `routerRef.current` nel listener, `router` fuori dai deps.

File colpiti storicamente: `BackgroundNotificationHandler`, `feedback/index`, `moderator/logs`.

## Gate CI

`scripts/check-router-in-effect-deps.sh` — rileva sia `useEffect` che `useCallback` con
`router.replace/push` nel corpo + `router` nel deps array.
Aggiunto a `scripts/post-merge.sh` dopo il gate `rnav-inline-props`.

Il gate usa il hook-opener più vicino (cercando a ritroso fino a 60 righe) per distinguere
`useEffect`/`useCallback` (flaggati) da `useMemo` (ignorato).

## Soppressione (solo se verificato sicuro)

```tsx
// check-router-in-effect-deps: safe
}, [router]);
```

Aggiungere sulla stessa riga del deps chiudente o sulla riga precedente.

Uso tipico per soppressione:
- `useCallback` con `router.push` usato **solo** da press utente / mutation callback (mai come dep di useEffect).
- `useEffect` che SOLO sincronizza `routerRef.current = router` senza chiamare replace/push.

Sempre aggiungere un commento esplicativo dopo la soppressione per spiegare perché è sicuro.
