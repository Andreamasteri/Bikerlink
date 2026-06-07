# Regole di Naming delle Migration

## Formato obbligatorio

```
NNNN_descrizione_breve.sql
```

- **NNNN** — numero a 4 cifre (zero-padded), **unico per file**. Due file NON possono condividere lo stesso numero.
- **descrizione_breve** — snake_case, descrive sinteticamente la modifica.

### Esempi corretti

```
0075_telemetry_affinity_matching.sql
0076_motoclub_invite_codes.sql
0077_add_sos_events.sql
```

### Esempi errati

```
0076_motoclub_invite_codes.sql   ← DUPLICATO: 0076 è già usato
0076_add_sos_events.sql          ← stessa storia
```

---

## Come scegliere il numero

1. Trova l'ultimo numero in uso:
   ```bash
   ls migrations/*.sql | sort | tail -5
   ```
2. Usa il successivo disponibile. Se l'ultimo è `0077`, il prossimo è `0078`.

---

## Guardia automatica

Il runner `server/migrate.ts` chiama `assertNoDuplicateMigrationPrefixes` ad
ogni avvio: se rileva un prefisso duplicato **non in baseline** lancia un errore
e blocca il boot.

Il workflow di validazione **migration-prefix-check** esegue lo stesso controllo
senza richiedere una connessione al DB:

```bash
npx tsx server/scripts/check-migration-prefix-duplicates.ts
```

---

## Duplicati storici (già applicati in prod)

I file seguenti condividono un prefisso perché furono creati prima che la
guardia fosse attiva. Sono già applicati in produzione e tracciati nella tabella
`schema_migrations` per filename completo: **non vanno rinominati** (farlo li
farebbe re-applicare o lascerebbe orfana la riga di tracking).

Sono allow-listati in `KNOWN_DUPLICATE_PREFIXES`
(`server/migration-prefix-guard.ts`) e producono solo un warning al boot.

| Prefisso | File                                       |
|----------|--------------------------------------------|
| `0067`   | `0067_ai_call_logs_and_memory.sql`         |
| `0067`   | `0067_db_integrity_cascade_orphan_fix.sql` |
| `0067`   | `0067_gist_index_user_profiles_geom.sql`   |
| `0072`   | `0072_ride_telemetry_indexes.sql`          |
| `0072`   | `0072_users_marketing_consent.sql`         |

---

## Aggiungere un nuovo duplicato all'allowlist (caso estremo)

Se un file è già applicato in prod **e non può essere rinominato**, aggiungilo
a `KNOWN_DUPLICATE_PREFIXES` in `server/migration-prefix-guard.ts` con un
commento che spieghi il motivo. Non abusare dell'allowlist: la regola è
**un numero = un file**.
