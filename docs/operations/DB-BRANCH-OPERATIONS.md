# BikerLink — Operazioni DB Branching

## Ruoli

| Ambiente | Branch Neon | Dati | Regole |
|---|---|---|---|
| Produzione | branch principale protetto | reali | Nessun reset, clone o seed; modifiche solo tramite migration revisionate |
| Dev | child branch sacrificabile | sintetici o mascherati | Può essere ricreato dal parent solo dopo approvazione operativa |
| Feature/PR | child temporaneo di dev | sintetici o mascherati | Creato per test isolati; TTL e cancellazione al termine della PR |

La topologia viene verificata senza aprire connessioni con `npm run check:neon-branch`. Il guard richiede `DATABASE_URL_DEV` e una URL di produzione esplicita (`DATABASE_URL_PROD` o `PROD_DATABASE_URL`; `DATABASE_URL` solo nel runtime hosted).

## Percorso di rilascio

1. Le migration SQL numerate entrano nel branch candidato.
2. Il candidato viene provato su un branch DB isolato con backend reale, login, SSE e cleanup.
3. La stessa revisione viene approvata e pubblicata sul backend production; al boot il runner verifica `schema_migrations` del database effettivamente raggiunto.
4. Un OTA è separato dal deploy backend: può uscire solo dopo che backend e schema sono compatibili con la runtimeVersion della build nativa.
5. Le migration seguono expand → migrate/backfill → contract; non rimuovere colonne/tabelle nella stessa release che introduce il nuovo uso.

## Controlli e osservabilità

- `schema_migrations` è la fonte di verità; la cache locale dei file non può bypassare il controllo DB.
- `session` è una migration versionata, non un bootstrap inserito nei test.
- Il controllo index drift gira post-READY e degrada/avvisa senza crash-loop.
- Gli smoke live verificano login, SSE e cleanup senza eseguire scheduler o seed.
- Errori DB, SSE, pool e migration devono essere raccolti dai log di boot e dalla telemetria; una failure blocca il promotion, non prova a riparare produzione.

## Restore drill

Il restore si prova su un nuovo branch temporaneo, mai su produzione. La prova è conclusa solo quando si documentano: punto nel tempo scelto, branch creato, migrazioni lette, login/smoke, e cancellazione del branch di test. Nessun restore/reset viene eseguito automaticamente.
