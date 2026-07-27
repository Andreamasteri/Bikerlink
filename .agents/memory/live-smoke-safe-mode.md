# Live smoke: modalità locale controllata

Per verificare login, sessione, SSE e cleanup contro un database reale non
avviare `server/index.ts`: il boot normale applica migration, seed e scheduler.

Usare `scripts/smoke/live-smoke-server.ts`. Il server:

- richiede `LIVE_SMOKE_ACK=I_UNDERSTAND_SMOKE_WRITES`;
- ascolta soltanto su `127.0.0.1`;
- verifica in sola lettura che le tabelle richieste esistano;
- non esegue migration, seed, scheduler o job in background;
- abilita la registrazione solo per identità
  `smoke+...@bikerlink.test` / `smoke<timestamp>`;
- disattiva email, conversazione di benvenuto e inviti per quell'account;
- usa la tabella session esistente senza crearla.

Lo smoke deve poi essere eseguito con lo stesso `DATABASE_URL`. Il cleanup
verifica l'identità smoke, rimuove sessioni e utente esatti e fallisce il run se
l'utente rimane. La pulizia globale degli orfani è disattivata di default e può
essere abilitata solo esplicitamente con `SMOKE_CLEANUP_ORPHANS=1`.

Evidenza del 2026-07-27: sul branch `fix/audit-typecheck-2026-07-27`, commit
`4cb67160387fef4e3705e3496fb81b9edb61d31b`, il run live ha riportato
`login=PASS`, `sse=PASS`, `cleanup=PASS`, `migrations=false` e
`schedulers=false`.
