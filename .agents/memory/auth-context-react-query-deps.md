---
name: auth-context React Query deps in value memo
description: Come esporre query/mutation React Query nel value di un Context senza causare loop né stato stantio
---

# React Query objects nelle deps del Context value memo

Gli oggetti restituiti da React Query (`useQuery` result, `useMutation` result) sono
**ricreati a ogni render**. Metterli interi nelle deps di un `useMemo`/`useCallback`
invalida il memo a ogni render → cascata di re-render → loop "Maximum update depth exceeded"
(schermata nera al boot Android).

## La regola

Quando esponi un risultato React Query dentro il `value` di un Context:

- **NON** mettere l'oggetto intero nelle deps (es. `[userQuery]`, `[loginMutation]`).
- Dipendi dalle **slice primitive** che i consumer leggono davvero:
  - per le query: `userQuery.data`, `userQuery.isLoading`
  - per le mutation: `loginMutation.isPending` (e `.isError`/`.error` solo se consumati)
  - per i metodi stabili (`refetch`, `mutate`, `mutateAsync`): dipendi da `userQuery.refetch`, non da `userQuery`.

**Why:** togliere del tutto la mutation dalle deps (tentativo iniziale) ferma il loop ma
rende `isPending` **stantio** ai consumer (es. lo spinner del pulsante login/registrazione
non si aggiorna). Le slice primitive sono il compromesso: stabili tra i render, ma
ricalcolano il memo quando lo stato cambia davvero. Catturato dall'architect, non dal typecheck.

**How to apply:** vale per `lib/auth-context.tsx` (e ogni provider che inoltra risultati
React Query). Serve `// eslint-disable-next-line react-hooks/exhaustive-deps` perché dentro
il memo usi l'oggetto intero ma elenchi solo le sue slice — è intenzionale.
Per chi consuma solo `.mutate`/`.mutateAsync` (es. logout) la slice serve solo se in futuro
si legge anche `.isPending`.

Collegato: `auto-telemetry-context.tsx` usava `useEffect([user])` (oggetto user instabile
dalla revalidation) → fix con `const userId = user?.id ?? null` e dep `[userId]`.

## Stabilizzare la reference dell'oggetto user (non solo i deps)

Rimuovere `userQuery.data` dai deps del value memo NON basta quando decine di
consumer fanno `const { user } = useAuth()` e hanno effetti `useEffect([user])`.
React Query restituisce un **nuovo oggetto** a ogni `refetch()` (es. la
revalidation una-tantum della sessione idratata) anche con payload identico → tutti
i `[user]` deps si ri-scatenano → con ~13 effetti + 15 tab screen (React Navigation
`useSyncExternalStore`) si supera il limite di 25 update annidati → crash boot Android.

**La regola:** stabilizza la reference di `user` nel provider con una shallow-equal:
mantieni la stessa reference finché il contenuto è uguale, adottane una nuova solo
su variazioni reali.

```ts
const stableUserRef = useRef(userQuery.data);
if (!shallowEqualSafeUser(userQuery.data, stableUserRef.current)) {
  stableUserRef.current = userQuery.data; // mutazione in render: idempotente, sicura
}
const user = stableUserRef.current;
```

**Why:** `SafeUser` è una riga DB piatta (`Omit<User,"password">`) → shallow su tutte
le chiavi distingue cambi reali ma assorbe i refetch identici, preservando la
freschezza. La mutazione del ref in render è il pattern di caching documentato da
React (scrive solo quando il valore differisce → render idempotente). `shallowEqual`
gestisce null vs undefined con `a==null → return a===b`. Così TUTTI i `[user]` deps
diventano stabili **senza toccarli** e senza problemi eslint. Esporre anche `userId`
primitivo aiuta i nuovi consumer.

**How to apply:** `lib/auth-context.tsx`. Follow-up opzionale suggerito dall'architect:
usare `structuralSharing`/`select` di React Query al posto della mutazione-in-render.
