# server/__tests__/helpers — Convenzioni

## `route-fixtures.ts` è la sorgente autorevole unica per le broken fixture

Tutte le stringhe e gli oggetti "broken fixture" (marcatori di payload non validi
usati nei test di parsing/streaming AI) devono essere definiti ed **esportati
esclusivamente** da `route-fixtures.ts`.

### Perché

- `route-fixtures.ts` importa `routeSchema` e usa `z.infer<typeof routeSchema>`
  per il fixture valido (`VALID_ROUTE`). Qualunque aggiornamento allo schema
  produce un errore TypeScript in un unico punto, rendendo il drift visibile.
- Le fixture "invalid" sono annotate con il campo/vincolo che violano, così il
  significato rimane chiaro anche dopo refactoring.
- Definire broken fixture in altri file crea sorgenti alternative che restano
  silenziosamente in drift quando `routeSchema` cambia.

### Cosa NON fare

```ts
// ❌ Non creare un altro file helper che esporta broken strings
// server/__tests__/helpers/my-helpers.ts
export const MY_BROKEN = '{"title":"FOO_BROKEN"}'; // vietato dal gate CI
```

### Cosa fare

```ts
// ✅ Aggiungere la fixture a route-fixtures.ts ed esportarla da lì
export const ROUTE_JSON_MY_CASE = '{"title":"FOO_BROKEN"}';

// ✅ Nei test, importare da route-fixtures
import { ROUTE_JSON_MY_CASE } from './helpers/route-fixtures';
```

### Gate CI

`scripts/check-inline-broken-fixtures.sh` (chiamato da `scripts/post-merge.sh`)
blocca:

1. **Stringhe broken inline** nei file di test (qualunque `.ts` sotto
   `server/__tests__/`, escluso `route-fixtures.ts`).
2. **Export di broken strings da altri file helper** — qualunque file in
   `server/__tests__/helpers/` diverso da `route-fixtures.ts` che esporti
   pattern broken viene rifiutato.

Per sopprimere un'occorrenza intenzionale, aggiungere sulla riga precedente:

```ts
// check-inline-broken-fixtures: safe — <motivazione>
export const MY_EXCEPTION = '...BROKEN"';
```

## Altri file helper

I file helper che non definiscono broken fixture (mock, factory, builder di
request, utility di asserzione, ecc.) possono essere aggiunti liberamente.
Rispettare la convenzione di un'esportazione per concetto e documentare
l'intento con un commento JSDoc in cima al file.
