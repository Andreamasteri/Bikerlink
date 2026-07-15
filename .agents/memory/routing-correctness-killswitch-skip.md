---
name: Routing correctness probe vs kill-switch
description: Why the watchdog routing-correctness probe must SKIP (not KO) when routing is admin-disabled, and why it must use a confirmed-disabled read.
---

Le sonde di CORRETTEZZA del routing (`server/ai/watchdog/routing-correctness-probes.ts`,
`runRoutingCorrectnessProbes`) eseguono una vera richiesta GH/Valhalla. Se il routing
è disabilitato via kill-switch, il client rifiuta con "Routing disabilitato via
kill-switch"; se il probe la classifica come KO `critical` trascina l'intera
`/api/health` in **BROKEN** anche se l'admin ha spento il routing di proposito.

**Rule:** quando il routing è disabilitato in modo CONFERMATO dall'admin, GH/Valhalla
vanno segnate `skipped` (severity `info`), come per il ThinkCentre spento. Photon
(geocoding) è indipendente dal kill-switch e continua a sondare.

**Confirmed-disabled, non "disabled per errore":** NON usare `!isRoutingEnabled()`
per decidere il salto. `isRoutingEnabled()`/`readDbSoft` **inghiottono** gli errori
di lettura DB e restituiscono `false` (cache), quindi un blip DB farebbe apparire il
routing come spento → salteresti le sonde e maschereresti un guasto reale. Usa
`isRoutingExplicitlyDisabled()` (lettura DB fresca, `true` solo se `value !== "true"`
con lettura RIUSCITA; propaga l'eccezione) e nel probe fai `.catch(() => false)`:
stato incerto → esegui comunque il probe.

**Why:** durante l'outage #52 lo stato di lungo corso `routing_kill_switch='false'`
(spento dal 2026-06-21) veniva riportato come "correttezza KO — Routing disabilitato
via kill-switch" e forzava BROKEN in dev e prod, confondendo la diagnosi del vero
incidente (token GH + pressione DB).

**How to apply:** ogni nuovo consumer che deve trattare il kill-switch come "stato
voluto" (non guasto) usi `isRoutingExplicitlyDisabled()`, mai `!isRoutingEnabled()`.
La logica downstream (`derivePipelineCorrectness`) tratta già `skipped` come neutro.
