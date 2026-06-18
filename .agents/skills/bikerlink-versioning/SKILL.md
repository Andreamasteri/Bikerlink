---
name: bikerlink-versioning
description: Convenzione di versioning semantico BikerLink. Leggere PRIMA di modificare versioni in app.json, build.gradle, strings.xml o publish-ota.sh.
---

# BikerLink — Versioning Semantico

## ⛔ REGOLA OBBLIGATORIA

Ogni agente deve leggere questa skill **prima** di toccare uno qualsiasi di questi file:
- `app.json` (campi `version`, `versionCode`, `runtimeVersion`)
- `android/app/build.gradle` (campi `versionCode`, `versionName`)
- `android/app/src/main/res/values/strings.xml` (campo `expo_runtime_version`)
- `scripts/publish-ota.sh` (formula versione OTA)

---

## Formato versione

```
<build>.<ota_inglobata>.<ciclo_ota>
```

### Significato di ogni numero

| Posizione | Nome | Significato | Cambia quando |
|---|---|---|---|
| `<build>` | versionCode APK | Numero intero incrementale dell'APK pubblicato su Play Store | Viene pubblicato un nuovo APK nativo (nuova build EAS) |
| `<ota_inglobata>` | OTA inglobata | Numero dell'ultima OTA inclusa in questo APK | Viene pubblicato un nuovo APK che porta dentro le OTA accumulate |
| `<ciclo_ota>` | Ciclo OTA | Numero del ciclo `runtimeVersion` (es. `10.0.0` → `10`) | Cambia `runtimeVersion` in `app.json` (breaking change nativo) |

### Esempio di lettura

`48.13.10` significa:
- **APK build 48** (versionCode 48 su Play Store)
- **OTA-13 inglobata** (l'ultimo OTA del ciclo precedente era il 13)
- **Ciclo 10** (runtimeVersion `10.0.0`)

### Versione OTA dentro il ciclo

Le OTA pubblicate durante il ciclo 10.x avranno versione `48.<updateNumber>.10`:
- OTA-1 → `48.1.10`
- OTA-2 → `48.2.10`
- OTA-3 → `48.3.10`

### ⚠️ Due contatori OTA — non confonderli

Nel codebase esistono **due numerazioni OTA con significati completamente diversi**:

| Contatore | File | Valore tipico | Significato |
|-----------|------|---------------|-------------|
| `APPLIED_OTA_NUMBER` | `constants/buildInfo.ts` | es. 85 | **Globale sequenziale** — conta tutte le OTA di tutti i cicli APK mai pubblicati. Usato solo internamente per tracciare l'aggiornamento sul dispositivo. |
| OTA nel ciclo corrente | `versionName` (posizione centrale) | es. 10 in `55.10.10` | **Per-ciclo** — ricomincia da 1 ad ogni nuovo APK. È il numero che appare nel messaggio OTA, nel `versionName`, e nella comunicazione all'utente. |

**Regola pratica**: per sapere quale OTA pubblicare, leggi il `versionName` corrente da `app.json` e incrementa il numero centrale. **Non usare `APPLIED_OTA_NUMBER`** come numero OTA da comunicare — porta a numeri errati (es. OTA-86 invece di OTA-11).

---

## Consistenza tra file (CRITICO — bare workflow)

Il progetto usa il bare workflow (directory `android/` committata). I tre file devono essere **sempre allineati**:

| File | Campo | Valore corrente |
|---|---|---|
| `app.json` | `expo.version` | `67.10.103` |
| `app.json` | `expo.android.versionCode` | `67` |
| `app.json` | `expo.runtimeVersion` | `10.0.0` |
| `android/app/build.gradle` | `versionCode` | `67` |
| `android/app/build.gradle` | `versionName` | `"67.10.103"` |
| `android/app/src/main/res/values/strings.xml` | `expo_runtime_version` | `10.0.0` |

⚠️ **Aggiornare sempre tutti e tre i file contemporaneamente.** Un disallineamento causa errori di update check a runtime.

---

## Quando si incrementa cosa

### Nuovo APK (build nativa EAS)

1. Incrementa `versionCode` di 1 in tutti e tre i file
2. Aggiorna `versionName` con il nuovo schema `<build>.<ota_inglobata>.<ciclo>`
3. Se cambia anche `runtimeVersion` (breaking change), aggiorna `expo_runtime_version` in strings.xml e inizia un nuovo ciclo

### Nuova OTA (aggiornamento JS)

Non toccare i file di versione. Lo script `scripts/publish-ota.sh` gestisce tutto automaticamente.
La versione OTA segue la formula `<build>.<updateNumber>.<ciclo>` — lo script legge `BUILD_NUM` e `RUNTIME_VER` dinamicamente da `app.json` a ogni esecuzione.

### Cambio runtimeVersion (breaking change nativo)

1. Aggiorna `runtimeVersion` in `app.json`
2. Aggiorna `expo_runtime_version` in `strings.xml` con lo stesso valore
3. Pubblica un nuovo APK — i client con il vecchio APK non riceveranno le nuove OTA

> `scripts/publish-ota.sh` legge `RUNTIME_VER` dinamicamente da `app.json`: non serve toccare lo script quando cambia il ciclo.

---

## Build Diagnostic (suffisso `D`)

Le build di tipo **diagnostic** sono APK non destinati al Play Store, usati per raccogliere log/telemetria in campo. Hanno una convenzione di versionName dedicata.

### Convenzione

- Al **numero di build** del `versionName` si aggiunge il suffisso letterale `D` — **e solo lì**.
- Il formato diventa: `<build>D.<ota_inglobata>.<ciclo>`
- Il `versionCode` numerico **rimane senza suffisso** (deve restare un intero valido per Android).

### Esempio concreto

Partendo da una build normale `70.10.114`, la corrispondente build diagnostic è:

| File | Campo | Valore diagnostic |
|---|---|---|
| `app.json` | `expo.version` | `70D.10.114` |
| `app.json` | `expo.android.versionCode` | `70` (invariato, senza `D`) |
| `android/app/build.gradle` | `versionName` | `"70D.10.114"` |
| `android/app/build.gradle` | `versionCode` | `70` (invariato, senza `D`) |

### Cosa NON cambia rispetto a una build normale

Rispetto allo schema standard, una build diagnostic **non** modifica:

- `versionCode` → resta il numero intero, identico alla build normale corrispondente
- `runtimeVersion` / `expo_runtime_version` → invariati (stesso ciclo OTA)
- contatore OTA (`APPLIED_OTA_NUMBER` in `constants/buildInfo.ts` e OTA per-ciclo) → invariati
- formula di `scripts/publish-ota.sh` → invariata

### ⚠️ Note

- Una build diagnostic **non va pubblicata sul Play Store**.
- Il suffisso `D` è puramente identificativo nel `versionName` per riconoscere a colpo d'occhio una build diagnostic sul dispositivo.

---

## Tabella storica dei cicli

| APK | versionCode | versionName | runtimeVersion | Ciclo | OTA nel ciclo | Note |
|---|---|---|---|---|---|---|
| v43 | 43 | 3.2.0 | 8.0.0 | 8.x | — | Prima build ciclo 8 |
| v44 | 44 | 3.3.0 | 8.0.0 | 8.x | — | Baseline pulita Task #1151 |
| v45 | 45 | 3.4.0 | 8.0.0 | 8.x | OTA 1–29 | Ultimo APK ciclo 8 — ciclo CHIUSO a OTA-29 |
| v46 | 46 | 46.29.9 | 9.0.0 | 9.x | OTA 1–13 | Primo APK schema semantico — ciclo CHIUSO a OTA-13 |
| v47 | 47 | 47.2.9 | 9.0.0 | 9.x | OTA 1–13 | Ultimo APK ciclo 9 — SDK 56 migration |
| v48 | 48 | 48.13.10 | 10.0.0 | 10.x | — | Primo APK ciclo 10, SDK 56 |
| v49 | 49 | 49.0.10 | 10.0.0 | 10.x | — | SDK 56 compliance, New Arch, arm64 — standalone (no OTA) |
| v50 | 50 | 50.0.10 | 10.0.0 | 10.x | OTA-1 | OTA attiva, staged rollout, arm64 |
| v51 | 51 | 51.1.10 | 10.0.0 | 10.x | OTA-1 inglobata | Fix mappa/offline/RoadHazards/profilo |
| v52 | 52 | 52.3.10 | 10.0.0 | 10.x | OTA-3 inglobata | Fix mappa nera Android (OTA2), pulsante Forza OTA (OTA3), fix mutation GraphQL promozione staging→production |
| v53 | 53 | 53.1.10 | 10.0.0 | 10.x | OTA-1 inglobata | Fix sistema mappe (tile ID, normalizeTileId, OpenLayers type), fix admin DB Debug/Dimensioni, SQL injection visitatori |
| v54 | 54 | 54.10.36 | 10.0.0 | 10.x | OTA-10 inglobata | Task #3124 rotazione mappa due dita, fix vari fino a #3124 |
| v55 | 55 | 55.10.10 | 10.0.0 | 10.x | OTA-10 inglobata | — |
| v56–v66 | 56–66 | — | 10.0.0 | 10.x | — | Build intermedie ciclo 10 |
| v67 | 67 | 67.10.103 | 10.0.0 | 10.x | OTA-10 inglobata | **Corrente** — debug-apk build in corso |

> **Cicli precedenti** (schema vecchio `major.minor.patch` senza significato semantico):
> - Ciclo 2.x: rv 2.0.0
> - Ciclo 3.x: rv 3.0.0
> - Ciclo 4.x: rv 4.0.0
> - Ciclo 5.x: rv 5.0.0
> - Ciclo 6.x: rv 6.0.0
> - Ciclo 7.x: rv 7.0.0
> - Ciclo 8.x: rv 8.0.0 — ultimo prima dell'adozione dello schema semantico (Task #1525)
> - Ciclo 9.x: rv 9.0.0 — CHIUSO a OTA-13 (Task #1801 SDK 56 migration)

---

## Formula in publish-ota.sh

La versione OTA in `scripts/publish-ota.sh` è calcolata **dinamicamente** a ogni esecuzione:

```bash
# Legge versionCode e ciclo runtimeVersion direttamente da app.json — nessun numero hardcoded
BUILD_NUM=$(node -e "const a=require('./app.json'); console.log(a.expo.android.versionCode || 49)")
RUNTIME_VER=$(node -e "const a=require('./app.json'); const rv=a.expo.runtimeVersion||'10.0.0'; console.log(rv.split('.')[0])")
VERSION="${BUILD_NUM}.${NEXT_OTA}.${RUNTIME_VER}"
```

✅ `scripts/publish-ota.sh` esiste ed è funzionante. Pubblica su canale `staging`, registra la release nel database, e attende l'approvazione admin prima di promuovere su `production`.

**Non è necessario aggiornare lo script dopo un nuovo APK o un cambio di ciclo**: legge sempre i valori correnti da `app.json` a runtime.

---

## File da aggiornare a ogni build APK

Checklist rapida per i task di bump versione:

- [ ] `app.json` → `version`, `android.versionCode`, `runtimeVersion`
- [ ] `android/app/build.gradle` → `versionCode`, `versionName`
- [ ] `android/app/src/main/res/values/strings.xml` → `expo_runtime_version`
- [ ] `constants/buildInfo.ts` → `RELEASE_NUMBER` (allinearlo al nuovo versionCode)
- [ ] `.agents/skills/bikerlink-ota-publish/SKILL.md` → sezione "Contesto fisso" e "Cicli precedenti"
- [ ] Questa skill → tabella storica dei cicli
- [ ] **Se build diagnostic**: `versionName` usa il formato `<build>D.<ota>.<ciclo>` (es. `70D.10.114`) in `app.json` e `build.gradle`; il `versionCode` resta intero senza `D` (vedi sezione "Build Diagnostic")

> `scripts/publish-ota.sh` **non va toccato**: legge `versionCode` e `runtimeVersion` dinamicamente da `app.json` a ogni esecuzione OTA.
