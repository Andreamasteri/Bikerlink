---
name: Publish copia dev DB → prod DB
description: Il flusso di publish BikerLink è configurato per copiare il DB di sviluppo sopra il DB di produzione a ogni deploy — sovrascrive i dati prod reali e innesca il diff schema PostGIS.
---

## Fatto osservato (dai build log di publish, 31 maggio 2026)
I build log di un deploy contengono:
```
Preparing development database
Copying development database to production database
Successfully copied development database to production database
```
Questo è l'opzione Replit "Set up with development data" / impostazione DB del deploy ATTIVA.

## Implicazioni (durature, importanti)
1. **Ogni publish SOVRASCRIVE i dati di produzione con quelli di sviluppo.** Quasi certamente la causa della perdita degli utenti reali in prod (es. il task — poi annullato — di "restore 21 real users"). Finché l'opzione resta attiva, ogni nuovo publish ricancella i dati prod reali.
2. **Innesca il diff schema dev↔prod** che emette `ALTER TABLE spatial_ref_sys ADD PRIMARY KEY` → 42501 per mismatch owner Helium(dev)/Neon(prod). È IL meccanismo che fa apparire l'errore PostGIS al publish (vedi support-ticket-spatial-ref-sys.md), NON drizzle (drizzle-kit è rimosso, nessun drizzle.config.ts).

## Cosa fare
- È un'impostazione della UI di publish (lato utente, non codice): disattivare la copia "development data → production" nelle impostazioni Database del deploy.
- Lo schema in prod viene comunque costruito da `server/migrate.ts` al boot. NON serve copiare il DB dev.
- Disattivandola: niente sovrascrittura dati prod + niente diff schema → niente errore spatial_ref_sys al publish.
