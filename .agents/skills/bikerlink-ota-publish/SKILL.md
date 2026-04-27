---
name: bikerlink-ota-publish
description: Procedura completa per pubblicare un aggiornamento OTA su BikerLink (Expo/Android). Usa questa skill ogni volta che l'utente chiede di pubblicare una OTA, rilasciare un aggiornamento, distribuire modifiche agli utenti Android, o aggiornare il numero OTA.
---

# BikerLink — Pubblicazione OTA

## ⚡ REGOLA FONDAMENTALE — "Crea l'OTA" = Crea + Pubblica
**Quando l'utente dice "crea l'OTA", "prepara l'OTA", "fai l'OTA" o qualsiasi variante:**
- La pubblicazione è **inclusa automaticamente** — non è opzionale
- **Non chiedere conferma separata** prima di eseguire lo script di pubblicazione
- Eseguire l'intera procedura (passi 1–7) in un'unica sessione senza interruzioni

## 🚫 EAS UPDATES — DISMESSO (Task #980)
**EAS Updates non è più usato per la delivery OTA.** L'unico canale OTA attivo è il
backend custom `https://biker-link.replit.app/api/expo-updates` (Expo Updates Protocol v1).

- ✅ `eas build` resta attivo per generare APK/AAB (`extra.eas.projectId` in app.json
  serve a `eas build`, non va rimosso).
- ❌ `eas update` / `npx eas-cli update` / canale `preview` su EAS Updates: **non usare più.**
- ❌ `app.json` non deve più puntare a `u.expo.dev`. La guard `validate-ota.sh` blocca
  la pubblicazione se trova `u.expo.dev` in `app.json` o nel manifest Android.
- ⚠️ Le APK già installate **prima** del fix di `app.json` possono ancora avere l'URL
  EAS bakato nel manifest nativo: il fix sarà effettivo solo dalla **prossima APK
  ricostruita** che leggerà il nuovo `expo.updates.url`. Le APK pubblicate dopo task
  #958 (v38) usano già il backend custom — vedere AndroidManifest.xml.

## Contesto fisso
- **Piattaforma**: Android only (iOS non supportato per OTA)
- **Canale EAS**: `preview`
- **Runtime Version**: `8.0.0` (ciclo corrente, APK v41) ← CICLO V3
- **APK corrente**: versionCode **41**, versionName **3.0.0** (buildId: `e03f51d8-9f2b-496f-bba2-e0fe90b69fb7`, EAS: https://expo.dev/accounts/andreamasteri/projects/bikerlink/builds/e03f51d8-9f2b-496f-bba2-e0fe90b69fb7, APK: https://expo.dev/artifacts/eas/tG5zT8yATySZWJVk7VLbLF.apk — completata 2026-04-27, arm64-v8a + NewArch + expo-audio, OTA-13 inclusa)
- **APK precedente (v40)**: versionCode **40**, versionName **3.0.0** (buildId: `ba5205c6-0cc8-41ce-ba8c-8e68a117dabf`, APK: https://expo.dev/artifacts/eas/p1rG9wd7hZg7oPG1WEc4kM.apk)
- **OTA corrente**: OTA-13 rv8.0.0 (bundle custom attivo — EAS Updates dismesso, Task #980)
- **Updates URL**: `https://biker-link.replit.app/api/expo-updates` (Expo Updates Protocol v1)
- **Utenti**: su Android fisico via APK — NON usano il dev server
- **Admin email**: `admin@bikerlink.it`
- **Admin password**: secret `BIKERLINK_ADMIN_PASSWORD`
- **Backend produzione**: `biker-link.replit.app`

## Regola critica
⛔ **MAI** eseguire `npx eas-cli update` direttamente — EAS Updates è dismesso (Task #980).
✅ Usare **sempre** `bash scripts/publish-ota.sh` — gestisce bundle, upload e pubblicazione
sul backend custom in sequenza. Lo script non chiama più EAS Updates.

## File chiave
- `lib/ota.ts` — contiene `CURRENT_OTA_NUMBER` (unica sorgente di verità)
- `ota-updates.json` — registro storico di tutte le OTA
- `scripts/publish-ota.sh` — script di pubblicazione completo
- `scripts/validate-ota.sh` — validatore pre/post pubblicazione

## Procedura completa

### PASSO 1 — Determinare il numero OTA
Leggere l'ultima entry del ciclo 7.x in `ota-updates.json` e prendere `updateNumber + 1`.
```bash
# Esempio: se l'ultima è 55, la nuova sarà 56
```

### PASSO 2 — Ottenere l'hash git corrente
```bash
git rev-parse HEAD
```

### PASSO 3 — Aggiornare `CURRENT_OTA_NUMBER` in lib/ota.ts
Trovare e modificare la riga (è l'**unico file** da aggiornare):
```typescript
export const CURRENT_OTA_NUMBER = <VECCHIO>;  // → <NUOVO>
```
Il commento sopra va tenuto generico:
```typescript
// ⚠️ CHECKLIST RELEASE: aggiornare questo numero PRIMA di ogni pubblicazione OTA
// Ciclo 7.0.0 — APK v37 — aggiornare ad ogni nuova OTA pubblicata
export const CURRENT_OTA_NUMBER = 56;
```

### PASSO 4 — Aggiungere entry in `ota-updates.json`
Marcare la entry precedente come `"status": "superseded"`, poi aggiungere in fondo:
```json
{
  "updateNumber": 56,
  "cycle": "7.x",
  "channel": "preview",
  "platform": "android",
  "runtimeVersion": "7.0.0",
  "jsEngine": "hermes",
  "message": "OTA-56 rv7.0.0: <descrizione breve>",
  "note": "<note dettagliate sui task inclusi. CURRENT_OTA_NUMBER=56.>",
  "releaseId": null,
  "bundleUrl": null,
  "updateGroupId": null,
  "androidUpdateId": null,
  "iosUpdateId": null,
  "commitBase": "<hash git completo da passo 2>",
  "easDashboard": null,
  "apkBuildId": null,
  "apkVersionCode": 37,
  "apkUrl": null,
  "status": "pending"
}
```
⚠️ I campi sconosciuti (`releaseId`, `bundleUrl`, ecc.) devono essere `null`, **non** la stringa `"PENDING"`.

### PASSO 5 — Eseguire lo script di pubblicazione
```bash
BIKERLINK_ADMIN_EMAIL="admin@bikerlink.it" \
BIKERLINK_ADMIN_PASSWORD="$BIKERLINK_ADMIN_PASSWORD" \
bash scripts/publish-ota.sh "1.56.0" "OTA-56: <messaggio di release>"
```
Il versioning segue `1.<numero OTA>.0`.

Lo script esegue automaticamente:
1. `validate-ota.sh` come guard (blocca se fallisce)
2. Export bundle Metro/Hermes
3. Upload bundle su object storage
4. Creazione release draft sul backend custom
5. Pubblicazione release (stato → active)
6. Verifica versione attiva via `/api/updates/check`

**Nota**: lo step storico "pubblicazione su EAS Updates" è stato rimosso (Task #980 —
EAS Updates dismesso). I dispositivi ricevono le OTA esclusivamente dal backend custom.

### PASSO 6 — Aggiornare `ota-updates.json` con gli ID reali
L'output dello script mostra gli ID generati dal backend custom. Sostituire i `null`
con i valori reali:
```json
{
  "releaseId": "<da output: Release ID>",
  "bundleUrl": "<da output: Bundle URL>",
  "updateGroupId": null,
  "androidUpdateId": null,
  "easDashboard": null,
  "status": "published"
}
```
I campi `updateGroupId`, `androidUpdateId`, `easDashboard` restano `null` perché
EAS Updates è dismesso (Task #980): mantenerli nel record solo per compatibilità
storica del registro.

### PASSO 7 — Validazione finale
```bash
bash scripts/validate-ota.sh
```
Tutti i check devono essere ✔. Il warning sui cicli multipli (2.0.0, 3.0.0, 4.0.0, 5.0.0, 6.0.0, 7.0.0) è **normale** per il registro storico.

## ⚠️ PROBLEMA STRUTTURALE EAS — LEGGERE PRIMA DI PUBBLICARE

**L'ambiente Replit (main agent E build mode) blocca TUTTE le operazioni git**, incluse quelle interne a `eas update`. Questo significa che **EAS non può mai essere aggiornato da questo ambiente**.

### Conseguenza pratica
- Il bundle custom (backend `biker-link.replit.app`) viene aggiornato correttamente.
- I dispositivi che già usano `expo-updates` (EAS) per controllare aggiornamenti **NON vedranno le nuove OTA** perché EAS è fermo all'ultima versione pubblicata con successo (OTA-152).
- I dispositivi su OTA-152 sono bloccati finché non viene installato un nuovo APK.

### Fix strutturale (APK v38) — IMPLEMENTATO (Task #958)
✅ **Implementato**: Backend serve `GET /api/expo-updates` (Expo Updates Protocol v1) e `GET /api/expo-updates/assets/:releaseId`.
✅ **app.json**: `updates.url` → `https://biker-link.replit.app/api/expo-updates`; 1 solo intentFilter (`bikerlink://lastfm-callback`)
✅ **versionCode**: 38, versionName 2.4.0 (build.gradle + app.json aggiornati)
✅ **AndroidManifest.xml**: `EXPO_UPDATE_URL` aggiornato al backend custom; intent filter `data-generated` corretto da `spotify-callback` → `lastfm-callback`
✅ **Build APK v38 inviata**: 2026-04-26 commit bf49d39 — recuperare build ID e APK URL da https://expo.dev/accounts/andreamasteri/projects/bikerlink/builds e aggiornare ota-updates.json → OTA-155 (apkBuildId, apkUrl)

Dopo APK v38 installato sui dispositivi: gli aggiornamenti OTA sono completamente indipendenti da EAS.

### Nel frattempo
- Pubblicare comunque con `publish-ota.sh` — il bundle custom si aggiorna
- I nuovi installati con APK v38 riceveranno tutti gli aggiornamenti via backend custom
- I dispositivi su OTA-152 (APK v37) necessitano di reinstallare APK v38 manualmente

## 🏗️ Build APK — default dimagrito (Task #1017)

Da Task #1017 in poi, **ogni build APK BikerLink usa il profilo dimagrito di default**:

- ABI: **solo `arm64-v8a`** (telefoni Android moderni dal 2017 in poi)
- New Architecture: **abilitata** (`newArchEnabled=true`)
- ProGuard/R8: **abilitato** (`enableMinifyInReleaseBuilds=true`)
- Shrink Resources: **abilitato** (`enableShrinkResourcesInReleaseBuilds=true`)
- Hermes: **abilitato**
- **Dimensione attesa**: ~45-55 MB (vs 135 MB delle vecchie APK universali a 4 ABI)

### Comando standard (default = dimagrito)
```bash
touch .local/apk-build-authorized
bash scripts/build-apk.sh             # → profilo release-apk (APK arm64 dimagrita)
bash scripts/build-apk.sh release-apk # equivalente esplicito
bash scripts/build-apk.sh production  # SOLO per AAB Play Store (non APK)
```

### Profili EAS
- ✅ **`release-apk`** — APK arm64-v8a + NewArch + ProGuard/R8 (default per "builda APK")
- ✅ **`production`** — AAB per Play Store (invariato, distribuzione store)
- ❌ **`preview`** — RIMOSSO da `eas.json` (Task #1017). Lo script blocca con messaggio chiaro qualsiasi tentativo di lanciare `bash scripts/build-apk.sh preview`.

### Configurazione persistente (bare workflow)
Dato che `android/` è committato nel repo, il restringimento ABI è applicato in:
- `android/gradle.properties` → `reactNativeArchitectures=arm64-v8a`
- `android/app/build.gradle` → `ndk { abiFilters "arm64-v8a" }`
- `app.json` plugins → `expo-build-properties` con `android.newArchEnabled=true` + ProGuard/Shrink + `buildArchs: ["arm64-v8a"]` (per coerenza con eventuale futuro prebuild)

### Conseguenza sul profilo `production` (AAB Play Store)
Poiché il restringimento ABI vive nei file Android committati, **anche l'AAB del profilo `production` sarà arm64-only**. È intenzionale e accettabile: Google Play Store richiede 64-bit dal 2019, Android 14 (ottobre 2023) deprecate il supporto 32-bit, e l'AAB di Play Store gestisce comunque lo splitting automatico per ABI. Per riabilitare armeabi-v7a sull'AAB in futuro occorre parametrizzare `abiFilters` via gradle property (es. `-PandroidAbiFilters=...`) nel `gradleCommand` del profilo production di `eas.json`.

### Guardia config-based (anti-regressione)
`scripts/build-apk.sh` esegue prima di ogni build EAS un'assertion che verifica i tre punti di configurazione (`gradle.properties`, `build.gradle`, plugin `expo-build-properties` in `app.json`). Se qualcuno regredisce uno qualsiasi di questi file a multi-ABI, la build viene bloccata con messaggio chiaro — la guardia è indipendente dal nome del profilo, quindi protegge anche da modifiche accidentali a `release-apk` in `eas.json`.

## ⚠️ Nota: APK build ID e URL dopo --no-wait
`scripts/build-apk.sh` invia la build con `--no-wait` e **non cattura** il build ID restituito da EAS. Dopo ogni nuova build APK, recuperare manualmente il build ID e l'URL del file `.apk` da https://expo.dev/accounts/andreamasteri/projects/bikerlink/builds e aggiornarli in `ota-updates.json` nella entry più recente del ciclo corrente:
```json
"apkBuildId": "<UUID-da-EAS-dashboard>",
"apkUrl": "https://expo.dev/artifacts/eas/<hash>.apk"
```
Questo previene lacune documentali come quella di APK v37 (build ID mai registrato).

## Numerazione versioni
| OTA | Script version | Stato EAS |
|-----|---------------|-----------|
| 150 | 1.150.0       | superseded
| 151 | 1.151.0       | superseded
| 152 | 1.152.0       | ← ultima su EAS (!)
| 153 | 1.153.0       | EAS fallito (git lock)
| 154 | 1.154.0       | ← corrente (solo backend custom, EAS bloccato)
| 155 | 1.155.0       | superseded
| 156 | 1.156.0       | corrente (solo backend custom, EAS bloccato)

## Cicli precedenti (storico)
- Ciclo 2.x: OTA 1–21, 23 (APK versionCode 4–6, rv 2.0.0)
- Ciclo 3.x: OTA 24–36 (APK versionCode 8–9, rv 3.0.0)
- Ciclo 4.x: OTA 37–40 (APK versionCode 10, rv 4.0.0)
- Ciclo 5.x: OTA 41 (APK versionCode 11, rv 5.0.0) — DEPRECATO (crash expo-location plugin)
- Ciclo 6.x: OTA 42–43 (APK versionCode 12, rv 6.0.0) — OBSOLETO (utenti devono aggiornare APK)
- Ciclo 7.x: OTA 44–156 (APK versionCode 13→38, rv 7.0.0) — CHIUSO
  - APK v37: STABILE — versionName 2.3.0 + OTA 151–154
  - APK v38: STABILE — versionName 2.4.0, buildId: 7ecd4368-9640-4200-88e5-c33b902a7edc, APK: https://expo.dev/artifacts/eas/gEaBaW4hnhupnDP5CpYW1m.apk, updates.url→backend custom + OTA 155–156
- Ciclo 8.x: OTA 1–13 (APK versionCode 39–41, rv 8.0.0) ← CORRENTE (V3)
  - APK v39: STABILE — versionName 3.0.0, buildId: b167f108-813d-4981-893a-2896c0268a5b (completata 2026-04-26T12:35Z), APK: https://expo.dev/artifacts/eas/nUADFAf6ddBUzcbZMjKBxR.apk
  - APK v40: STABILE — versionName 3.0.0, buildId: ba5205c6-0cc8-41ce-ba8c-8e68a117dabf, APK: https://expo.dev/artifacts/eas/p1rG9wd7hZg7oPG1WEc4kM.apk
  - APK v41: STABILE — versionName 3.0.0, buildId: e03f51d8-9f2b-496f-bba2-e0fe90b69fb7, APK: https://expo.dev/artifacts/eas/tG5zT8yATySZWJVk7VLbLF.apk (completata 2026-04-27) — arm64-v8a + NewArch + expo-audio (expo-av rimosso Task #1052) + OTA-13

## ⚠️ ANALISI ARCHITETTURA (DEFINITIVA)
React Native 0.82+ ha rimosso il supporto Old Architecture. Il flag newArchEnabled=false
genera solo un WARNING e viene IGNORATO (hardcoded IS_NEW_ARCHITECTURE_ENABLED=true in CMake).
APK v10 (ultima stabile) funzionava CON newArchEnabled=true — la New Architecture era già attiva.
I crash erano causati da librerie incompatibili, NON dalla New Architecture stessa:
- react-native-maps 1.18.0: incompatibile con New Arch (causa crash runtime)
- react-native-reanimated 3.x: incompatibile con RN 0.83.4 (CMake build fail)
- expo-location plugin in app.json: causa crash all'avvio (background location aggressivo)

## REGOLA CRITICA — BARE WORKFLOW
Il progetto ha `android/` committato → bare workflow. Modificare SEMPRE i file Android direttamente:
- **Architecture**: `android/gradle.properties` → `newArchEnabled=true` (default EAS, come v10)
- **versionCode**: `android/app/build.gradle` → `versionCode` (E anche app.json per consistenza)
- **⚠️ CRITICO — runtimeVersion**: `android/app/src/main/res/values/strings.xml` → `expo_runtime_version` DEVE essere uguale a `runtimeVersion` in app.json (attuale: "8.0.0" ciclo V3). EAS NON aggiorna questo file automaticamente in bare workflow. Se non corrisponde → CRASH all'avvio garantito.
- **⚠️ CRITICO — AndroidManifest**: NON includere `ACCESS_BACKGROUND_LOCATION` in `android/app/src/main/AndroidManifest.xml` a meno che il background location sia implementato completamente e correttamente. Causa crash su Android 12+.

## VERSIONI LIBRERIE CERTIFICATE (v19, identico a v10)
- react-native-maps: **1.27.2** (CERTIFICATA — compatibile RN 0.83.4 + New Arch, usata in v10)
- react-native-reanimated: **~4.2.1** (CERTIFICATA — compila con RN 0.83.4 via CMake, usata in v10)
- NON usare react-native-maps < 1.27.x → incompatibile con New Architecture (sempre attiva in RN 0.82+)
- NON usare react-native-reanimated < 4.x → non compila con RN 0.83.4 (CMake hermes-engine non trovato)
- NON aggiungere "expo-location" ai plugins di app.json → causa crash all'avvio (background location)
- NON aggiungere react-native-maps ai plugins di app.json → crash garantito

## Output di riferimento (OTA-43 — esempio reale)
```
✅ Release OTA v1.43.0 pubblicata con successo!
Commit hash      : 450497bba166b168f7e0e0997ed752d7d4c1df51
Release ID       : 7749c083-95a4-4b65-bedf-e725eb7dcc64
Bundle URL       : private/ota/ota-1.43.0-1776151386751.js
Versione att.    : 1.43.0
EAS Status       : pubblicato
EAS Update Group : bea3463e-a8dd-4d9f-b170-e445d40787f1
EAS Android ID   : 019d8ae0-0438-71af-a978-22f784f042f1
EAS Dashboard    : https://expo.dev/accounts/andreamasteri/projects/bikerlink/updates/bea3463e-a8dd-4d9f-b170-e445d40787f1
```
