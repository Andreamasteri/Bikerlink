---
name: router-in-useEffect-deps
description: useRouter() in useEffect deps array + router.replace/push = loop infinito; fix e gate CI.
---

# router in useEffect deps → loop infinito

## Il problema

`useRouter()` di expo-router restituisce un **nuovo oggetto** ad ogni render.
Se messo nei deps di un `useEffect` che chiama `router.replace/push`, si crea un ciclo:

```
router.replace() → re-render → nuovo router → effect ri-scatta → loop
```

Crash: **"Maximum update depth exceeded"** — globale, blocca l'intera app.

## Pattern pericoloso

```tsx
useEffect(() => {
  if (condizione) {
    router.replace("/destinazione"); // ← pericoloso
  }
}, [router]); // ← router cambia ad ogni render
```

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

`scripts/check-router-in-effect-deps.sh` — rileva `useEffect` + `router.replace/push` nel corpo + `router` nel deps array.
Aggiunto a `scripts/post-merge.sh` dopo il gate `rnav-inline-props`.

Distingue `useEffect` da `useCallback`/`useMemo` cercando il hook-opener più vicino nelle N righe precedenti alla riga deps.

## Soppressione (solo se verificato sicuro)

```tsx
// check-router-in-effect-deps: safe
}, [router]);
```

Aggiungere sulla stessa riga del deps chiudente o sulla riga precedente.
Uso tipico: `useEffect` che SOLO sincronizza `routerRef.current = router` senza chiamare replace/push.
