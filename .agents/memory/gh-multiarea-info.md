---
name: GH multi-area /info path
description: Nel setup multi-area GraphHopper sul TC, /info alla root non esiste — serve chiamare /areas/<codice>/info per ogni istanza.
---

## Regola

`fetchSelfHostedProfiles()` NON deve chiamare `${GH_BASE_URL}/info` (root inesistente).
Deve iterare `ROUTING_AREAS` e provare `${GH_BASE_URL}${area.path}/info` finché una risponde con profili validi.

**Why:** nginx sul TC mappa ogni path `/areas/<codice>/*` a un upstream GH separato.
La root `/` non ha un backend GH in ascolto → `ok: false` o HTML nginx → `parse error` nel log del motorcycle check.

**How to apply:** Qualsiasi chiamata a `/info` sull'host GH self-hosted deve usare un path area specifico.
Import `ROUTING_AREAS` da `@shared/routing-areas` e iterare in sequenza.

## Probe ThinkCentre: 401 ≠ servizio su

Sondando `/areas/<codice>/info` SENZA auth si ottiene `401` dal gate nginx, che risponde
PRIMA di toccare l'upstream. Quindi `401` prova solo che nginx + il layer auth sono vivi,
NON che il container GH sia acceso. Per vedere lo stato reale dell'upstream passare
`Authorization: Bearer $GRAPHHOPPER_TOKEN`: `502` = container spento/giù, `200` = su.
Valhalla (`$VALHALLA_URL/status`) non ha gate auth → `502` diretto = Valhalla giù.

**Why:** durante una diagnosi i 7 GH risultavano "401 → vivi", ma con token erano tutti
`502` (spenti apposta per risparmiare RAM); Valhalla era `502` (giù) pur dovendo girare.

**How to apply:** SSH al TC non è raggiungibile dalla sandbox Replit (host LAN/Tailscale,
`gaierror`); diagnosticare via HTTP pubblico con auth, oppure via l'agent/metriche.
