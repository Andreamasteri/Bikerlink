---
name: Routing per-function engine config
description: Come è persistita e risolta la scelta engine-per-funzione di routing, e perché si salvano solo gli override espliciti.
---

# Config engine per-funzione di routing

La scelta di quale engine (graphhopper/valhalla/tomtom/mapbox-directions) serve
ogni funzione di routing (`routing`, `map_matching`, `isochrone`, `matrix`) vive
nella AppSetting `routing_function_engines` (valueJson). Registro condiviso delle
funzioni + engine ammessi: `shared/routing-functions.ts`. Lettura/scrittura:
`server/routing/function-engine-config.ts`.

## Regola: persistere SOLO gli override espliciti, mai i default
Su DB si salvano esclusivamente le funzioni che l'admin ha scelto
esplicitamente. Non materializzare mai i default nel valueJson.

**Why:** la funzione `routing` ha un predecessore globale (`maps_routing_engine`).
Se `setFunctionEngineConfig` parte dai default normalizzati e poi salva l'intera
mappa, modificare una qualsiasi altra funzione (es. `map_matching`) cementa
`routing: graphhopper` nel DB e scavalca silenziosamente il vecchio
`maps_routing_engine` → regressione del motore di calcolo percorso sui deployment
esistenti.

**How to apply:** il merge in `setFunctionEngineConfig` parte dagli override
grezzi già su DB (`getStoredOverrides`, niente default), aggiunge solo le chiavi
del payload e ripersiste solo quelle. La config "effettiva" (`getFunctionEngineConfig`)
ricostruisce a runtime: override → (per `routing`) fallback a `maps_routing_engine`
→ default. GET admin e route planner usano entrambi la config effettiva, così
pannello e comportamento reale non divergono mai.
