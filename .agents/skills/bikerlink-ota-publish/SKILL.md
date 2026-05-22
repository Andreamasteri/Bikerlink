---
name: bikerlink-ota-publish
description: Procedura completa per pubblicare un aggiornamento OTA su BikerLink (Expo/Android). Usa questa skill ogni volta che l'utente chiede di pubblicare una OTA, rilasciare un aggiornamento, distribuire modifiche agli utenti Android, o aggiornare il numero OTA. Trigger espliciti riconosciuti: "vai con l'ota", "fai l'ota", "pubblica ota", "pubblica l'ota", "crea l'OTA", "prepara l'OTA".
---

## ⛔ REGOLA UTENTE — NON eseguire durante un task

**Questa skill NON deve essere eseguita come parte di un task di sviluppo.**

La pubblicazione OTA avviene **esclusivamente su richiesta esplicita dell'utente**, come operazione dedicata e separata da qualsiasi altro lavoro. Se stai lavorando su un task che modifica il codice, **non pubblicare l'OTA al termine del task** — anche se il task riguarda funzionalità legate agli aggiornamenti OTA stessi.

Motivazione: esportare il bundle a fine task rischia di includere commit parziali, conflitti di merge, o codice provvisorio, distribuendo un bundle rotto agli utenti Android (vedi incidente OTA-20).

**Azione corretta**: al termine del task, proponi la pubblicazione OTA come follow-up separato. Aspetta conferma esplicita prima di procedere.

---

# BikerLink — Pubblicazione OTA

## ⚡ REGOLA FONDAMENTALE — Flusso a due stage nel sandbox Replit
**Quando l'utente dice "vai con l'ota", "fai l'ota", "pubblica ota", "pubblica l'ota", "crea l'OTA", "prepara l'OTA", "fai l'OTA" o qualsiasi variante:**
- La pubblicazione è **inclusa automaticamente** — non è opzionale
- **Non chiedere conferma separata** prima di eseguire lo script
- **Non modificare manualmente** `lib/ota.ts` né `ota-updates.json` — lo script lo fa in automatico
- **Nel sandbox Replit** (bash tool ~120s + cgroup reaper): esegui prima `export "msg"`,
  poi in un secondo bash tool esegui `publish`. Vedi la sezione "PROCEDURA" sotto.
- **Solo in terminale long-running (CI, shell desktop)**: puoi usare la modalità legacy
  single-shot `publish-ota.sh "msg"` che fa entrambi gli stage in sequenza.

## 🚫 EAS UPDATES — DISMESSO (Task #980)
**EAS Updates non è più usato per la delivery OTA.** L'unico canale OTA attivo è il
backend custom `https://biker-link.replit.app/api/expo-updates` (Expo Updates Protocol v1).

- ✅ `eas build` resta attivo per generare APK/AAB (vedi sezione "Build APK" sotto).
- ❌ `eas update` / `npx eas-cli update`: **non usare mai.**
- ❌ `app.json` non deve puntare a `u.expo.dev` — la guard blocca la pubblicazione.

### Artefatti EAS ancora presenti nel progetto (intenzionali)

| File / dipendenza | Stato | Motivo |
|---|---|---|
| `eas.json` | ✅ MANTENUTO | Definisce i profili `release-apk` e `production` per `eas build` (APK/AAB) |
| `scripts/build-apk.sh` | ✅ MANTENUTO | Entry point autorizzato per ogni build APK — chiama `npx eas-cli@18 build` |
| `eas-cli` in devDependencies | ✅ ASSENTE | Non installato come dipendenza fissa — scaricato on-demand da `npx eas-cli@18` |

**Regola**: qualsiasi agente che legge "EAS è dismesso" deve intendere solo **EAS Updates**.
EAS Build (per produrre APK/AAB firmati) è ancora l'unico workflow disponibile per le build native.

**Unico entrypoint autorizzato per build native**:
```bash
touch .local/apk-build-authorized
bash scripts/build-apk.sh              # APK arm64 dimagrita (~50MB)
bash scripts/build-apk.sh production   # AAB Play Store
```
⛔ NON invocare `npx eas-cli build` o `eas build` direttamente — usare sempre `build-apk.sh`.

## Contesto fisso
- **Piattaforma**: Android only (iOS non supportato per OTA)
- **Runtime Version**: `10.0.0` (ciclo corrente, APK v48) ← CICLO 10.x
- **APK corrente**: versionCode **48**, versionName **48.13.10**
- **APK precedente (ultima STABILE distribuita)**: versionCode 47, versionName 47.2.9, rv 9.0.0
- **OTA corrente**: OTA-7 (ciclo 10.x)
- **Updates URL**: `https://biker-link.replit.app/api/expo-updates`
- **Admin email**: `admin@bikerlink.it`
- **Admin password**: secret `BIKERLINK_ADMIN_PASSWORD`
- **Backend produzione**: `https://biker-link.replit.app`

## Regola critica
⛔ **MAI** eseguire `npx eas-cli update` — EAS Updates è dismesso.
⛔ **MAI** modificare manualmente `lib/ota.ts` o `ota-updates.json` prima dello script.
✅ Usare **sempre** `bash scripts/publish-ota.sh` — tutto è automatico.

## ⚠ Bug noto produzione: OTA CREATE restituisce 404/500

### Causa più comune — server_dist obsoleto in produzione
Il deploy di produzione usa un `server_dist` compilato da codice precedente.
Se l'endpoint `POST /api/admin/ota` restituisce 404 o 500 in produzione, il server_dist
non è aggiornato con le ultime modifiche al codice TypeScript.

**Workaround** (usato per OTA-4): pubblicare via `BIKERLINK_BACKEND_URL=http://localhost:5000`.
Dev e produzione condividono lo **stesso database** (`DATABASE_URL`), quindi la release
creata via localhost è immediatamente visibile al server di produzione. L'endpoint
`/api/expo-updates` (user-facing) funziona correttamente su produzione anche se il
server_dist è obsoleto — solo le rotte admin sono rotte.

```bash
BIKERLINK_BACKEND_URL=http://localhost:5000 \
bash scripts/publish-ota.sh export "..."   # Stage 1

BIKERLINK_BACKEND_URL=http://localhost:5000 \
bash scripts/publish-ota.sh publish        # Stage 2
```

**Approvazione via localhost** (se produzione non raggiunge la rotta approve):
```bash
curl -X POST http://localhost:5000/api/admin/ota/<RELEASE_ID>/approve \
  -H "Authorization: Bearer $(cat .local/ota-token)" \
  -H "Content-Type: application/json"
```
Risposta attesa: `{"slot":"stable","approved":true,"status":"active",...}`

---

### Regressione da file-split: doppio prefisso `/ota/ota`
**Sintomo**: `Cannot POST /api/admin/ota` (404) anche in locale dopo un task di file-split.

**Causa**: quando `server/routes/admin/ota.ts` viene estratto come sub-router, il mount
in `server/routes/admin.ts` potrebbe usare `router.use('/ota', otaRouter)`. Ma tutti i
route handler dentro `admin/ota.ts` hanno già il prefisso `/ota` (es. `router.post("/ota", ...)`),
creando il path doppio `/api/admin/ota/ota`.

**Fix**: cambiare il mount in `server/routes/admin.ts` da:
```ts
router.use('/ota', otaRouter);  // ❌ crea /api/admin/ota/ota/...
```
a:
```ts
router.use('/', otaRouter);     // ✅ i path dentro admin/ota.ts già hanno /ota
```

**Verifica**:
```bash
curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:5000/api/admin/ota \
  -H "Content-Type: application/json" -d '{"test":1}'
# Deve rispondere 400 (validazione), non 404
```

---

### Storage methods OTA inesistenti
`storage.createOtaRelease`, `storage.getOtaRelease`, `storage.updateOtaRelease`,
`storage.getAllOtaReleases` **non esistono** nell'interfaccia `IStorage`. Se un task
di refactor li introduce come chiamate nel route handler, il server crasha con 500.

**Fix**: usare query Drizzle dirette sulla tabella `otaReleases` da `@shared/schema`.
I campi corretti della tabella sono:
- `version` (required, notNull)
- `runtimeVersion`
- `bundlePath`
- `releaseNotes`
- `status` (default `'draft'`)
- `slot` (default `'archived'`)
- `approved` (default `false`)
- `approvedAt`, `approvedBy`
- `publishedAt`

Schema validazione (`publishOtaReleaseSchema`) usa: `version`, `runtimeVersion`, `bundlePath`,
`releaseNotes`, `slot` — **non** `platform`, `channel`, `updateId`, `fileUrl`, `fileHash`.

```ts
import { otaReleases } from "@shared/schema";
import { db } from "../../db";
import { eq, desc } from "drizzle-orm";

// Crea release draft
const [release] = await db.insert(otaReleases).values({
  version, runtimeVersion, bundlePath, releaseNotes,
  slot: slot ?? "archived", status: "draft", approved: false,
  createdBy: req.session.userId ?? null,
}).returning();

// Pubblica (status=active)
const [updated] = await db.update(otaReleases)
  .set({ status: "active", publishedAt: new Date(), updatedAt: new Date() })
  .where(eq(otaReleases.id, id)).returning();

// Approva (slot=stable)
const [approved] = await db.update(otaReleases)
  .set({ approved: true, slot: "stable", approvedAt: new Date(),
         approvedBy: req.session.userId ?? null, updatedAt: new Date() })
  .where(eq(otaReleases.id, id)).returning();

// Lista release
const releases = await db.select().from(otaReleases).orderBy(desc(otaReleases.createdAt));
```

## File chiave
- `lib/ota.ts` — contiene `CURRENT_OTA_NUMBER` (aggiornato dallo script)
- `ota-updates.json` — registro OTA attivo (aggiornato dallo script)
- `ota-updates-archive.json` — registro storico cicli 2.x-7.x (solo lettura)
- `scripts/publish-ota.sh` — script di pubblicazione (3 comandi: `export`, `publish`, `rollback` + modalità legacy single-shot)
- `scripts/rollback-ota.sh` — rollback a release storica
- `scripts/validate-ota.sh` — validatore post pubblicazione

---

## 🚀 PROCEDURA — Due stage (sandbox Replit) o legacy un comando

Lo script `publish-ota.sh` ha tre comandi principali. **Nel sandbox Replit (bash tool con
limite ~120s e cgroup reaper che killa i processi background al termine del tool) è
obbligatorio usare i due stage separati** — la modalità legacy single-shot funziona solo
in terminali long-running (CI, shell desktop).

### Stage 0 — Git push → GitHub (obbligatorio, prima di tutto)
Prima di avviare l'export, assicurarsi che tutti i commit locali siano su GitHub. Questo garantisce che il bundle esportato corrisponda al codice versionato.

```bash
git add -A && (git commit -m "chore: pre-OTA-$(date +%Y%m%d)" || true) && git push origin $(git rev-parse --abbrev-ref HEAD)
```

> **Nota**: il `|| true` dopo `git commit` garantisce che il push venga eseguito **sempre**, anche se non ci sono nuovi commit da inviare (`nothing to commit, working tree clean`). In quel caso il push assicura comunque che i commit già presenti localmente siano sincronizzati con GitHub.

> ⛔ **Non saltare questo step**: eseguire `export` con commit locali non pushati significa distribuire un bundle non tracciabile su GitHub in caso di rollback o debug.

### Stage 1 — `export` (~80s, dentro il bash tool)
```bash
BIKERLINK_ADMIN_EMAIL="admin@bikerlink.it" \
BIKERLINK_ADMIN_PASSWORD="$BIKERLINK_ADMIN_PASSWORD" \
bash scripts/publish-ota.sh export "Descrizione breve delle modifiche"
```
Esegue: calcolo updateNumber, bump `CURRENT_OTA_NUMBER`, entry pending in
`ota-updates.json`, `expo export --reset-cache`, verifica marker nel bundle. Scrive
`.local/ota-state.json` + backup `.local/ota-state.lib-ota.ts.bak` e
`.local/ota-state.ota-updates.json.bak`. Lascia `dist-ota/` su disco per lo Stage 2.

### Stage 2 — `publish` (~30s, dentro un nuovo bash tool)
```bash
BIKERLINK_ADMIN_EMAIL="admin@bikerlink.it" \
BIKERLINK_ADMIN_PASSWORD="$BIKERLINK_ADMIN_PASSWORD" \
bash scripts/publish-ota.sh publish
```
Legge lo state file e completa: upload bundle, login admin, creazione release draft,
pubblicazione (`/publish`), verifica backend 200, finalizzazione `ota-updates.json`
(status=published). Al successo cancella state file, backup e `dist-ota/`.

> ⚠️ **Task #1886 — Gate di approvazione admin**: dopo `publish` la release è in stato
> `active` con `slot=archived` (**pending-approval**). I client non ricevono ancora
> l'aggiornamento. L'admin deve approvare dal **Profilo → widget OTA in attesa**
> nell'app. Solo dopo l'approvazione la release viene promossa a `slot=stable` e
> distribuita agli utenti.

### Stage 3 — Approvazione admin (via app) ⚠️ OBBLIGATORIO
**Questo stage è obbligatorio.** La release rimane in `pending-approval` e i client non ricevono nulla finché l'admin non approva esplicitamente.

Dopo il completamento dello Stage 2 (`publish`), l'**admin riceve automaticamente una push notification** (introdotta in Task #1887) che lo avvisa della nuova OTA in attesa — non è necessario che apra l'app manualmente per accorgersene.

Procedura di approvazione:
1. L'admin riceve la push notification sul dispositivo: **"OTA in attesa di approvazione"**
2. Apri l'app BikerLink → scheda **Profilo**
3. Trovi il widget arancio **"N OTA in attesa"** con il pulsante **"Distribuisci"**
4. Premi **"Distribuisci"** per approvare la release
5. La release viene promossa a `slot=stable` — i client iniziano a riceverla

> In alternativa il widget è visibile anche nel pannello **Admin → OTA History** con
> il badge **"⏳ In attesa di approvazione"**.

> ⛔ **Finché l'admin non preme "Distribuisci", la release è distribuita a zero utenti** — anche se `publish` ha avuto successo e il backend risponde 200.

### Rollback dell'export (prima di pubblicare)
Se dopo `export` decidi di non procedere:
```bash
bash scripts/publish-ota.sh rollback
```
Ripristina `lib/ota.ts` e `ota-updates.json` dai backup e rimuove `dist-ota/`.

### Legacy single-shot (solo terminali long-running, NON sandbox Replit)
```bash
BIKERLINK_ADMIN_EMAIL="admin@bikerlink.it" \
BIKERLINK_ADMIN_PASSWORD="$BIKERLINK_ADMIN_PASSWORD" \
bash scripts/publish-ota.sh "Descrizione breve delle modifiche"
```
Esegue export + publish in sequenza nello stesso processo (~110s totali). **Non usare nel
bash tool Replit**: lo step C (Metro export) viene reaped al termine del tool.

### Rollback automatico in caso di errore
Se uno step fallisce in `export` (prima di scrivere lo state file finale) o in `publish`
(prima della finalizzazione K), il trap EXIT ripristina automaticamente `lib/ota.ts` e
`ota-updates.json` dai backup. Nessuna modifica permanente rimane.

L'unica eccezione è il fallimento dello step K (finalizzazione `ota-updates.json`) DOPO
che la release è già live in produzione: in quel caso lo script avvisa di aggiornare
manualmente `ota-updates.json` e NON ripristina (la release è già attiva).

### Versioning automatico
Lo script calcola la versione come `<build>.<updateNumber>.<ciclo_ota>` (es. Ciclo 10.x, OTA-1 → `48.1.10`).
- **48** = versionCode APK corrente
- **updateNumber** = numero progressivo OTA nel ciclo (calcolato automaticamente)
- **10** = ciclo runtimeVersion corrente (10.0.0)
Non è necessario specificare la versione manualmente. Leggere `.agents/skills/bikerlink-versioning/SKILL.md` per la convenzione completa.

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

## 📜 STORICO — Migrazione da EAS Updates a backend custom (Task #958 / #980)

> Questa sezione è **solo archivio storico**. EAS Updates è dismesso dal Task #980.
> Non è rilevante per le operazioni ordinarie.

**Il problema originale**: l'ambiente Replit bloccava tutte le operazioni git interne a
`eas update`, rendendo impossibile distribuire OTA tramite EAS dal Replit workspace.

**Il fix (Task #958, APK v38)**:
✅ Backend serve `GET /api/expo-updates` (Expo Updates Protocol v1).
✅ `app.json`: `updates.url` → `https://biker-link.replit.app/api/expo-updates`
✅ **APK v39+**: aggiornamenti OTA completamente indipendenti da EAS Updates.

I dispositivi su APK v38 o precedente rimasti sull'ultimo OTA EAS (OTA-152) erano bloccati
finché non installavano un APK v39+. Questo problema storico non è più rilevante.

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

### Sintomo: utenti devono cancellare i dati dell'app per ricevere l'aggiornamento

**Causa radice (identificata dopo OTA-11)**: `reloadAsync()` chiamato all'interno del listener AppState "background" non si completa affidabilmente su Android. Il processo JS viene sospeso dal SO prima che la chiamata nativa possa terminare. Il flag in-memory `_pendingReload` si azzera al kill → sessione successiva: `fetchUpdateAsync()` restituisce `isNew=false` → fix OTA-10 re-schedula il background listener → stesso problema → loop infinito → solo clear dati risolve.

**Fix layer 1 — OTA-10 (commit `2c75142`)**: ramo `fetch-not-new` ora chiama `_scheduleReloadOnBackground()` come il ramo `isNew=true`. Risolve il caso force-kill ma non il caso background-listener-inaffidabile.

**Fix layer 2 — introdotto dopo OTA-11**: flag persistente su AsyncStorage `@bikerlink/ota_pending_reload`.
- **Scritto** da `triggerOtaCheck()` subito dopo `fetchUpdateAsync()` riuscito (entrambi i rami `isNew=true` e `isNew=false`).
- **Cancellato** nel listener background (`_scheduleReloadOnBackground`) SE `reloadAsync()` va a buon fine, e nel ramo `no-update` (siamo già aggiornati).
- **Letto** all'avvio in `OtaStartupChecker` (`app/_layout.tsx`): se il flag è presente, chiama `Updates.reloadAsync()` **immediatamente**, prima ancora dei 3 secondi di ritardo del check normale. Questo garantisce che l'aggiornamento scaricato nella sessione precedente venga applicato al cold start successivo, mentre l'utente è ancora sulla schermata di caricamento.
- **Fix aggiuntivo**: il listener AppState ora si attiva solo su `"background"` (rimosso `"inactive"` — stato transitorio Android). Aggiunto timer da **5 secondi**: il reload scatta solo se l'app resta in background ≥5s. Se l'utente torna in primo piano prima, il timer si azzera — nessun reload indesiderato per switch rapidi ad altre app. Costante `BG_RELOAD_DELAY_MS = 5_000` in `lib/ota-check.ts`.

**File**: `lib/ota-check.ts` (costante `OTA_PENDING_KEY`, scrittura/cancellazione flag), `app/_layout.tsx` (lettura flag in `OtaStartupChecker`).

**Se il sintomo si ripresenta**: verificare che:
1. `lib/ota-check.ts` contenga `AsyncStorage.setItem(OTA_PENDING_KEY, "1")` nei rami `fetched` e `fetch-not-new`.
2. `app/_layout.tsx` in `OtaStartupChecker` legga il flag con `AsyncStorage.getItem(OTA_PENDING_KEY)` e chiami `Updates.reloadAsync()` se presente.
3. Il listener in `_scheduleReloadOnBackground` si attivi solo su `nextState === "background"` (non `"inactive"`).

---

### Sintomo: verifica live (Step J di publish-ota.sh) va in timeout anche se la release è pubblicata

**Causa (storica — ora risolta)**: Lo step J inviava `expo-protocol-version: 1` e tentava `JSON.parse(body)` sul body intero, ma il backend risponde con `multipart/mixed` (Expo Protocol v1). Il parse falliva silenziosamente, l'ID non veniva estratto, il loop di retry continuava fino al timeout.

**Fix applicato**: Step J ora estrae il `releaseId` con `grep -oP '"id"\s*:\s*"\K<uuid-pattern>'` sul body grezzo, compatibile sia con risposte JSON pure che con `multipart/mixed`.

**Se il timeout si ripresenta** (la release non è realmente pubblicata), verificare manualmente:
1. Verificare che la produzione serva la nuova release:
   ```bash
   curl -si -H "expo-runtime-version: 8.0.0" -H "expo-platform: android" \
     -H "expo-protocol-version: 1" https://biker-link.replit.app/api/expo-updates | grep '"id"'
   ```
2. Se l'ID è corretto ma lo script è fallito, aggiornare manualmente `ota-updates.json` (entry pending → published con releaseId e bundleUrl).
3. Verificare che `lib/ota.ts` abbia `CURRENT_OTA_NUMBER` corretto.

## Cicli precedenti (storico)
- Ciclo 2.x: OTA 1–21, 23 (rv 2.0.0)
- Ciclo 3.x: OTA 24–36 (rv 3.0.0)
- Ciclo 4.x: OTA 37–40 (rv 4.0.0)
- Ciclo 5.x: OTA 41 (rv 5.0.0) — DEPRECATO
- Ciclo 6.x: OTA 42–43 (rv 6.0.0) — OBSOLETO
- Ciclo 7.x: OTA 44–156 (rv 7.0.0) — CHIUSO
- **Ciclo 8.x: OTA 1–29 (rv 8.0.0) — CHIUSO a OTA-29**
  - APK v41: STABILE — buildId: e03f51d8, APK: https://expo.dev/artifacts/eas/tG5zT8yATySZWJVk7VLbLF.apk
  - APK v43 (3.2.0): STABILE — buildId: 38cb1b32-4316-4f63-9799-1b9ab36888e8, APK: https://expo.dev/artifacts/eas/81L2RgW8kFuzUiRzACfAEm.apk
  - APK v44 (3.3.0): STABILE — buildId: b148edc3-de25-4f55-b5c4-c4466b4ccc0b, APK: https://expo.dev/artifacts/eas/nTJjWowt3HRSs7BqRvdCRi.apk (baseline pulita per device piantati su OTA-19 — Task #1151)
  - APK v45 (3.4.0): STABILE — buildId: 91cfde53-66e7-45fc-83f0-d7f72a98fcde, APK: https://expo.dev/artifacts/eas/j1jsjGMxKaYvKA7u75Mkay.apk
- **Ciclo 9.x: OTA 1–13 (rv 9.0.0) — CHIUSO a OTA-13 (Task #1801 SDK 56 migration)**
  - APK v46 (46.29.9): versionCode 46, runtimeVersion 9.0.0
  - APK v47 (47.2.9): versionCode 47, runtimeVersion 9.0.0 — ultimo APK ciclo 9
  - OTA-9 (v47.9.9): fix token auth backend, releaseId: `dddb488c`
  - OTA-10 (v47.10.9): fix aggiornamento automatico, releaseId: `aa1ba7bb`
  - OTA-11 (v47.11.9): telemetria 1000km + giri ideali collassabili, releaseId: `ff9b0c47`
  - OTA-12 (v47.12.9): fix OTA affidabilità — flag AsyncStorage cold-start + timer 5s, releaseId: `3e27f53c`
  - OTA-13 (v47.13.9): testo "CIAOOTA" rosso profilo — **ULTIMA OTA CICLO 9**, releaseId: `4dde7100`
- **Ciclo 10.x: OTA 0+ (rv 10.0.0) ← CORRENTE**
  - APK v48 (48.13.10): versionCode 48, runtimeVersion 10.0.0 — buildId: a5c14e8f
  - CURRENT_OTA_NUMBER=7, __OTA_BUILD_TAG__="BL-OTA-7-cycle10"
  - OTA-1 (v48.1.10): smoke test locale ciclo 10 post-migrazione SDK 56, releaseId: `959f72c5` — pubblicato contro localhost (non produzione)
  - OTA-2 (v48.2.10): pianificazione percorsi curvy, stile selezionabile, badge mappa, distanza/tempo, GraphHopper car fallback, hero landing admin, auto-migrazioni DB, releaseId: `bdffccc3` — **prima OTA reale in produzione**
  - OTA-3 (v48.3.10): Fix crash login: mock drizzle-orm callable proxy, pgTable non più undefined, releaseId: `93c41a67`
  - OTA-4 (v48.4.10): OTA-4: matching targetUserTypes+route crossing, file split 80+ moduli, compatibility badge, undo reject match, dedup requireAuth, fix TS profile.ts, releaseId: `644717ce`
  - OTA-5 (v48.5.10): Stabilità avvio + TypeScript 0 errori + migrazione schema + storage refactor, releaseId: `a940438b`
  - OTA-6 (v48.6.10): Fix crash login Android: TypeError undefined is not a function (OTA-5), releaseId: `a6e2cbf9`
  - OTA-7 (v48.7.10): Fix crash login Android: rimosse import statiche expo-location e loginSchema (OTA-6 incompleto), releaseId: `7399d847`

## REGOLA CRITICA — BARE WORKFLOW
Il progetto ha `android/` committato → bare workflow. Modificare SEMPRE i file Android direttamente:
- **Architecture**: `android/gradle.properties` → `newArchEnabled=true`
- **versionCode**: `android/app/build.gradle` (E anche app.json per consistenza)
- **⚠️ CRITICO — runtimeVersion**: `android/app/src/main/res/values/strings.xml` → `expo_runtime_version` DEVE essere uguale a `runtimeVersion` in app.json
- **⚠️ CRITICO — AndroidManifest**: NON includere `ACCESS_BACKGROUND_LOCATION` senza implementazione completa.

## VERSIONI LIBRERIE CERTIFICATE
- react-native-maps: **1.27.2**
- react-native-reanimated: **~4.2.1**
