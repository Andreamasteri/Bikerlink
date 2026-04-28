---
name: bikerlink-ota-publish
description: Procedura completa per pubblicare un aggiornamento OTA su BikerLink (Expo/Android). Usa questa skill ogni volta che l'utente chiede di pubblicare una OTA, rilasciare un aggiornamento, distribuire modifiche agli utenti Android, o aggiornare il numero OTA.
---

# BikerLink — Pubblicazione OTA

## ⚡ REGOLA FONDAMENTALE — Un comando solo
**Quando l'utente dice "crea l'OTA", "prepara l'OTA", "fai l'OTA" o qualsiasi variante:**
- La pubblicazione è **inclusa automaticamente** — non è opzionale
- **Non chiedere conferma separata** prima di eseguire lo script
- **Non modificare manualmente** `lib/ota.ts` né `ota-updates.json` — lo script lo fa in automatico
- Eseguire un unico comando e attenderne il completamento

## 🚫 EAS UPDATES — DISMESSO (Task #980)
**EAS Updates non è più usato per la delivery OTA.** L'unico canale OTA attivo è il
backend custom `https://biker-link.replit.app/api/expo-updates` (Expo Updates Protocol v1).

- ✅ `eas build` resta attivo per generare APK/AAB.
- ❌ `eas update` / `npx eas-cli update`: **non usare mai.**
- ❌ `app.json` non deve puntare a `u.expo.dev` — la guard blocca la pubblicazione.

## Contesto fisso
- **Piattaforma**: Android only (iOS non supportato per OTA)
- **Runtime Version**: `8.0.0` (ciclo corrente, APK v43) ← CICLO V3
- **APK corrente**: versionCode **43**, versionName **3.2.0** (buildId: `38cb1b32-4316-4f63-9799-1b9ab36888e8`, APK: https://expo.dev/artifacts/eas/81L2RgW8kFuzUiRzACfAEm.apk — STABILE)
- **OTA corrente**: OTA-20 (releaseId: `86e60407-7d8e-4542-9f0d-bf825ec9f517`)
- **Updates URL**: `https://biker-link.replit.app/api/expo-updates`
- **Admin email**: `admin@bikerlink.it`
- **Admin password**: secret `BIKERLINK_ADMIN_PASSWORD`
- **Backend produzione**: `https://biker-link.replit.app`

## Regola critica
⛔ **MAI** eseguire `npx eas-cli update` — EAS Updates è dismesso.
⛔ **MAI** modificare manualmente `lib/ota.ts` o `ota-updates.json` prima dello script.
✅ Usare **sempre** `bash scripts/publish-ota.sh` — tutto è automatico.

## File chiave
- `lib/ota.ts` — contiene `CURRENT_OTA_NUMBER` (aggiornato dallo script)
- `ota-updates.json` — registro OTA attivo (aggiornato dallo script)
- `ota-updates-archive.json` — registro storico cicli 2.x-7.x (solo lettura)
- `scripts/publish-ota.sh` — script di pubblicazione completo (un comando solo)
- `scripts/rollback-ota.sh` — rollback a release storica
- `scripts/validate-ota.sh` — validatore post pubblicazione

---

## 🚀 PROCEDURA — Un comando solo

```bash
BIKERLINK_ADMIN_EMAIL="admin@bikerlink.it" \
BIKERLINK_ADMIN_PASSWORD="$BIKERLINK_ADMIN_PASSWORD" \
bash scripts/publish-ota.sh "Descrizione breve delle modifiche"
```

### Cosa fa lo script automaticamente
1. **Calcola il prossimo updateNumber** da `ota-updates.json` (es. 18→19)
2. **Aggiorna `CURRENT_OTA_NUMBER`** in `lib/ota.ts`
3. **Inserisce entry pending** in `ota-updates.json` con `commitBase = HEAD`
4. **Esporta il bundle** con `expo export --platform android --reset-cache`
5. **Verifica** che `CURRENT_OTA_NUMBER=<N>` sia nel bundle (blocca se errato)
6. **Carica** il bundle su object storage
7. **Si autentica** sul backend di PRODUZIONE (`https://biker-link.replit.app`)
8. **Crea** la release draft e la pubblica
9. **Verifica live** con backoff (max 30s) che la produzione serva il nuovo releaseId
10. **Finalizza** `ota-updates.json` con ID reali e `status: published`

### Rollback automatico
Se qualsiasi passo fallisce:
- `lib/ota.ts` viene ripristinato al numero originale
- `ota-updates.json` viene ripristinato (entry pending rimossa)
- Nessuna modifica permanente rimane in caso di errore

### Versioning automatico
Lo script calcola la versione come `1.<updateNumber>.0` (es. OTA-19 → `1.19.0`).
Non è necessario specificare la versione manualmente.

---

## 🔄 ROLLBACK

Per riattivare una release storica:

```bash
BIKERLINK_ADMIN_EMAIL="admin@bikerlink.it" \
BIKERLINK_ADMIN_PASSWORD="$BIKERLINK_ADMIN_PASSWORD" \
bash scripts/rollback-ota.sh <updateNumber>
```

Esempio (rollback a OTA-17):
```bash
bash scripts/rollback-ota.sh 17
```

Lo script:
1. Trova il `releaseId` di OTA-17 in `ota-updates.json`
2. Chiama `/api/admin/ota/:id/publish` in produzione
3. Aggiorna `ota-updates.json` (corrente → `rolled-back`, target → `published`)
4. Aggiorna `CURRENT_OTA_NUMBER` in `lib/ota.ts`

---

## ✅ VALIDAZIONE POST-PUBBLICAZIONE (opzionale)

```bash
bash scripts/validate-ota.sh
```

Tutti i check devono essere ✔. Nota: `validate-ota.sh` **non viene più eseguito come guard
bloccante prima della pubblicazione** — viene eseguito solo dopo, se si vuole conferma
esplicita. Il publisher ha già il proprio live-check integrato.

---

## ⚠️ PROBLEMA STRUTTURALE EAS — LEGGERE PRIMA DI PUBBLICARE

**L'ambiente Replit (main agent E build mode) blocca TUTTE le operazioni git**, incluse quelle interne a `eas update`. Questo significa che **EAS non può mai essere aggiornato da questo ambiente**.

### Conseguenza pratica
- Il bundle custom (backend `biker-link.replit.app`) viene aggiornato correttamente.
- I dispositivi che già usano `expo-updates` (EAS) per controllare aggiornamenti **NON vedranno le nuove OTA** perché EAS è fermo all'ultima versione pubblicata con successo (OTA-152).
- I dispositivi su OTA-152 sono bloccati finché non viene installato un nuovo APK.

### Fix strutturale (APK v38) — IMPLEMENTATO (Task #958)
✅ Backend serve `GET /api/expo-updates` (Expo Updates Protocol v1).
✅ `app.json`: `updates.url` → `https://biker-link.replit.app/api/expo-updates`
✅ **APK v39+**: aggiornamenti OTA completamente indipendenti da EAS.

---

## 🔍 Pre-Build Change Detector

Prima di ogni build APK, `build-apk.sh` esegue `scripts/pre-build-check.sh`.

```bash
bash scripts/pre-build-check.sh         # solo report
bash scripts/pre-build-check.sh --strict # blocca se ci sono warning
```

Dopo ogni build riuscita, aggiorna la snapshot con:
```bash
bash scripts/save-build-snapshot.sh <BUILD_ID> <APK_URL>
```

---

## 🏗️ Build APK — default dimagrito (Task #1017)

Da Task #1017 in poi, ogni build usa il profilo dimagrito di default:
- ABI: **solo `arm64-v8a`**
- New Architecture: **abilitata**
- ProGuard/R8: **abilitato**

```bash
touch .local/apk-build-authorized
bash scripts/build-apk.sh             # APK arm64 dimagrita
bash scripts/build-apk.sh production  # AAB Play Store
```

---

## 🛠️ Troubleshooting

### Sintomo: utenti vedono `[check/...] Error: Call to function 'ExpoUpdates.checkForUpdateAsync' has been rejected. Failed to check for update.` nel pannello System Monitor (fasi `startup`/`login`/`appstate`/`manual`).

**Causa**: l'endpoint `/api/expo-updates` non sta dichiarando `expo-protocol-version: 0` su tutte le risposte. Quando il client SDK 55 non riceve l'header, assume protocollo v1 strict e si aspetta `multipart/mixed` con directive `noUpdateAvailable`. Trovando un 204/304 vuoto rigetta il check.

**Verifica**:
```bash
# 200 con manifest (deve già funzionare)
curl -i -H "expo-runtime-version: 8.0.0" -H "expo-platform: android" \
  https://biker-link.replit.app/api/expo-updates | grep -i expo-protocol-version

# 204 already-current (il caso che si rompe per primo)
curl -i -H "expo-runtime-version: 8.0.0" -H "expo-platform: android" \
  -H "expo-current-update-id: <ultimo-release-id-attivo>" \
  https://biker-link.replit.app/api/expo-updates | grep -i expo-protocol-version

# 304 etag-match
curl -i -H "expo-runtime-version: 8.0.0" -H "expo-platform: android" \
  -H 'if-none-match: "<ultimo-release-id-attivo>"' \
  https://biker-link.replit.app/api/expo-updates | grep -i expo-protocol-version
```

Tutte e tre le risposte devono contenere `expo-protocol-version: 0`. Se manca su 204 o 304, il fix di Task #1119 (`server/routes.ts` helper `setExpoUpdatesHeaders`) è regredito o non è stato deployato.

## Cicli precedenti (storico)
- Ciclo 2.x: OTA 1–21, 23 (rv 2.0.0)
- Ciclo 3.x: OTA 24–36 (rv 3.0.0)
- Ciclo 4.x: OTA 37–40 (rv 4.0.0)
- Ciclo 5.x: OTA 41 (rv 5.0.0) — DEPRECATO
- Ciclo 6.x: OTA 42–43 (rv 6.0.0) — OBSOLETO
- Ciclo 7.x: OTA 44–156 (rv 7.0.0) — CHIUSO
- **Ciclo 8.x: OTA 1–20 (rv 8.0.0) ← CORRENTE (V3)**
  - APK v41: STABILE — buildId: e03f51d8, APK: https://expo.dev/artifacts/eas/tG5zT8yATySZWJVk7VLbLF.apk
  - APK v43 (3.2.0): STABILE — buildId: 38cb1b32-4316-4f63-9799-1b9ab36888e8, APK: https://expo.dev/artifacts/eas/81L2RgW8kFuzUiRzACfAEm.apk

## REGOLA CRITICA — BARE WORKFLOW
Il progetto ha `android/` committato → bare workflow. Modificare SEMPRE i file Android direttamente:
- **Architecture**: `android/gradle.properties` → `newArchEnabled=true`
- **versionCode**: `android/app/build.gradle` (E anche app.json per consistenza)
- **⚠️ CRITICO — runtimeVersion**: `android/app/src/main/res/values/strings.xml` → `expo_runtime_version` DEVE essere uguale a `runtimeVersion` in app.json
- **⚠️ CRITICO — AndroidManifest**: NON includere `ACCESS_BACKGROUND_LOCATION` senza implementazione completa.

## VERSIONI LIBRERIE CERTIFICATE
- react-native-maps: **1.27.2**
- react-native-reanimated: **~4.2.1**
