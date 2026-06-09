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
