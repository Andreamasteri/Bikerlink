---
name: AI routing engine selector
description: Design constraints del livello AI sopra il selettore engine routing (maps_routing_engine="ai")
---

# AI Routing Engine Selector

Livello AI opzionale sopra il selettore engine: con `maps_routing_engine="ai"` un
modello cloud sceglie l'engine per ogni richiesta. confidence>=0.6 → engine
diretto; <0.6 → dual-compare + quality score; timeout 800ms → fallback selettore
normale.

## Dual-compare DEVE usare engine grezzi
Nel ramo confidence-bassa il confronto chiama `graphHopperRoute` e
`valhallaCalculateRoute` GREZZI — **mai** `routeViaValhallaWithFallback`.
**Why:** il wrapper con fallback cross-engine può restituire un risultato
GraphHopper sotto l'etichetta "valhalla", rendendo i due candidati identici,
falsando lo score e attribuendo a Valhalla un success/latenza che non ha mai
prodotto (inquina engineHealth e recentLatencyMs che rialimentano l'AI).
**How to apply:** se un engine grezzo fallisce viene escluso da
Promise.allSettled; recordRoutingSuccess deve usare solo l'engine che ha
realmente prodotto la route.

## "ai" non è un engine reale
`"ai"` è in RoutingEngineId/ROUTING_OPTIONS ma NON in supportedEngines, quindi
`resolveRoutingEngine()` resta sul safe default "graphhopper"; `isAiRoutingMode()`
legge il raw value di maps_routing_engine. Blast radius sicuro: nessun
Record<RoutingEngineId> esaustivo va aggiornato.

## Decisioni AI: ring buffer in-memory
ai-decision-log è un ring buffer (max 100), niente tabella DB — coerente con
routing-metrics. Card admin AiDecisionsCard fa refetch 15s su
/api/admin/maps/ai-decisions.
