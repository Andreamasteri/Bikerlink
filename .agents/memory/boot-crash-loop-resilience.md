---
name: Boot crash-loop resilience
description: Perché un DB managed lento mandava il server in crash-loop al boot e i principi per evitarlo (seed non-fatali, niente promise eager, backoff su TUTTI gli exit fatali).
---

# Resilienza avvio — evitare il crash-loop al boot

## Sintomo
DB managed Replit lento/che droppa una connessione al boot → il server crashava
e si riavviava ravvicinato all'infinito. Due firme fatali: `unhandledRejection`
dal seed dei tag e `uncaughtException: Connection terminated unexpectedly` da pg.

## Principi durevoli (non ovvi)

1. **Mai awaitare in sequenza un array di promise GIÀ avviate.** Costruire
   `[seedA(), seedB()]` le lancia tutte subito; il `try/catch` del loop copre solo
   quella che sta awaitando in quel momento — un reject precoce di un'altra sfugge
   e diventa `unhandledRejection` fatale. **Usare thunk** `() => Promise`, invocati
   dentro il loop. Vale per qualunque fan-out di task al boot.

2. **I seed/init al boot devono degradare, non propagare.** Un guasto DB transitorio
   non deve fermare il boot: catch totale all'entry-point + `withDbRetry` sulle
   query; il retry differito va in `setTimeout(...).unref()` con try/catch interno
   (un setTimeout senza catch ricrea l'unhandledRejection).

3. **Il backoff anti crash-loop va su TUTTI i percorsi di exit fatale**, non solo
   sugli handler di processo: anche migration/drift/Phase-N e il catch del boot.
   Altrimenti un errore ripetuto in uno di quei punti bypassa il backoff e fa
   raffica di restart. Contatore crash condiviso su `/tmp`, delay crescente con cap.
   Il blocking sleep deve essere **sincrono** (`Atomics.wait`): in stato di
   `uncaughtException` l'event loop è degradato e un `setTimeout` può non scattare.

**Why:** il Postgres managed Replit ha blip non risolvibili lato nostro; il boot
deve assorbirli, non amplificarli in un loop che brucia risorse e nasconde la causa.

## Note
- `pool.on("error")` in `server/db.ts` già assorbe i drop di connessione idle.
- Modulo backoff: `server/lib/crash-backoff.ts` (`applyCrashBackoff` è il punto
  unico record+sleep prima di `process.exit`; `resetCrashBackoff()` a boot completo).
