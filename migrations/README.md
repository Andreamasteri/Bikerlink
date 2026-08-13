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

## Come creare una migration (consigliato)

Usa lo **scaffolder**: calcola da solo il prossimo numero libero e crea il file,
quindi una collisione di prefisso è **impossibile per costruzione**.

```bash
npx tsx scripts/new-migration.ts <descrizione_snake_case>
# es. npx tsx scripts/new-migration.ts add_sos_events  →  0078_add_sos_events.sql
```

Lo script:

- calcola il prossimo numero (max esistente + 1, zero-padded);
- rifiuta di procedere se la cartella contiene **già** un prefisso duplicato;
- crea il file con un header template idempotente.

Senza argomenti stampa solo il prossimo numero libero (dry-run, non crea nulla):

```bash
npx tsx scripts/new-migration.ts
```

## Come scegliere il numero (manuale)

Se crei il file a mano invece di usare lo scaffolder:

1. Trova l'ultimo numero in uso:
   ```bash
   ls migrations/*.sql | sort | tail -5
   ```
2. Usa il successivo disponibile. Se l'ultimo è `0077`, il prossimo è `0078`.
3. Verifica subito di non aver introdotto un duplicato:
   ```bash
   npx tsx server/scripts/check-migration-prefix-duplicates.ts
   ```

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

## Gruppo 0157 storico di candidate

I due file seguenti condividono il prefisso per una collisione storica. Sono
applicati in candidate e tracciati nella tabella `schema_migrations` per filename
completo; production non li ha ancora applicati. **Non vanno rinominati**: farlo
altererebbe l'identità della migration.

Sono allow-listati in `KNOWN_DUPLICATE_FILE_SETS`
(`server/migration-prefix-guard.ts`) solo quando il gruppo è completo e immutato; producono solo un warning al boot.

| Prefisso | File                                      |
|----------|-------------------------------------------|
| `0157`   | `0157_fixed_couples.sql`                 |
| `0157`   | `0157_watchdog_log_event_key.sql`        |

---

## Aggiungere un nuovo duplicato all'allowlist (caso estremo)

Se un file è già applicato in prod **e non può essere rinominato**, aggiungilo
a `KNOWN_DUPLICATE_FILE_SETS` in `server/migration-prefix-guard.ts` con un
commento che spieghi il motivo. Non abusare dell'allowlist: la regola è
**un numero = un file**.
