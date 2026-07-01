---
name: bowie-terminal-apk-build
description: Procedura build APK arm64 (sideload) e AAB Play Store per Bowie Terminal (bowie-terminal/), app Expo managed nidificata separata dall'app principale BikerLink. Trigger — "build bowie", "build apk bowie terminal", "bowie release apk", "bowie play store", "compila bowie". Leggere PRIMA di toccare bowie-terminal/eas.json o lanciare eas build da bowie-terminal/.
---

# Bowie Terminal — Build APK arm64 / AAB Play Store

## Cos'è Bowie Terminal

`bowie-terminal/` è un'app Expo **managed workflow** completamente separata dall'app principale BikerLink:

- **Nessuna cartella `android/`** — non è mai stato fatto `expo prebuild`. Tutta la config nativa (arm64, R8, New Architecture) passa attraverso il plugin `expo-build-properties` in `bowie-terminal/app.json`, MAI tramite `build.gradle`/`gradle.properties` diretti (che qui non esistono).
- **Nessun `node_modules/` locale** — le dipendenze risolvono a walk-up sul `node_modules` della root del progetto (comportamento normale in Replit per progetti Expo nidificati). Questo è sufficiente per introspection/preflight locale, ma la build EAS remota fa comunque il proprio `npm ci` scoped a `bowie-terminal/package.json` + `bowie-terminal/package-lock.json`.
- **Proprio progetto EAS indipendente** — `bowie-terminal/app.json` → `extra.eas.projectId` è un projectId EAS dedicato (account `@andreamasteri/bowie-terminal`), NON quello dell'app principale. Le credenziali Android (keystore) sono gestite da EAS in remoto (`credentialsSource: "remote"`), separate dal keystore dell'app principale.
- **Condivide lo stesso repo Git** della root — non ha una `.git` propria. Questo è la fonte del pitfall più insidioso (vedi sotto).

## Le due modalità di build

| Modalità | Profilo `eas.json` | Formato | Uso |
|---|---|---|---|
| **APK standalone arm64** | `release-apk` | APK (`assembleRelease`) | Sideload / test diretto su device, distribuzione interna EAS |
| **Play Store** | `production` | AAB (`bundleRelease`) | Submission al Google Play Console, distribuzione `store` |

Entrambi i profili condividono la stessa configurazione arm64-only + R8 minify (vedi sotto), perché è impostata a livello di plugin in `app.json`, non nel singolo profilo `eas.json`.

### `bowie-terminal/eas.json` — riferimento esatto

```json
{
  "cli": { "version": ">= 20.0.0", "appVersionSource": "local" },
  "build": {
    "release-apk": {
      "distribution": "internal",
      "channel": "production",
      "credentialsSource": "remote",
      "env": { "NODE_OPTIONS": "--max_old_space_size=8192", "EXPO_PUBLIC_DOMAIN": "biker-link.replit.app" },
      "android": { "buildType": "apk", "gradleCommand": ":app:assembleRelease", "image": "latest" }
    },
    "production": {
      "distribution": "store",
      "credentialsSource": "remote",
      "channel": "production",
      "env": { "NODE_OPTIONS": "--max_old_space_size=8192", "EXPO_PUBLIC_DOMAIN": "biker-link.replit.app" },
      "android": { "buildType": "app-bundle", "gradleCommand": ":app:bundleRelease -PreactNativeArchitectures=armeabi-v7a,arm64-v8a,x86,x86_64", "image": "latest" }
    }
  },
  "submit": { "production": {} }
}
```

> ⚠️ **ABI strategy per profilo:** il plugin `expo-build-properties` in `app.json` fissa `buildArchs: ["arm64-v8a"]` come default globale (usato da `release-apk`, l'APK di sideload). Il profilo `production` (AAB Play Store) DEVE restare universale (tutte le ABI, non solo arm64) perché il Play Store serve automaticamente l'APK giusto per device via App Bundle — limitarlo ad arm64 escluderebbe utenti con device più vecchi/diversi. Per questo `production.android.gradleCommand` passa `-PreactNativeArchitectures=armeabi-v7a,arm64-v8a,x86,x86_64` esplicitamente: un `-P` Gradle property override ha precedenza sul valore scritto in `gradle.properties` dal plugin durante il prebuild, esattamente come il pattern già usato da `diagnostic-apk` nell'app principale per disattivare ProGuard via flag. Questo permette ai due profili di avere ABI diverse SENZA duplicare/condizionare la config statica di `app.json`.

### `bowie-terminal/app.json` — plugin arm64 + R8 (unica fonte di verità)

```json
["expo-build-properties", {
  "android": {
    "newArchEnabled": true,
    "enableProguardInReleaseBuilds": true,
    "enableMinifyInReleaseBuilds": true,
    "enableShrinkResourcesInReleaseBuilds": true,
    "buildArchs": ["arm64-v8a"]
  }
}]
```

- `enableProguardInReleaseBuilds` + `enableMinifyInReleaseBuilds` + `enableShrinkResourcesInReleaseBuilds` = R8 completo (minify + shrink risorse), equivalente al comportamento `assembleRelease` dell'app principale.
- `buildArchs: ["arm64-v8a"]` è l'unico modo corretto per limitare le ABI in managed workflow — **non** impostare `abiFilters` grezzo nel plugin, è un concetto bare-workflow/Gradle e viene ignorato silenziosamente da `expo-build-properties`.

## Procedura

### Step 0 — Preflight OBBLIGATORIO (gate, mai saltare)

Prima di lanciare qualsiasi build reale, verificare che la config nativa generata rifletta davvero arm64+minify:

```bash
cd bowie-terminal && npx expo config --type introspect --json | grep -A3 "reactNativeArchitectures\|enableMinifyInReleaseBuilds\|enableShrinkResourcesInReleaseBuilds"
```

Atteso: `reactNativeArchitectures=arm64-v8a`, `enableMinifyInReleaseBuilds=true`, `enableShrinkResourcesInReleaseBuilds=true`. Se assente o diverso, NON lanciare la build — il plugin non è wired correttamente in `app.json` o `expo-build-properties` non è nelle dependencies di `bowie-terminal/package.json`.

### Step 1 — Comando di lancio

Eseguire SEMPRE da dentro `bowie-terminal/` (mai dalla root):

```bash
cd bowie-terminal && EAS_TOKEN="$EAS_TOKEN" EAS_NO_VCS=1 EAS_PROJECT_ROOT="$(pwd)" EAS_SKIP_AUTO_FINGERPRINT=1 \
npx --yes eas-cli@^20.1.0 build --platform android --profile release-apk --non-interactive --no-wait
```

⚠️ **`EAS_PROJECT_ROOT` (path assoluto) è OBBLIGATORIO insieme a `EAS_NO_VCS=1`, non opzionale** — vedi Pitfall 1 aggiornato sotto: senza di esso, `EAS_NO_VCS=1` da solo NON evita la scansione dell'intero monorepo.

Lanciare sempre in **foreground** con timeout ≥110s (mai `&`/`nohup` in background: nell'ambiente Replit il processo figlio viene terminato insieme alla sessione bash che lo ha avviato, anche con `disown`, lasciando un file di log vuoto e nessuna build reale su EAS).

Per il profilo Play Store, sostituire `--profile release-apk` con `--profile production`.

### Step 2 — Verifica post-build

- `eas build:list --limit 5 --json` per confermare che il build sia stato effettivamente accodato/completato (non basta vedere l'output locale del CLI — un processo che muore prima della fine NON produce un build reale).
- Sui log di build EAS (dashboard o `eas build:view <id>`): confermare `Compressing project files` seguito da un upload di dimensione ragionevole (vedi Pitfall 1 sotto per cosa significa "ragionevole" per Bowie), poi il task Gradle `R8`/`minifyReleaseWithR8` nell'output, e che l'APK/AAB finale sia sotto la soglia arm64-slim attesa (non la dimensione universale multi-ABI, che sarebbe 2-3× più grande).

## Pitfall — leggere PRIMA di ogni build

### Pitfall 1 — Cross-project pollution: l'archivio include l'INTERO monorepo, non solo `bowie-terminal/`

`bowie-terminal/` non ha una propria `.git`: condivide quella della root. EAS CLI, con la strategia di archiviazione basata su Git (default), risale fino alla root del repo Git e include TUTTI i file tracciati dell'intero progetto BikerLink (root app compresa: asset, migration, doc, ecc.), non solo `bowie-terminal/`.

**Sintomo:** l'upload riporta una dimensione enorme (es. ~70 MB) per un progetto che su disco pesa ~1 MB (`du -sh bowie-terminal` conferma la dimensione reale). Confermato empiricamente: `git ls-files | grep -v '^bowie-terminal/'` pesa ~74 MB — combacia quasi esattamente con la dimensione dell'archivio caricato.

**`EAS_NO_VCS=1` da solo NON risolve il problema — è un fix parziale/insufficiente.** Root cause (verificato leggendo `eas-cli/build/vcs/clients/noVcs.js`): anche in modalità "no VCS", `NoVcsClient.getRootPathAsync()` prova PRIMA `git rev-parse --show-toplevel`, e solo se quel comando fallisce ricade su `process.cwd()`. Dentro `bowie-terminal/` quel comando NON fallisce (c'è la `.git` della root che lo contiene), quindi la root risolta resta la root dell'intero monorepo (~6+ GB tra `node_modules/` e `.git/`), e la compressione resta bloccata per minuti/non finisce mai entro un timeout ragionevole (i tentativi precedenti sono arrivati a build MERGED sul task tracker senza che nessuna build risultasse davvero in coda su `eas build:list`).

**Fix reale — entrambe le env var sono obbligatorie insieme:**
```bash
EAS_NO_VCS=1
EAS_PROJECT_ROOT="/percorso/assoluto/a/bowie-terminal"   # es. "$(pwd)" se già dentro bowie-terminal/
```
`EAS_PROJECT_ROOT`, se assoluto, ha precedenza su tutto e salta del tutto la chiamata `git rev-parse`, quindi la root risolta è finalmente `bowie-terminal/` (upload atteso: centinaia di KB, non decine di MB). Accompagnare con un `bowie-terminal/.easignore` scoped (già presente) per escludere esplicitamente cache/log locali:
```
node_modules
.expo
dist
web-build
*.log
.DS_Store
expo-env.d.ts
```

**Non modificare `.gitignore`/`.easignore` alla ROOT del progetto per risolvere questo** — è una risorsa condivisa e potrebbe alterare il comportamento della build dell'app principale (fuori scope, vietato dal task). Lo scoping va fatto SEMPRE lato Bowie con `EAS_NO_VCS=1` + `EAS_PROJECT_ROOT` assoluto + `.easignore` locale.

**Verifica in caso di dubbio:** se il CLI resta su "Compressing project files" per più di ~20-30s per un progetto che pesa ~1MB su disco, è quasi certo che stia scansionando la root sbagliata — interrompere e ricontrollare che `EAS_PROJECT_ROOT` sia impostato e assoluto, non lasciare girare "per vedere se finisce".

### Pitfall 2 — Computing project fingerprint può bloccarsi a lungo

Anche con `EAS_NO_VCS=1`, il passo "Computing project fingerprint" di `@expo/fingerprint` può risalire alla root del monorepo per calcolare l'hash (stesso meccanismo di rilevamento "workspace root"), diventando molto lento su un repo di grandi dimensioni.

**Fix:**
```bash
EAS_SKIP_AUTO_FINGERPRINT=1
```
Da usare sempre in combinazione con `EAS_NO_VCS=1` per Bowie — non necessario per l'app principale (che è già alla root, non risale nulla).

### Pitfall 3 — Mai riusare gli script/profili build della root

`scripts/build-apk.sh`, `scripts/release-apk.sh`, `scripts/eas.sh` sono hard-wired sull'`app.json`/`android/` della root. Vanno usati SOLO come riferimento di pattern (es. la sed-fix del proxy sotto), MAI eseguiti o modificati per Bowie. Ogni comando Bowie usa `npx eas-cli` direttamente da `bowie-terminal/`, mai il wrapper `scripts/eas.sh`.

### Pitfall 4 — Proxy URL nel lockfile (scoped al file di Bowie)

Dopo qualunque `npm install`/edit manuale di `bowie-terminal/package-lock.json`, verificare ed eventualmente correggere le URL risolte tramite il proxy Replit, **applicando il sed SOLO al lockfile di Bowie**:

```bash
sed -i 's|http://package-firewall\.replit\.local/npm/|https://registry.npmjs.org/|g' bowie-terminal/package-lock.json
```

Non toccare mai il lockfile della root con lo stesso comando nello stesso passaggio — sono due progetti npm indipendenti.

### Pitfall 5 — `EAS_TOKEN` invece di login interattivo

Bowie usa lo stesso secret `EAS_TOKEN` già presente nell'ambiente (autenticato come `andreamasteri`). Non serve un secondo account: `eas whoami` da dentro `bowie-terminal/` deve risultare autenticato senza prompt.

### Pitfall 6 — Ambiente sandbox: build reali possono richiedere un terminale reale

Il processo `eas build` (compressione + upload + polling) è un'operazione di rete a lunga durata. Nell'ambiente sandbox dell'agente, chiamate bash foreground/background lanciate dal tool possono non sopravvivere fino al completamento (il processo viene interrotto prima che l'upload/coda finisca), indipendentemente da `--no-wait`. Se una build reale deve essere avviata e verificata end-to-end e i tentativi da bash-tool falliscono ripetutamente allo stesso punto, lanciare il comando dalla Shell reale di Replit (tab Shell, non il tool agente) — lì il processo non è soggetto agli stessi vincoli di durata.

## Checklist pre-build

| Check | release-apk (APK) | production (AAB) |
|---|---|---|
| Preflight introspect eseguito e verde (arm64 + minify + shrink) | ✓ obbligatorio | ✓ obbligatorio |
| `EAS_NO_VCS=1` presente | ✓ | ✓ |
| `EAS_SKIP_AUTO_FINGERPRINT=1` presente | ✓ | ✓ |
| Comando lanciato da dentro `bowie-terminal/` | ✓ | ✓ |
| Script/profili root NON toccati | ✓ | ✓ |
| `eas build:list --json` verificato post-lancio | ✓ | ✓ |
| `buildArchs` ancora `["arm64-v8a"]` (o allargato intenzionalmente) | ✓ verifica | ✓ verifica se serve multi-ABI |
| Distribuzione EAS attesa | internal | store |

## File chiave

| File | Ruolo |
|---|---|
| `bowie-terminal/eas.json` | Profili `release-apk` (APK, internal) e `production` (AAB, store) |
| `bowie-terminal/app.json` | `expo-build-properties` plugin — unica fonte di verità per arm64/R8/New Arch; `extra.eas.projectId` |
| `bowie-terminal/package.json` | dependency `expo-build-properties` |
| `bowie-terminal/.easignore` | scoping locale dell'archivio, usato insieme a `EAS_NO_VCS=1` |
| `bowie-terminal/package-lock.json` | lockfile indipendente da quello della root — fix proxy va applicato solo qui |
