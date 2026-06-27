---
name: React Query mutation objects in hook deps
description: How to keep useCallback/useMemo deps stable when a handler uses a React Query mutation, without churning renderItem per tick
---

# React Query mutation/query objects in useCallback/useMemo deps

In a FlatList screen that refetches on a tick, putting the WHOLE React Query
mutation (or query) object into a `useCallback`/`useMemo` dependency array makes
the handler — and any `renderItem` that closes over it — regenerate on every
state transition (idle→pending→success) and often every render. That causes
avoidable re-renders and per-row recreation. This is a perf issue, NOT the cause
of "Maximum update depth exceeded".

## The trap with the `.mutate` slice
`mutation.mutate` IS referentially stable in react-query v5, so depend.ing on
`[mutation.mutate]` is correct at runtime. BUT `react-hooks/exhaustive-deps`
does not understand method stability: it flags `.mutate` and demands the whole
`mutation` object back. So the "slice" fix trades churn for lint warnings.

## The fix that satisfies both
Hold the mutation in a ref and call through it:
```ts
const mRef = useRef(theMutation);
mRef.current = theMutation;            // refresh each render
const handler = useCallback(() => mRef.current.mutate(arg), [/* real slices */]);
```
exhaustive-deps EXEMPTS refs, so deps stay clean AND stable. For a renderItem
that needs many mutations/handlers/setters, stuff the whole props object into one
ref (`mRef.current = props`) and keep deps to the output-affecting primitives.

**Why:** keeps lint green (warnings are not errors here, but noise hides real
ones) while actually stabilizing the callback. **How to apply:** any FlatList /
hot-path callback that uses a mutation; extract module-level `keyExtractor` too.
