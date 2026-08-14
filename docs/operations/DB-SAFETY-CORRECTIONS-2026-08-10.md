# BikerLink — correzioni di sicurezza release e backup

Data: 2026-08-10
Branch: `codex/release-safety-corrections-20260810`

## Applicato

- Selezione database fail-closed:
  - `development` → `DATABASE_URL_DEV`;
  - `staging` → `DATABASE_URL_CANDIDATE`;
  - `production` → `DATABASE_URL_PRODUCTION`.
- Il fallback su `DATABASE_URL` generica è rimosso dal runtime, da Drizzle e dagli script di verifica.
- Le migration Neon locali selezionano esplicitamente dev e non possono scegliere production per ricaduta.
- Il candidate smoke usa esclusivamente il target staging.
- I backup automatici:
  - partono solo in production;
  - producono dump PostgreSQL custom `.dump`;
  - registrano SHA-256, formato, dimensione, percorso e ambiente;
  - DB e media hanno frequenza predefinita giornaliera.
- Il vecchio backup preview statico è disabilitato: non era un backup reale e poteva mostrare password in chiaro.

## Non applicato intenzionalmente

- Nessuna migration SQL è stata modificata o applicata.
- Nessun database Neon è stato scritto.
- Nessun dato utente, foto o campagna è stato copiato o fuso tra ambienti.
- Il ripristino non viene eseguito: resta una procedura eccezionale su branch temporaneo.

## Gate ancora obbligatori

Prima di operare sui database:

1. verificare la presenza reale dei dump R2 e della copia Google Drive;
2. verificare dimensione, SHA-256 e leggibilità;
3. eseguire eventualmente un restore drill soltanto su branch Neon temporaneo;
4. certificare checksum e stato canonico delle migration 0153–0156;
5. applicare eventuali migration correttive nuove esclusivamente su dev;
6. ricreare candidate da production, senza promuovere dati candidate;
7. test admin e approvazione Andrea prima di production.
