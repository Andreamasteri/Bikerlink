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
  - Fase 1+2 only: schema TS + regressioni migration SQL
  - Exit 0 = OK · Exit 1 = regressione trovata nelle migration (gate duro)
  - NON connette al DB
- In server/boot-sequence.ts (Task #4052): `runIndexDriftCheck()` completo (con DB live) gira in background post-READY, dopo che migrate.ts ha già applicato tutte le migration
- Il gate in CI (workflow `index-drift`) usa il check completo (con DB live) perché ci si connette al dev DB che è sempre aggiornato

## Separazione delle responsabilità

| Dove | Funzione | DB live | Blocca |
|------|----------|---------|--------|
| deploy-build.sh Phase 2 | `--static-only` | NO | Sì se regressione migration |
| boot-sequence.ts (BG) | `runIndexDriftCheck()` | SÌ | Mai (solo log/alert) |
| workflow `index-drift` | CLI completa | SÌ | N/A (CI check) |
