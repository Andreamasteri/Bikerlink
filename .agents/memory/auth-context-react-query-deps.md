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
