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
| `<ciclo_ota>` | Ciclo OTA | Numero del ciclo `runtimeVersion` (es. `9.0.0` → `9`) | Cambia `runtimeVersion` in `app.json` (breaking change nativo) |

### Esempio di lettura

`46.29.9` significa:
- **APK build 46** (versionCode 46 su Play Store)
- **OTA-29 inglobata** (l'ultimo OTA del ciclo precedente era il 29)
- **Ciclo 9** (runtimeVersion `9.0.0`)

### Versione OTA dentro il ciclo

Le OTA pubblicate durante il ciclo 9.x avranno versione `46.<updateNumber>.9`:
- OTA-30 → `46.30.9`
- OTA-31 → `46.31.9`
- OTA-32 → `46.32.9`

---

## Consistenza tra file (CRITICO — bare workflow)

Il progetto usa il bare workflow (directory `android/` committata). I tre file devono essere **sempre allineati**:

| File | Campo | Valore corrente |
|---|---|---|
| `app.json` | `expo.version` | `46.29.9` |
| `app.json` | `expo.android.versionCode` | `46` |
| `app.json` | `expo.runtimeVersion` | `9.0.0` |
| `android/app/build.gradle` | `versionCode` | `46` |
| `android/app/build.gradle` | `versionName` | `"46.29.9"` |
| `android/app/src/main/res/values/strings.xml` | `expo_runtime_version` | `9.0.0` |

⚠️ **Aggiornare sempre tutti e tre i file contemporaneamente.** Un disallineamento causa errori di update check a runtime.

---

## Quando si incrementa cosa

### Nuovo APK (build nativa EAS)

1. Incrementa `versionCode` di 1 in tutti e tre i file
2. Aggiorna `versionName` con il nuovo schema `<build>.<ota_inglobata>.<ciclo>`
3. Se cambia anche `runtimeVersion` (breaking change), aggiorna `expo_runtime_version` in strings.xml e inizia un nuovo ciclo

### Nuova OTA (aggiornamento JS)

Non toccare i file di versione. Lo script `scripts/publish-ota.sh` gestisce tutto automaticamente.
La versione OTA segue la formula `<build>.<updateNumber>.<ciclo>` (hardcodata nello script).

### Cambio runtimeVersion (breaking change nativo)

1. Aggiorna `runtimeVersion` in `app.json`
2. Aggiorna `expo_runtime_version` in `strings.xml` con lo stesso valore
3. Aggiorna la formula in `publish-ota.sh` (il terzo numero del formato versione OTA)
4. Pubblica un nuovo APK — i client con il vecchio APK non riceveranno le nuove OTA

---

## Tabella storica dei cicli

| APK | versionCode | versionName | runtimeVersion | Ciclo | OTA nel ciclo | Note |
|---|---|---|---|---|---|---|
| v43 | 43 | 3.2.0 | 8.0.0 | 8.x | — | Prima build ciclo 8 |
| v44 | 44 | 3.3.0 | 8.0.0 | 8.x | — | Baseline pulita Task #1151 |
| v45 | 45 | 3.4.0 | 8.0.0 | 8.x | OTA 1–29 | Ultimo APK ciclo 8 — ciclo CHIUSO a OTA-29 |
| v46 | 46 | 46.29.9 | 9.0.0 | 9.x | OTA 30+ | **Corrente** — primo APK con schema semantico |

> **Cicli precedenti** (schema vecchio `major.minor.patch` senza significato semantico):
> - Ciclo 2.x: rv 2.0.0
> - Ciclo 3.x: rv 3.0.0
> - Ciclo 4.x: rv 4.0.0
> - Ciclo 5.x: rv 5.0.0
> - Ciclo 6.x: rv 6.0.0
> - Ciclo 7.x: rv 7.0.0
> - Ciclo 8.x: rv 8.0.0 — ultimo prima dell'adozione dello schema semantico (Task #1525)

---

## Formula in publish-ota.sh

La riga che calcola la versione OTA in `scripts/publish-ota.sh`:

```bash
# Formato versione OTA: <build>.<updateNumber>.<ciclo_ota>
# 46 = versionCode APK corrente, NEXT_OTA = numero progressivo OTA nel ciclo, 9 = ciclo runtimeVersion (9.0.0)
local VERSION="46.${NEXT_OTA}.9"
```

Quando viene pubblicato un nuovo APK con un nuovo ciclo, aggiornare:
- Il primo numero (`46` → nuovo versionCode)
- Il terzo numero (`9` → numero del nuovo ciclo runtimeVersion)
- Il commento sopra la riga

---

## File da aggiornare a ogni build APK

Checklist rapida per i task di bump versione:

- [ ] `app.json` → `version`, `android.versionCode`, `runtimeVersion`
- [ ] `android/app/build.gradle` → `versionCode`, `versionName`
- [ ] `android/app/src/main/res/values/strings.xml` → `expo_runtime_version`
- [ ] `scripts/publish-ota.sh` → formula `VERSION` (primo e terzo numero)
- [ ] `.agents/skills/bikerlink-ota-publish/SKILL.md` → sezione "Contesto fisso" e "Cicli precedenti"
- [ ] Questa skill → tabella storica dei cicli
