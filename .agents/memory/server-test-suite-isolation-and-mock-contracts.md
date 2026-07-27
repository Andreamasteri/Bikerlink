# Server test suite: isolation and mock contracts

## Regola

La suite unit server non deve mai ereditare un database reale dalla macchina
che la esegue. I setup Vitest eliminano `DATABASE_URL_DEV` e impostano
`DATABASE_URL` su un endpoint locale non raggiungibile: ogni query non mockata
fallisce localmente e non può toccare ambienti condivisi.

## Contratti da mantenere

- Quando un modulo aggiunge un export usato a import-time o runtime
  (`getOllamaModelId`, tool AI, costanti bucket, tracking del job registry),
  aggiornare tutti i mock completi dello stesso modulo.
- I test dell'inventario sorgente devono mockare `git ls-files` tramite
  `node:child_process.spawnSync`; il vecchio walker `fs.readdir` non è più la
  fonte dell'elenco.
- I test delle catene AI devono mockare esplicitamente
  `getEffectiveRouteChain`, così chiavi o impostazioni presenti nella macchina
  non cambiano il provider atteso.
- I confronti del giorno delle proposte sono UTC; non usare getter Date locali,
  perché il risultato cambierebbe tra CI e processi in `Europe/Rome`.
- I file `*.next.test.ts` devono contenere almeno una suite valida oppure essere
  rinominati fuori dal pattern Vitest; un commento soltanto fa fallire la suite.

## Verifica eseguita

`vitest` server completo: 802 suite e 2.258 test verdi, zero errori.
Il typecheck server conserva un solo errore baseline indipendente sul vecchio
import PDF, corretto nella tranche dedicata al PDF.
