# DB branching non verificato — 2026-07-27

Il controllo locale di sola lettura dei nomi/URL configurati ha trovato:

- endpoint produzione presente in `PROD_DATABASE_URL` e provider Neon;
- `DATABASE_URL_DEV` assente;
- impossibile dimostrare che sviluppo e produzione usino host/branch diversi.

Non è stato creato, resettato o modificato alcun branch database. Prima di
eseguire migration, `drizzle-kit push` o script di sviluppo occorre configurare
un endpoint dev separato e far passare `npm run check:neon-branch`, mappando:

- `DATABASE_URL` al branch di produzione solo nel runtime protetto;
- `DATABASE_URL_DEV` a un branch Neon di sviluppo distinto.

Finché la guardia non passa, lo stato corretto è
`DB_TOPOLOGY_NOT_VERIFIED`: non usare il database di produzione per test,
migration o seed. L'unica eccezione già autorizzata è lo smoke locale
controllato, che crea un'identità `smoke+...@bikerlink.test`, verifica
login/SSE/logout e ne prova la cancellazione esatta nello stesso run.
