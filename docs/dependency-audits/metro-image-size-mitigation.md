# Metro `image-size` — mitigation runtime

## Stato

Metro 0.84.5 porta `image-size@1.2.1`. Per ridurre l'esposizione alle advisory
`GHSA-w3rx-r6r6-pgpr` e `GHSA-5p2g-fcmc-qvqq`, BikerLink disabilita i decoder
che non usa: **ICNS, HEIF e JXL**.

La mitigation non modifica `package-lock.json`: resta una protezione runtime in
attesa che Metro pubblichi un aggiornamento compatibile della dipendenza.

## Implementazione verificabile

`package.json` esegue sempre, in questo ordine, durante `postinstall`:

1. `scripts/patch-package-safe.cjs`;
2. `scripts/patch-metro-image-size.cjs`.

Il secondo script controlla esplicitamente nome e versione (`image-size@1.2.1`)
prima di modificare `dist/types/index.js` e `dist/detector.js`. Se Metro cambia
albero o versione, deve fallire: non estendere la patch alla cieca.

Il gate CI `Metro image security mitigation test` verifica che le registrazioni
dei decoder rimossi non siano presenti dopo `npm ci`.

## Limite dell'ambiente Codex — 2026-09-09

Nel worktree di revisione `require.resolve('image-size/package.json', { paths:
['node_modules/metro'] })` risolveva al runtime Codex in sola lettura:

`/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/image-size/...`

Di conseguenza `scripts/patch-metro-image-size.cjs` non può scrivere il file e
il test `metro-image-size-mitigation.test.ts` fallisce solo qui. Non è una
regressione del repository né un motivo per rimuovere il gate: nel checkout CI,
`npm ci` deve creare la dipendenza scrivibile nel progetto e applicare la patch.

## Verifica prima di merge o release

Eseguire in un checkout con dipendenze locali scrivibili:

```bash
npm ci
npx vitest run server/__tests__/metro-image-size-mitigation.test.ts
```

Se la versione risolta non è più `1.2.1`, fermarsi, rivalutare le advisory e
aggiornare insieme script, test e questa nota. Non sostituire il controllo con
un'esclusione del test.
