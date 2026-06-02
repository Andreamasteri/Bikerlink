---
name: Paginated API vs Array useMemo crash
description: /api/proposals (e simili) restituisce risposta paginata invece di array puro; i useMemo che chiamano .filter() sull'oggetto truthy crashano con "undefined is not a function"
---

## Il problema

`/api/proposals` (CRUD route) restituisce sempre `{ data: [], total, page, limit }`.
React Query lo espone come `myProposalsQuery.data = { data: [], total: 0, ... }`.

Nei `useMemo` di `useHomeMapState.ts` il codice originale faceva:
```js
const arr = ((mapData.myProposalsQuery.data as ProposalItem[]) || []).filter(...)
```
Poiché l'oggetto è truthy, `|| []` non scatta → `arr` è l'oggetto → `arr.filter` è `undefined` → `undefined(...)` → `TypeError: undefined is not a function` → crash ErrorBoundary sulla home/mappa.

**Why:** Il type cast `as ProposalItem[]` non fa nulla a runtime; il `|| []` fallback funziona solo con `null`/`undefined`, non con oggetti truthy.

## Fix applicato

1. **`hooks/useMapData.ts`** — `myProposalsQuery`: aggiunto `select`:
```js
select: (d: any) => Array.isArray(d) ? d : (Array.isArray(d?.data) ? d.data : []),
```

2. **`hooks/home/useHomeMapState.ts`** — tutti i memo che usano dati da query:
```js
// mySearchRadius
const proposals = Array.isArray(mapData.myProposalsQuery.data) ? ... : [];
// nearbyUsers
Array.isArray(mapData.nearbyUsersQuery.data) ? mapData.nearbyUsersQuery.data : []
// myAds
Array.isArray(mapData.myAdsQuery.data) ? mapData.myAdsQuery.data : []
```

**How to apply:** Ogni volta che si aggiunge un `useQuery` che può restituire una risposta paginata, aggiungere `select` per estrarre l'array. In ogni `useMemo` che chiama metodi array su dati di query, usare sempre `Array.isArray` invece di `|| []`.
