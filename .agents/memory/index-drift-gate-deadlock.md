---
name: Index-drift gate deadlock
description: Il gate deploy-build.sh DEVE usare --static-only; interrogare il DB live pre-migration crea un loop dove il gate blocca il deploy che applicherebbe il fix.
---

## La regola

Il gate `check-index-drift` in `scripts/deploy-build.sh` DEVE usare il flag `--static-only`.
Non interrogare mai il DB live (pg_indexes) durante la Phase 2 del deploy-build.sh.

**Why:** deploy-build.sh gira in Phase 2, PRIMA che migrate.ts applichi le nuove migration (Phase 4 — al boot del container). Se si interroga il DB live in Phase 2, si trova lo stato PRE-migration: gli indici potrebbero non avere ancora DESC/WHERE → falso positivo exit 1 → deploy BLOCCATO. Il deploy bloccato non arriva mai al boot → le migration non girano mai → deadlock permanente.

**How to apply:**
- In deploy-build.sh: `npx tsx scripts/check-index-drift.ts --static-only`
  - Fase 1+2 only: schema TS + regressioni migration SQL + inverse drift
  - Exit 0 = OK · Exit 1 = regressione o inverse drift trovato nelle migration (gate duro)
  - NON connette al DB
- In server/boot-sequence.ts: `runIndexDriftCheck()` completo (con DB live) gira in background post-READY, dopo che migrate.ts ha già applicato tutte le migration
- Il gate in CI (workflow `index-drift`) usa il check completo (con DB live) perché ci si connette al dev DB che è sempre aggiornato

## Separazione delle responsabilità

| Dove | Funzione | DB live | Blocca |
|------|----------|---------|--------|
| deploy-build.sh Phase 2 | `--static-only` | NO | Sì se regressione o inverse drift |
| boot-sequence.ts (BG) | `runIndexDriftCheck()` | SÌ | Mai (solo log/alert) |
| workflow `index-drift` | CLI completa | SÌ | N/A (CI check) |

## Causa del loop DROP+CREATE a ogni deploy (inverse drift)

Il loop DROP+CREATE si genera quando **la migration SQL crea un indice con DESC/WHERE
ma lo schema Drizzle TS lo dichiara ASC/senza-clausola**. Replit confronta schema (ASC)
con prod (DESC) e rigenera DROP+CREATE senza mai convergere.

**Fix:** allineare lo schema TS alla migration aggiungendo `.desc()` o `.where(sql...)`.
NON serve una migration correttiva: prod è già corretto (ha DESC), va sistemato solo il registry TS.

**Guardia:** `detectInverseDrift()` in `scripts/check-index-drift.ts` rileva questa direzione
(migration DESC ma schema ASC) e la segnala con exit 1 nel check statico, PRIMA del deploy.
Il check ora copre entrambe le direzioni:
- **Regressione forward**: schema vuole DESC, migration l'ha perso → deploy porta ASC in prod
- **Inverse drift**: migration ha DESC, schema dice ASC → loop DROP+CREATE a ogni deploy
