---
name: Routing kill-switch (solo DB toggle)
description: How the routing on/off state is resolved — DB-only soft toggle, env ROUTING_DISABLED logic removed.
---

Routing enablement è ora controllato **esclusivamente** dal toggle DB in `server/routing/routing-kill-switch.ts`:
- `app_settings.routing_kill_switch = "true"` → routing abilitato
- valore non impostato o diverso → routing disabilitato (default)
- Le costanti `HARD_OFF`, `HARD_ON`, `HAS_HARD_ENV_OVERRIDE` e tutta la logica
  `ROUTING_DISABLED` env var sono state **rimosse** dal codice.

**Why:** La logica env override causava confusione (valore "0"=ON invertito), creava
un 409 inutile nel toggle admin, e mostrava banner fuorvianti nell'UI. In produzione
`ROUTING_DISABLED` non era mai impostata — la rimozione non cambia il comportamento
attuale, semplifica il codice e porta il controllo sotto un unico punto (DB).

**How to apply:** Chiamare sempre `isRoutingEnabled()` (async) o
`isRoutingEnabledSync()` (cache, assume disabled se mai letto) per verificare lo
stato routing. Il toggle admin (`PUT /api/admin/routing/kill-switch`) non ha più
guard 409 da env. Non reintrodurre variabili d'ambiente per abilitare/disabilitare
il routing — usare esclusivamente il toggle DB via pannello admin.

**Per riattivare il routing:** Admin → Hub Routing → kill-switch ON
(quando ThinkCentre torna online con Valhalla funzionante).
