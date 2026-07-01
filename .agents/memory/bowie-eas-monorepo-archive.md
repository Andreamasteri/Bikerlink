---
name: Bowie/nested-Expo EAS archive pollution — root cause e fix reale
description: perché una build EAS per un'app Expo nested (senza .git propria) può sembrare bloccarsi per sempre su "Compressing project files", e il fix reale (non solo EAS_NO_VCS).
---

`bowie-terminal/` non ha una propria `.git` — condivide quella della root. EAS CLI, con la strategia di archiviazione basata su Git (default), risale fino alla root del repo Git e include TUTTI i file tracciati dell'intero monorepo (main app compresa: asset, migration, doc, node_modules potenzialmente), non solo il sottoprogetto. Confermato empiricamente: `git ls-files | grep -v '^bowie-terminal/'` pesa ~74MB per un sottoprogetto che su disco è ~1MB.

**`EAS_NO_VCS=1` da solo NON basta — è insufficiente.** Root cause verificata leggendo il sorgente (`eas-cli/build/vcs/clients/noVcs.js`): `NoVcsClient.getRootPathAsync()` prova PRIMA `git rev-parse --show-toplevel` e solo se quel comando fallisce ricade su `process.cwd()`. Dentro un sottoprogetto annidato in un repo più grande, quel comando NON fallisce mai — quindi la root risolta resta quella del monorepo (con `node_modules/`+`.git/` potenzialmente da svariati GB), e la compressione non finisce mai in tempi ragionevoli. Questo È la causa di build che "sembrano non finire mai" — non un limite del sandbox/agente, come ipotizzato in precedenza.

**Fix reale — entrambe le env var insieme, sempre:**
```bash
EAS_NO_VCS=1
EAS_PROJECT_ROOT="/percorso/assoluto/al/sottoprogetto"   # es. "$(pwd)" se già dentro la dir
EAS_SKIP_AUTO_FINGERPRINT=1   # @expo/fingerprint ha lo stesso comportamento di risalita, indipendente dall'archivio
```
`EAS_PROJECT_ROOT`, se assoluto, ha precedenza su tutto e salta del tutto la chiamata `git rev-parse`. Con questo fix l'upload scende da decine di MB a poche centinaia di KB e la build viene accodata su EAS in ~30-60s.

**Non fixare editando il `.gitignore`/`.easignore` della ROOT del progetto** — è una risorsa condivisa che potrebbe alterare la build (già funzionante) dell'app principale. Scoping sempre lato sottoprogetto: `EAS_NO_VCS=1` + `EAS_PROJECT_ROOT` assoluto + `.easignore` locale.

**Segnale diagnostico:** se il sottoprogetto pesa ~1MB su disco (`du -sh`) ma il CLI resta su "Compressing project files" per più di ~20-30s, la root risolta è quasi certamente sbagliata — interrompere e verificare `EAS_PROJECT_ROOT`, non lasciare girare "per vedere se finisce".

**Nota Replit-specific (non lo stesso problema, ma va combinata):** non lanciare `eas build --no-wait` in background con `&`/`nohup`/`disown`/`setsid` dentro il tool bash dell'agente — il processo figlio viene reaped insieme alla sessione bash chiamante nella maggior parte dei tentativi, lasciando un log vuoto e nessuna build reale in coda. Lanciare sempre in **foreground** con timeout ≥110s: una volta risolta la root corretta con `EAS_PROJECT_ROOT`, il comando `--no-wait` termina da solo in ~30-60s (accoda il build e ritorna, non aspetta il completamento cloud). Se anche in foreground con root corretta il comando continua a morire prima di accodare, allora è un vero limite del sandbox e va lanciato dalla Shell reale di Replit.

**Due ulteriori blocchi scoperti DOPO aver risolto lo scan del monorepo** (build reale accodata ma comunque fallita, `errorCode: UNKNOWN_ERROR` generico — serve scaricare `logFiles[0]` da `eas build:view <id> --json`, URL firmato GCS content-encoding brotli, scade ~15min, per capire la fase e il messaggio reale):

1. **Proxy Replit nel lockfile, riapparso dopo rigenerazione** — ogni `npm install --package-lock-only` fatto DENTRO l'ambiente Replit riscrive gli URL come `http://package-firewall.replit.local/npm/...`, irraggiungibile da EAS → `npm ci` crasha con `Exit handler never called!` (sintomo criptico, non un ERESOLVE visibile). Il sed noto va riapplicato ad OGNI rigenerazione del lockfile, non solo la prima volta: `sed -i 's|http://package-firewall\.replit\.local/npm/|https://registry.npmjs.org/|g' bowie-terminal/package-lock.json`.
2. **babel-preset-expo non hoistato a root** — se non è dichiarato come devDependency esplicita di primo livello, npm può risolverlo SOLO annidato sotto `node_modules/expo/node_modules/babel-preset-expo`; `babel.config.js` lo richiede con risoluzione Node dalla root del progetto → bundle fallisce con "Cannot find module 'babel-preset-expo'" nella fase Bundle JavaScript (build passa Install ma fallisce dopo). Fix: aggiungerlo esplicitamente a `package.json` devDependencies (stessa versione richiesta da expo, es. `~56.0.16`) e rigenerare il lockfile — forza l'hoisting a `node_modules/babel-preset-expo` (verificabile con grep prima di rilanciare).

Procedura dettagliata + comandi esatti: skill `bowie-terminal-apk-build` (Pitfall 4b, 4c).
