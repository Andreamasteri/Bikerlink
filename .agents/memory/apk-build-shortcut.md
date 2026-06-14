---
name: "Vai con la build" — procedura APK completa
description: Quando l'utente dice "Vai con la build" (o simili), eseguire esattamente questi passi nell'ordine indicato.
---

# "Vai con la build" — procedura APK

## Trigger
Frasi come: "Vai con la build", "Fai la build", "Build APK", "Lancia la build".

## Passi in ordine

### 1. Leggi le versioni attuali
```bash
node -e "const a=require('./app.json'); console.log(a.expo.version, a.expo.android?.versionCode, a.expo.runtimeVersion)"
grep -E "versionCode|versionName" android/app/build.gradle | head -5
```

### 2. Proponi il nuovo versionCode e version
Schema versioning: `<versionCode>.<ciclo_runtime>.<ota_inglobate>`
- `versionCode` → incrementa di 1 rispetto al valore attuale in app.json
- `version` → `<nuovo_versionCode>.<ciclo_runtime>.<ota_inglobate>` (es. 56.10.88)
- ATTENZIONE: ordine è versionCode · ciclo_runtime · ota — NON versionCode · ota · ciclo
- `runtimeVersion` → invariato a meno che non sia cambiata la runtime

Chiedi conferma all'utente prima di procedere con il bump.

### 3. Aggiorna app.json e build.gradle insieme

In `app.json` ci sono DUE campi separati da aggiornare:
1. `expo.version` → nuova stringa versione (es. `"56.10.88"`)
2. `expo.android.versionCode` → nuovo intero (es. `56`)

In `android/app/build.gradle`:
3. `versionCode` → stesso intero (es. `56`)
4. `versionName` → stessa stringa (es. `"56.10.88"`)

⚠️ ERRORE COMUNE: aggiornare solo `expo.version` dimenticando `expo.android.versionCode` → il typecheck fallisce con "versionCode disallineato".

Tutti e 4 i valori DEVONO essere allineati prima di lanciare la build.

### 4. Lancia la build EAS

## ⛔ Esecuzione in background — VIETATA

**NON usare `&`, `nohup`, né avviare il comando tramite un workflow in background.**
La sandbox Replit killa i processi background prima che completino l'handshake con EAS → log vuoto → build non inviata, zero feedback di errore.
Il comando DEVE girare in foreground nel tool `bash` con timeout esplicito.

**Checklist obbligatoria prima di eseguire:**
- [ ] Il comando viene eseguito in foreground (nessun `&`, nessun workflow background)
- [ ] ⛔ `timeout` del tool bash DEVE essere `600000ms` — non il default (30s). L'upload è ~127 MB e richiede 2–3 minuti anche con connessione veloce.

> **Guardia automatica:** `scripts/eas.sh` stampa un avviso boxed BEN VISIBILE su stderr ogni volta che il primo argomento è `build`. Se il warning non compare nell'output, il comando non è stato eseguito dal wrapper corretto.

```bash
GIT_INDEX_FILE=/tmp/eas-build-index bash scripts/eas.sh build \
  --platform android \
  --profile release-apk \
  --non-interactive \
  --no-wait
```

> **Nota su `--no-wait`:** questo flag dice a EAS di **non aspettare il risultato della compilazione in cloud** (che richiede 10–20 min). NON influisce sul lancio locale — il comando locale deve comunque girare fino al completamento dell'upload (~2–3 min, 127 MB). Se il processo viene interrotto prima di aver stampato l'URL della dashboard EAS, la build non è stata inviata.

### 5. Comunica all'utente
- Conferma che la build è stata inviata ad EAS
- Fornisci il link alla dashboard EAS (viene stampato nel log)
- Ricorda che `--no-wait` significa che la compilazione gira in cloud; può scaricarla quando è pronta

## Profilo EAS usato
- Profile: `release-apk`
- Platform: Android only
- BuildType: APK (non AAB)
- Channel: production
- CredentialsSource: remote
- GradleCommand: `:app:assembleRelease`
- ABI: arm64-v8a (hardcoded in build.gradle)

## Workaround obbligatorio
Senza `GIT_INDEX_FILE=/tmp/eas-build-index` il comando fallisce con exit 254
perché la sandbox Replit blocca `.git/index.lock`. Questo prefisso è SEMPRE necessario.

## NON fare
- Non usare `--profile production` (genera AAB per il Play Store, non APK)
- Non usare `--profile preview` (channel staging, non production)
- Non modificare eas.json
- Non eseguire `npx expo build` (deprecato)
- Non eseguire `eas submit` direttamente (non richiesto dall'utente)

## Formula versione OTA — automatica
`scripts/publish-ota.sh` legge `versionCode` e `runtimeVersion` da `app.json` **a runtime** — non hardcoda i numeri.
Basta aggiornare `app.json` + `build.gradle` per il bump APK; lo script OTA si adegua automaticamente.
Non toccare la formula VERSION nello script: è già dinamica.

**Why:** L'utente installa l'APK direttamente sui propri dispositivi via EAS internal distribution.
Non usa il Play Store per i cicli di test/sviluppo.
