---
name: bikerlink-apk-build
description: Procedura build APK/AAB BikerLink con EAS CLI 20.x — 3 modalità (debug-apk, release-apk, production AAB). Trigger: "vai con la build", "build apk", "build debug", "build release", "lancia la build", "nuova build", "build aab", "play store build". Leggere PRIMA di toccare eas.json o lanciare bash scripts/eas.sh build.
---

# BikerLink — Build APK/AAB (3 modalità EAS 20.x)

## Trigger

Attivare questa skill quando l'utente dice una delle seguenti (o varianti):
- "vai con la build"
- "build APK"
- "build debug"
- "build release"
- "nuova build"
- "lancia la build"
- "build AAB"
- "build Play Store"

> ⚠️ Leggere sempre `.agents/skills/bikerlink-versioning/SKILL.md` prima di qualsiasi operazione di bump versione.

---

## Caratteristiche comuni (tutte le modalità)

Si applicano a **tutte e tre le modalità** senza ridichiarare:

| Caratteristica | Configurato in | Valore |
|---|---|---|
| **Standalone** | Release: automatico; Debug: `ORG_GRADLE_PROJECT_bundleInDebug=true` | JS bundlato nell'APK — nessun Metro server richiesto |
| arm64-v8a | `android/app/build.gradle` → `abiFilters` + `android/gradle.properties` → `reactNativeArchitectures` + `app.json` → `expo-build-properties` → `buildArchs` | `arm64-v8a` |
| New Architecture | `android/gradle.properties` → `newArchEnabled=true` + `app.json` → `expo-build-properties` → `newArchEnabled` | `true` |
| Hermes engine | `android/gradle.properties` → `hermesEnabled=true` | `true` |

---

## Procedura comune obbligatoria

Eseguire **sempre**, per tutte e tre le modalità, nell'ordine indicato.

### Step 0 — expo doctor (OBBLIGATORIO)

```bash
npx expo-doctor@latest
```

**Se fallisce: bloccarsi. Non procedere.** Segnalare all'utente i check falliti e attendere che siano risolti.

### Step 1 — Leggi versioni attuali

Leggere `app.json` **e** `android/app/build.gradle` e verificare che i 5 campi siano allineati:

| File | Campo |
|---|---|
| `app.json` | `expo.version` |
| `app.json` | `expo.android.versionCode` |
| `app.json` | `expo.runtimeVersion` |
| `android/app/build.gradle` | `versionCode` |
| `android/app/build.gradle` | `versionName` |

Se i valori sono disallineati: bloccarsi, segnalare il problema, NON procedere finché non è risolto.

> **Nota `appVersionSource: local`:** `eas.json` dichiara `"appVersionSource": "local"` → EAS legge la versione **esclusivamente** dai file locali (`app.json` / `build.gradle`). Se i file sono disallineati, EAS compila con valori sbagliati senza avvertire.

### Step 2 — Bump versione (solo release-apk e production)

- **debug-apk**: nessuna modifica al versionCode. Saltare questo step.
- **release-apk / production AAB**: incrementare versionCode e aggiornare i 4 campi allineati. Seguire la procedura completa in `bikerlink-versioning/SKILL.md`.

### Step 3 — GATE OBBLIGATORIO (user_query)

Prima di lanciare qualsiasi build, presentare il riepilogo con `user_query` mostrando i valori **esatti letti dai file**:

```
Profilo: <debug-apk | release-apk | production>
version: X.Y.Z
versionCode: N
runtimeVersion: X.0.0
build.gradle: allineato ✓ (oppure: ⚠ DISALLINEATO — vedi sopra)
expo doctor: N/N checks passed ✓ (oppure: ⚠ FALLITO)

Procedo con la build?
```

Attendere approvazione esplicita. **Senza OK dell'utente: fermarsi. Nessuna eccezione. Vale per tutte e 3 le modalità.**

---

## Modalità 1 — Debug APK (`debug-apk`)

### Specifica JSON completa (copia esatta da `eas.json`)

```json
"debug-apk": {
  "distribution": "internal",
  "channel": "production",
  "credentialsSource": "remote",
  "env": {
    "NODE_OPTIONS": "--max_old_space_size=8192",
    "ORG_GRADLE_PROJECT_bundleInDebug": "true"
  },
  "android": {
    "buildType": "apk",
    "gradleCommand": ":app:assembleDebug",
    "image": "latest"
  }
}
```

### Caratteristiche specifiche

- `assembleDebug` → dev menu attivo, nessun ProGuard/R8, nessun minify, log completi
- `ORG_GRADLE_PROJECT_bundleInDebug=true` → JS bundlato nell'APK (standalone, no Metro server)
- `image: latest` → immagine EAS aggiornata per CLI 20.x
- `distribution: internal` → distribuzione interna EAS (non Play Store)
- **versionCode: NON si incrementa** — è una build di test

### Comando di lancio

```bash
CI=1 EAS_NO_VCS=1 GIT_INDEX_FILE=/tmp/eas-build-index \
bash scripts/eas.sh build \
  --platform android \
  --profile debug-apk \
  --non-interactive \
  --no-wait
```

---

## Modalità 2 — Production APK (`release-apk`)

### Specifica JSON completa (copia esatta da `eas.json`)

```json
"release-apk": {
  "distribution": "internal",
  "channel": "production",
  "credentialsSource": "remote",
  "env": {
    "NODE_OPTIONS": "--max_old_space_size=8192"
  },
  "android": {
    "buildType": "apk",
    "gradleCommand": ":app:assembleRelease",
    "image": "latest"
  }
}
```

### Caratteristiche specifiche

- `assembleRelease` → ProGuard/R8 attivo, codice ottimizzato, dev menu disattivo
- ProGuard (`enableProguardInReleaseBuilds=true`), minify (`enableMinifyInReleaseBuilds=true`), shrink resources (`enableShrinkResourcesInReleaseBuilds=true`) — configurati in `app.json` → `expo-build-properties`
- `image: latest` → immagine EAS aggiornata per CLI 20.x
- `distribution: internal` → va in distribuzione interna EAS, **non** al Play Store
- **versionCode: SI incrementa** — seguire la procedura in `bikerlink-versioning/SKILL.md`

### Comando di lancio

```bash
CI=1 EAS_NO_VCS=1 GIT_INDEX_FILE=/tmp/eas-build-index \
bash scripts/eas.sh build \
  --platform android \
  --profile release-apk \
  --non-interactive \
  --no-wait
```

---

## Modalità 3 — AAB Play Store (`production`)

### Specifica JSON completa (copia esatta da `eas.json`)

```json
"production": {
  "distribution": "store",
  "channel": "production",
  "credentialsSource": "remote",
  "env": {
    "NODE_OPTIONS": "--max_old_space_size=8192"
  },
  "android": {
    "buildType": "app-bundle",
    "gradleCommand": ":app:bundleRelease",
    "image": "latest"
  },
  "ios": {
    "autoIncrement": false
  }
}
```

### Caratteristiche specifiche

- `bundleRelease` → produce **AAB** (Android App Bundle), **non APK** — unico formato accettato dal Play Store
- `distribution: store` → albero EAS separato rispetto a `internal`; l'artefatto è destinato al Play Store (non scaricabile come APK standalone)
- `image: latest` → immagine EAS aggiornata per CLI 20.x
- Stesse ottimizzazioni release (ProGuard, minify, shrink) attive via `app.json` → `expo-build-properties`
- Dev menu disattivo
- **versionCode: SI incrementa** — stessa procedura di `release-apk` (vedi `bikerlink-versioning/SKILL.md`)

### Comando di lancio

```bash
CI=1 EAS_NO_VCS=1 GIT_INDEX_FILE=/tmp/eas-build-index \
bash scripts/eas.sh build \
  --platform android \
  --profile production \
  --non-interactive \
  --no-wait
```

---

## EAS CLI 20.x — Regola unica

**Tutti e tre i prefissi sono obbligatori per ogni build:**

| Prefisso | Motivazione |
|---|---|
| `CI=1` | Disabilita prompt interattivi e comportamenti "smart" della CLI EAS |
| `EAS_NO_VCS=1` | Impedisce a EAS di fare operazioni git imprevedibili (fetch, checkout) |
| `GIT_INDEX_FILE=/tmp/eas-build-index` | Redirige il lock git su `/tmp/` — senza questo, la sandbox Replit blocca `.git/index.lock` e il comando fallisce con exit 254 |

**Timeout bash:** 600 000 ms (10 minuti — upload ~100–130 MB).

**Wrapper obbligatorio:** usare sempre `bash scripts/eas.sh` — mai il binario `eas` globale né tramite package runner. Il wrapper punta a `node_modules/.bin/eas` (eas-cli v20 installato come dipendenza di progetto).

### Verifica flag EAS (on demand — eseguire quando EAS aggiorna major version)

```bash
bash scripts/eas.sh --version
bash scripts/eas.sh build --help
```

Verificare che nell'output di `--help` siano presenti:

| Flag usato nei comandi | Come appare nell'--help | Note |
|---|---|---|
| `--platform android` | `-p, --platform=<option>` | `android\|ios\|all` — stabile |
| `--profile <name>` | `-e, --profile=PROFILE_NAME` | long form `--profile` funziona |
| `--non-interactive` | `--non-interactive` | stabile |
| `--no-wait` | `[--wait]` → negazione automatica oclif | se EAS rimuove `--wait`, `--no-wait` smette di funzionare — verificare |

Riferimento ufficiale:
- CHANGELOG: `https://github.com/expo/eas-cli/blob/main/CHANGELOG.md`
- Releases: `https://github.com/expo/eas-cli/releases`

---

## Checklist unificata pre-build

| Check | debug-apk | release-apk | production (AAB) |
|---|---|---|---|
| expo doctor eseguito e verde | ✓ obbligatorio | ✓ obbligatorio | ✓ obbligatorio |
| Versioni lette dai file | ✓ | ✓ | ✓ |
| 4 campi allineati (app.json + build.gradle) | ✓ verifica | ✓ verifica | ✓ verifica |
| versionCode incrementato | ✗ NON toccare | ✓ obbligatorio | ✓ obbligatorio |
| GATE user_query superato | ✓ obbligatorio | ✓ obbligatorio | ✓ obbligatorio |
| `CI=1 EAS_NO_VCS=1 GIT_INDEX_FILE=...` presenti | ✓ | ✓ | ✓ |
| `--no-wait` nel comando | ✓ | ✓ | ✓ |
| Artefatto prodotto | APK | APK | AAB |
| Distribuzione EAS | internal | internal | store |

---

## File chiave

| File | Ruolo |
|---|---|
| `eas.json` | Profili build EAS — `appVersionSource: local` → EAS legge da file locali |
| `app.json` | `expo.version`, `expo.android.versionCode`, `expo.runtimeVersion`, `expo-build-properties` |
| `android/app/build.gradle` | `versionCode`, `versionName`, `abiFilters` |
| `android/gradle.properties` | `newArchEnabled`, `hermesEnabled`, `reactNativeArchitectures` |
| `scripts/eas.sh` | Wrapper EAS CLI → `node_modules/.bin/eas` |
| `.agents/skills/bikerlink-versioning/SKILL.md` | Procedura bump versione (obbligatoria per release e AAB) |
