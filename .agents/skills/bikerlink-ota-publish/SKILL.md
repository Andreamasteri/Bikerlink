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

## Contesto fisso
- **Piattaforma**: Android only (iOS non supportato per OTA)
- **Canale EAS**: `preview`
- **Runtime Version**: `7.0.0` (ciclo corrente, APK v37)
- **APK corrente**: versionCode **37**, versionName **2.3.0** (build EAS: non catturato — inviato con --no-wait, apkUrl: n/d. Consultare https://expo.dev/accounts/andreamasteri/projects/bikerlink/builds per recuperare il build ID reale)
- **OTA corrente**: OTA-152 (ultima stabile, pubblicata 2026-04-25)
- **Utenti**: su Android fisico via APK — NON usano il dev server
- **Admin email**: `admin@bikerlink.it`
- **Admin password**: secret `BIKERLINK_ADMIN_PASSWORD`
- **Backend produzione**: `biker-link.replit.app`

## Regola critica
⛔ **MAI** eseguire `npx eas-cli` direttamente.  
✅ Usare **sempre** `bash scripts/publish-ota.sh` — gestisce bundle, upload, backend custom e EAS in sequenza.

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
7. Pubblicazione aggiornamento su EAS

### PASSO 6 — Aggiornare `ota-updates.json` con gli ID reali
L'output dello script mostra tutti gli ID. Sostituire i `null` con i valori reali:
```json
{
  "releaseId": "<da output: Release ID>",
  "bundleUrl": "<da output: Bundle URL>",
  "updateGroupId": "<da output: EAS Update Group>",
  "androidUpdateId": "<da output: EAS Android ID>",
  "easDashboard": "<da output: EAS Dashboard>",
  "status": "published"
}
```

### PASSO 7 — Validazione finale
```bash
bash scripts/validate-ota.sh
```
Tutti i check devono essere ✔. Il warning sui cicli multipli (2.0.0, 3.0.0, 4.0.0, 5.0.0, 6.0.0, 7.0.0) è **normale** per il registro storico.

## Cosa fare se EAS va in timeout
Lo script lo segnala ma non blocca. Il bundle custom è già attivo. Pubblicare una nuova OTA con numero N+1 alla prossima occasione — **non** eseguire `eas-cli` manualmente.

## ⚠️ Nota: APK build ID e URL dopo --no-wait
`scripts/build-apk.sh` invia la build con `--no-wait` e **non cattura** il build ID restituito da EAS. Dopo ogni nuova build APK, recuperare manualmente il build ID e l'URL del file `.apk` da https://expo.dev/accounts/andreamasteri/projects/bikerlink/builds e aggiornarli in `ota-updates.json` nella entry più recente del ciclo corrente:
```json
"apkBuildId": "<UUID-da-EAS-dashboard>",
"apkUrl": "https://expo.dev/artifacts/eas/<hash>.apk"
```
Questo previene lacune documentali come quella di APK v37 (build ID mai registrato).

## Numerazione versioni
| OTA | Script version |
|-----|---------------|
| 150 | 1.150.0       | ← superseded
| 151 | 1.151.0       | ← superseded
| 152 | 1.152.0       | ← pubblicata (corrente)
| 153 | 1.153.0       |

## Cicli precedenti (storico)
- Ciclo 2.x: OTA 1–21, 23 (APK versionCode 4–6, rv 2.0.0)
- Ciclo 3.x: OTA 24–36 (APK versionCode 8–9, rv 3.0.0)
- Ciclo 4.x: OTA 37–40 (APK versionCode 10, rv 4.0.0)
- Ciclo 5.x: OTA 41 (APK versionCode 11, rv 5.0.0) — DEPRECATO (crash expo-location plugin)
- Ciclo 6.x: OTA 42–43 (APK versionCode 12, rv 6.0.0) — OBSOLETO (utenti devono aggiornare APK)
- Ciclo 7.x: OTA 44–152+ (APK versionCode 13→37, rv 7.0.0) ← CORRENTE
  - APK v13: FAILED (react-native-maps 1.27.2 — causa esatta sconosciuta, diagnosi errata al momento)
  - APK v14: FAILED (newArchEnabled=true + react-native-maps 1.18.0 → incompatibili, fix in app.json ignorato)
  - APK v15: FAILED (fix newArchEnabled=false in app.json → ignorato, bare workflow usa gradle.properties)
  - APK v16: FAILED (newArchEnabled=false + react-native-reanimated 4.2.3 → crash, Reanimated v4 richiede New Arch)
  - APK v17: FAILED (status: failed — causa esatta sconosciuta, ma expo-location plugin presente)
  - APK v18: FAILED (build ID: c4ff4d58) — react-native-reanimated 3.19.5 non compila con RN 0.83.4:
    hermes-engine::libhermes non trovato in CMake (struttura Hermes cambiata in RN 0.76+, Reanimated 3.x non aggiornato)
  - APK v19: FAILED — CRASH avvio: strings.xml expo_runtime_version=4.0.0 (doveva essere 7.0.0) + ACCESS_BACKGROUND_LOCATION in manifest
  - APK v20: FAILED — fix strings.xml runtimeVersion 7.0.0 + rimozione ACCESS_BACKGROUND_LOCATION + rollback completo Task #564
  - APK v21–v27: build successive fino alla versione stabile
  - APK v28: STABILE — background location tracking (Task #607) + OTA 53–62
  - APK v29: STABILE — expo-notifications nativo + versionCode 29 + versionName 1.9.4 (EAS: 2680c671, APK: https://expo.dev/artifacts/eas/5KLcwsgh9jtqLLdNrbxNxg.apk) + OTA 63–67
  - APK v30–v36: build intermedie successive (vedi ota-updates.json per dettagli per ciclo)
  - APK v37: STABILE — versionName 2.3.0, build inviata con --no-wait (build ID non catturato in log; recuperare da https://expo.dev/accounts/andreamasteri/projects/bikerlink/builds) + OTA 151–152 ← APK CORRENTE

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
- **⚠️ CRITICO — runtimeVersion**: `android/app/src/main/res/values/strings.xml` → `expo_runtime_version` DEVE essere uguale a `runtimeVersion` in app.json (attuale: "7.0.0"). EAS NON aggiorna questo file automaticamente in bare workflow. Se non corrisponde → CRASH all'avvio garantito.
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
