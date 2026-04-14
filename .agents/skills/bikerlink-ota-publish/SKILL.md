---
name: bikerlink-ota-publish
description: Procedura completa per pubblicare un aggiornamento OTA su BikerLink (Expo/Android). Usa questa skill ogni volta che l'utente chiede di pubblicare una OTA, rilasciare un aggiornamento, distribuire modifiche agli utenti Android, o aggiornare il numero OTA.
---

# BikerLink — Pubblicazione OTA

## Contesto fisso
- **Piattaforma**: Android only (iOS non supportato per OTA)
- **Canale EAS**: `preview`
- **Runtime Version**: `7.0.0` (ciclo corrente, APK v14)
- **APK corrente**: versionCode 14 — IN BUILD (v13 fallback: https://expo.dev/artifacts/eas/9fHiqyw2aGaDokjsFAT4jf.apk)
- **Utenti**: su Android fisico via APK — NON usano il dev server
- **Admin email**: `admin@bikerlink.it`
- **Admin password**: secret `BIKERLINK_ADMIN_PASSWORD`
- **Backend produzione**: `biker-link.replit.app`

## Regola critica
⛔ **MAI** eseguire `npx eas-cli` direttamente.  
✅ Usare **sempre** `bash scripts/publish-ota.sh` — gestisce bundle, upload, backend custom e EAS in sequenza.

## File chiave
- `app/(tabs)/profile.tsx` — contiene `CURRENT_OTA_NUMBER` (riga ~142)
- `ota-updates.json` — registro storico di tutte le OTA
- `scripts/publish-ota.sh` — script di pubblicazione completo
- `scripts/validate-ota.sh` — validatore pre/post pubblicazione

## Procedura completa

### PASSO 1 — Determinare il numero OTA
Leggere l'ultima entry del ciclo 7.x in `ota-updates.json` e prendere `updateNumber + 1`.
```bash
# Esempio: se l'ultima è 43, la nuova sarà 44
```

### PASSO 2 — Ottenere l'hash git corrente
```bash
git rev-parse HEAD
```

### PASSO 3 — Aggiornare `CURRENT_OTA_NUMBER` in profile.tsx
Trovare e modificare la riga:
```typescript
const CURRENT_OTA_NUMBER = <VECCHIO>;  // → <NUOVO>
```
Il commento sopra va tenuto generico:
```typescript
// ⚠️ CHECKLIST RELEASE: aggiornare questo numero PRIMA di ogni pubblicazione OTA
// Ciclo 7.0.0 — APK v13 — aggiornare ad ogni nuova OTA pubblicata
const CURRENT_OTA_NUMBER = 44;
```

### PASSO 4 — Aggiungere entry in `ota-updates.json`
Marcare la entry precedente come `"status": "superseded"`, poi aggiungere in fondo:
```json
{
  "updateNumber": 44,
  "cycle": "7.x",
  "channel": "preview",
  "platform": "android",
  "runtimeVersion": "7.0.0",
  "jsEngine": "hermes",
  "message": "OTA-44 rv7.0.0: <descrizione breve>",
  "note": "<note dettagliate sui task inclusi. CURRENT_OTA_NUMBER=44.>",
  "releaseId": null,
  "bundleUrl": null,
  "updateGroupId": null,
  "androidUpdateId": null,
  "iosUpdateId": null,
  "commitBase": "<hash git completo da passo 2>",
  "easDashboard": null,
  "apkBuildId": null,
  "apkVersionCode": 13,
  "apkUrl": null,
  "status": "pending"
}
```
⚠️ I campi sconosciuti (`releaseId`, `bundleUrl`, ecc.) devono essere `null`, **non** la stringa `"PENDING"`.

### PASSO 5 — Eseguire lo script di pubblicazione
```bash
BIKERLINK_ADMIN_EMAIL="admin@bikerlink.it" \
BIKERLINK_ADMIN_PASSWORD="$BIKERLINK_ADMIN_PASSWORD" \
bash scripts/publish-ota.sh "1.44.0" "OTA-44: <messaggio di release>"
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

## Numerazione versioni
| OTA | Script version |
|-----|---------------|
| 43  | 1.43.0        |
| 44  | 1.44.0        |
| 45  | 1.45.0        | ← pubblicata
| 46  | 1.46.0        |

## Cicli precedenti (storico)
- Ciclo 2.x: OTA 1–21, 23 (APK versionCode 4–6, rv 2.0.0)
- Ciclo 3.x: OTA 24–36 (APK versionCode 8–9, rv 3.0.0)
- Ciclo 4.x: OTA 37–40 (APK versionCode 10, rv 4.0.0)
- Ciclo 5.x: OTA 41 (APK versionCode 11, rv 5.0.0) — DEPRECATO (crash expo-location plugin)
- Ciclo 6.x: OTA 42–43 (APK versionCode 12, rv 6.0.0) — OBSOLETO (utenti devono aggiornare APK)
- Ciclo 7.x: OTA 44–45+ (APK versionCode 13→17, rv 7.0.0) ← CORRENTE
  - APK v13: FAILED (react-native-maps 1.27.2 — causa esatta sconosciuta, diagnosi errata al momento)
  - APK v14: FAILED (newArchEnabled=true + react-native-maps 1.18.0 → incompatibili, fix in app.json ignorato)
  - APK v15: FAILED (fix newArchEnabled=false in app.json → ignorato, bare workflow usa gradle.properties)
  - APK v16: FAILED (newArchEnabled=false + react-native-reanimated 4.2.3 → crash, Reanimated v4 richiede New Arch)
  - APK v17: FAILED (New Architecture causa crash — decisione finale: Old Arch per sempre)
  - APK v18: IN BUILD (build ID: c4ff4d58-54b5-4504-8e6b-808e81f8d39f)
    newArchEnabled=false DEFINITIVO. Reanimated 4.2.3→3.19.5. maps 1.27.2→1.18.0. versionCode 18.

## ⚠️ REGOLA ASSOLUTA — NEW ARCHITECTURE PROIBITA
newArchEnabled=false SEMPRE. Mai cambiarlo a true. Causa crash confermato su v14, v16, v17.
Qualunque libreria che richieda New Architecture è INCOMPATIBILE con BikerLink.

## REGOLA CRITICA — BARE WORKFLOW
Il progetto ha `android/` committato → bare workflow. Le impostazioni di `app.json` per native config (newArchEnabled, ecc.) vengono **IGNORATE** da EAS. Modificare SEMPRE i file Android direttamente:
- **New Architecture**: `android/gradle.properties` → `newArchEnabled` (SEMPRE false)
- **versionCode**: `android/app/build.gradle` → `versionCode` (E anche app.json per consistenza)

## VERSIONI LIBRERIE CERTIFICATE (Old Architecture)
- react-native-maps: **1.18.0** (PINNATO — unica versione Old Arch + Expo Go compatibile)
- react-native-reanimated: **~3.19.5** (ultima v3 stabile, supporta Old Arch)
- NON usare react-native-maps > 1.20.x → richiede New Architecture
- NON usare react-native-reanimated >= 4.x → richiede New Architecture
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
