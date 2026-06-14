---
name: bikerlink-apk-build
description: Procedura build APK BikerLink con EAS CLI 20.x — debug standalone arm64 e release arm64. Trigger: "vai con la build", "build apk", "build debug", "build release", "lancia la build", "nuova build". Leggere PRIMA di toccare eas.json o lanciare bash scripts/eas.sh build.
---

# BikerLink — Build APK (Debug + Release)

## Trigger

Attivare questa skill quando l'utente dice una delle seguenti (o varianti):
- "vai con la build"
- "build APK"
- "build debug"
- "build release"
- "nuova build"
- "lancia la build"

> ⚠️ Leggere sempre `.agents/skills/bikerlink-versioning/SKILL.md` prima di qualsiasi operazione di bump versione.

---

## Tabella profili EAS

| Profilo | Tipo | Gradle | Distribuzione | Canale | Quando usarlo |
|---|---|---|---|---|---|
| `debug-apk` | APK debug | `assembleDebug` | internal | production | Debug quotidiano — **profilo standard** |
| `release-apk` | APK release | `assembleRelease` | internal | production | Release test interni / Play Store internal track |
| `production` | AAB release | `bundleRelease` | store | production | Play Store pubblico |
| `preview` | APK release | `assembleRelease` | internal | staging | Test canale staging |

---

## Caratteristiche globali del progetto

Si applicano a **tutti** i profili senza ridichiarare:

| Caratteristica | Configurato in | Valore |
|---|---|---|
| ARM64 only | `build.gradle` → `abiFilters` + `gradle.properties` → `reactNativeArchitectures` | `arm64-v8a` |
| New Architecture | `gradle.properties` → `newArchEnabled` + `app.json` → `expo-build-properties` | `true` |
| Hermes engine | `gradle.properties` → `hermesEnabled` | `true` |

---

## Profilo `debug-apk` — APK Debug Standalone

### Specifica JSON completa (copiare esattamente in `eas.json`)

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

- `assembleDebug` → dev menu attivo, nessuna offuscazione, log completi
- `ORG_GRADLE_PROJECT_bundleInDebug=true` → JS bundlato nell'APK (standalone, non serve Metro server)
- `image: latest` → immagine EAS aggiornata per CLI 20.x
- **versionCode: NON si incrementa** — è una build di test

### Comando di lancio

```bash
GIT_INDEX_FILE=/tmp/eas-build-index bash scripts/eas.sh build \
  --platform android \
  --profile debug-apk \
  --non-interactive \
  --no-wait
```

---

## Profilo `release-apk` — APK Release ARM64

### Specifica JSON completa (già esistente in `eas.json`, non modificare)

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
    "gradleCommand": ":app:assembleRelease"
  }
}
```

### Caratteristiche specifiche

- `assembleRelease` → Proguard/R8 attivi, codice ottimizzato
- **versionCode: SI incrementa** — seguire procedura in `bikerlink-versioning/SKILL.md` prima di lanciare
- Aggiornare i 4 file allineati: `app.json` (version + versionCode), `build.gradle` (versionCode + versionName)

### Comando di lancio

```bash
GIT_INDEX_FILE=/tmp/eas-build-index bash scripts/eas.sh build \
  --platform android \
  --profile release-apk \
  --non-interactive \
  --no-wait
```

---

## Procedura comune (entrambi i profili)

### Step 1 — Leggi versione attuale

```bash
node -e "const a=require('./app.json'); console.log('version:', a.expo.version, '| versionCode:', a.expo.android?.versionCode, '| runtimeVersion:', a.expo.runtimeVersion)"
grep -E "versionCode|versionName" android/app/build.gradle | head -5
```

### Step 2 — Gate versione a due fasi — OBBLIGATORIO, non saltare mai

**Fase A — Verifica autonoma dell'agente:** leggere `app.json` E `android/app/build.gradle` e confrontare i valori. Devono essere allineati:
- `app.json` → `expo.version`, `expo.android.versionCode`, `expo.runtimeVersion`
- `build.gradle` → `versionCode`, `versionName`

Se i valori sono disallineati: bloccarsi, segnalare il problema all'utente e NON procedere finché non è risolto.

**Fase B — Approvazione esplicita dell'utente:** solo dopo che la Fase A è superata, usare `user_query` mostrando i valori **esatti letti dai file**:

> "Ho verificato le versioni:
> - version: X.Y.Z
> - versionCode: N
> - runtimeVersion: X.0.0
> - build.gradle: allineato ✓
>
> Procedo con la build [profilo]?"

Attendere la risposta. Se l'utente non approva esplicitamente: fermarsi. Nessuna eccezione.

### Step 3 — Lancia la build

Usare il comando del profilo scelto (vedi sezioni sopra), sempre con il workaround sandbox (vedi sezione sotto).

---

## Workaround sandbox Replit — OBBLIGATORIO per tutti i profili

**Perché:** senza `GIT_INDEX_FILE=/tmp/eas-build-index` il comando fallisce con exit 254 perché la sandbox Replit blocca `.git/index.lock`. Il prefisso redirige il lock su `/tmp/`.

**Regola:** aggiungere SEMPRE `GIT_INDEX_FILE=/tmp/eas-build-index` prima di `bash scripts/eas.sh build`, per qualsiasi profilo.

**Timeout bash:** **600 000 ms** (10 min — upload ~100–130 MB).

---

## Debug da Windows dopo install APK

Nessun pacchetto npm aggiuntivo — tutto nel build di default.

| Strumento | Scopo |
|---|---|
| Android SDK Platform Tools (ADB) | Installa APK, legge log nativi |
| Chrome `chrome://inspect` | Debug JS via Hermes inspector (dopo `adb reverse tcp:8081 tcp:8081`) |
| `npx react-devtools` | Ispeziona component tree React Native |

### Comandi ADB essenziali

```bash
adb install bikerlink-debug.apk
adb reverse tcp:8081 tcp:8081
adb logcat -s ReactNativeJS:V ReactNative:V ExpoModuleCore:V
```

Dev menu: scuoti il dispositivo → "Open Debugger".

---

## Checklist pre-build

- [ ] Versione letta e mostrata all'utente
- [ ] Utente ha confermato prima del lancio
- [ ] `debug-apk`: versionCode invariato
- [ ] `release-apk`: bump versione completato nei 4 file
- [ ] `GIT_INDEX_FILE=/tmp/eas-build-index bash scripts/eas.sh build` (usare sempre il wrapper — mai il binario diretto)
- [ ] `--no-wait` nel comando

---

## File chiave

| File | Ruolo |
|---|---|
| `eas.json` | Profili build EAS |
| `app.json` | version, versionCode, runtimeVersion, expo-build-properties |
| `android/app/build.gradle` | versionCode, versionName, abiFilters |
| `android/gradle.properties` | newArchEnabled, hermesEnabled, reactNativeArchitectures |
