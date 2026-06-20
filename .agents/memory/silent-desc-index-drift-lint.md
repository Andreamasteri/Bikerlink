---
name: Silent DESC/WHERE index drift lint
description: Perché esiste il Check B in lint-migration-indexes.ts e dove gira il gate
---

# Drift indici DESC/WHERE silenzioso — lint preventivo

## La regola
Ogni indice "speciale" (DESC o clausola WHERE) in una migration DEVE usare il
pattern idempotente:
```sql
DROP INDEX IF EXISTS "n";
CREATE INDEX IF NOT EXISTS "n" ON t (col DESC) [WHERE ...];
```
`CREATE INDEX IF NOT EXISTS` DESC/WHERE **senza** DROP precedente è vietato.

**Why:** se l'indice piano omonimo già esiste (anche generato dall'auto-push del
diff schema Replit in prod), `IF NOT EXISTS` salta la CREATE e DESC/WHERE non si
applicano MAI → "🔴 Index Drift rilevato" ad ogni boot, permanente. L'SQL sembra
corretto, quindi `check-index-drift.ts` (confronta SQL vs schema TS) e il vecchio
Check A (DROP senza ricreazione) non lo coglievano.

## Dove è applicato
- `scripts/lint-migration-indexes.ts`:
  - Check A = DROP indice speciale senza ricreazione corretta.
  - Check B = CREATE IF NOT EXISTS DESC/WHERE senza DROP precedente (questo caso).
  - Due baseline grandfathered (NON aggiungere voci nuove):
    `KNOWN_SPECIAL_CREATE_WITHOUT_DROP` (12 voci) e `KNOWN_DROP_RECREATE_REGRESSION`
    (0060 ota_assistant_runs_started_at_idx, già riconciliato da 0103/0104/0112).
- `scripts/pre-commit`: lint sui soli file migration in staging (entrambi i check).
- `scripts/deploy-build.sh`: gate `--all` su TUTTE le migration, dopo il gate
  index-drift. Legge solo schema TS + .sql, niente DB → safe in FASE 2 (vedi
  index-drift-gate-deadlock.md).

**How to apply:** il gate CI naturale sarebbe il workflow `db-migration-checks`, ma
`.replit` è read-only e `configureWorkflow` è bloccato dal limite di 10 workflow
(già a 11). Per aggiungere/spostare il gate, agire su deploy-build.sh o pre-commit,
non sul workflow.
