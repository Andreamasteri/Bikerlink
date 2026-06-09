---
name: package-lock.json — URL Replit proxy bloccano EAS build
description: npm ci su EAS crasha con "Exit handler never called!" se il lockfile ha URL package-firewall.replit.local invece di registry.npmjs.org
---

# package-lock.json — URL Replit proxy bloccano EAS build

## La regola
Dopo OGNI `npm install` in Replit, verificare e correggere le URL nel lockfile prima di lanciare una EAS build.

**Why:** Replit installa pacchetti tramite il suo proxy interno `http://package-firewall.replit.local/npm/`. Le URL `resolved` nel `package-lock.json` finiscono con questo host. EAS (e qualsiasi ambiente esterno) non può raggiungere quell'host → `npm ci` crasha con "Exit handler never called!" senza altri dettagli.

## How to apply
Dopo ogni `npm install` (aggiornamento pacchetti), PRIMA di lanciare EAS build, eseguire:

```bash
# Controlla quante entry usano il proxy Replit
node -e "
const lock = require('./package-lock.json');
const pkgs = lock.packages || {};
let replit = 0;
Object.values(pkgs).forEach(p => {
  if(p.resolved && p.resolved.includes('package-firewall.replit.local')) replit++;
});
console.log('replit proxy entries:', replit);
"

# Fix: sostituisce tutte le URL Replit con registry.npmjs.org
sed -i 's|http://package-firewall\.replit\.local/npm/|https://registry.npmjs.org/|g' package-lock.json
```

## Sintomi da riconoscere
- EAS build fallisce con `npm ci --include=dev exited with non-zero code: 1`
- Messaggio: `npm error Exit handler never called!`
- Appare dopo 2-3 `npm warn deprecated` innocui
- `NODE_OPTIONS=--max_old_space_size=8192` non risolve (non è OOM heap)
- L'errore è riproducibile al 100% (non flaky)
