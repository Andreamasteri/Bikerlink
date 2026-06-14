# BikerLink — Guida Build e OTA

> Guida operativa per la prima build Android/iOS e per il ciclo di aggiornamento OTA.
> EAS CLI v20 è installato come dipendenza progetto. Su Replit usare sempre `bash scripts/eas.sh` (mai `eas` grezzo né `npx eas`).

---

## Indice

1. [Prerequisiti](#1-prerequisiti)
2. [Profili EAS disponibili](#2-profili-eas-disponibili)
3. [Prima build Android — APK test rapido (profilo preview)](#3-prima-build-android--apk-test-rapido-profilo-preview)
4. [Prima build Android — APK production (profilo release-apk)](#4-prima-build-android--apk-production-profilo-release-apk)
5. [Prima build iOS — via Expo Launch (Replit)](#5-prima-build-ios--via-expo-launch-replit)
6. [Workflow OTA completo](#6-workflow-ota-completo)
7. [Tabella decisionale: nuova build vs OTA](#7-tabella-decisionale-nuova-build-vs-ota)
8. [Bump versione: runtimeVersion vs versionCode](#8-bump-versione-runtimeversion-vs-versioncode)
9. [Rollback OTA](#9-rollback-ota)
10. [Variabili d'ambiente a build-time](#10-variabili-dambiente-a-build-time)

---

## 1. Prerequisiti

### EAS CLI (già installato su Replit come dipendenza progetto)

```bash
# Verifica versione — deve restituire eas-cli/20.x
bash scripts/eas.sh --version

# Login con account Expo (andreamasteri)
bash scripts/eas.sh whoami
# Se non loggato:
bash scripts/eas.sh login
```

### Installazione locale (se esegui build dal tuo PC)

```bash
# Sul tuo PC locale: installa EAS CLI globalmente (solo per build da PC, non da Replit)
npm install -g eas-cli@20
# Poi effettua il login: eas whoami
```

### Verifica configurazione progetto

```bash
# Deve mostrare: slug=bikerlink, owner=andreamasteri
cat app.json | python3 -c "import json,sys; d=json.load(sys.stdin)['expo']; print('slug:', d['slug'], '| owner:', d['owner'], '| projectId:', d['extra']['eas']['projectId'])"
```

---

## 2. Profili EAS disponibili

| Profilo | Tipo | Canale | Scopo |
|---------|------|--------|-------|
| `preview` | APK interno | `staging` | Test rapidi, NON tocca production |
| `release-apk` | APK interno | `production` | Test OTA su canale production |
| `production` | AAB + iOS | `production` | Store (Google Play + App Store) |

---

## 3. Prima build Android — APK test rapido (profilo preview)

Usa questo profilo per testare l'app senza impattare il canale production OTA.

```bash
# Da Replit (wrapper obbligatorio — mai eas grezzo)
GIT_INDEX_FILE=/tmp/eas-build-index bash scripts/eas.sh build --platform android --profile preview --non-interactive
# Dal tuo PC locale (EAS CLI installato globalmente con npm install -g eas-cli@20):
# bash -c "eas build --platform android --profile preview --non-interactive"
```

**Cosa succede:**
1. EAS compila l'app con canale `staging`
2. Genera un APK scaricabile dal dashboard EAS
3. Installatelo direttamente sul dispositivo (abilita "Sorgenti sconosciute")

**Durata:** ~15-20 minuti (prima build, senza cache). Le successive sono più rapide (~8-12 min).

**Download APK:**
```bash
# Il comando stampa un URL al termine, oppure vai su:
# https://expo.dev/accounts/andreamasteri/projects/bikerlink/builds
```

---

## 4. Prima build Android — APK production (profilo release-apk)

Usa questo profilo quando vuoi testare il ciclo OTA completo sul canale production.

```bash
# Da Replit (wrapper obbligatorio — mai eas grezzo)
GIT_INDEX_FILE=/tmp/eas-build-index bash scripts/eas.sh build --platform android --profile release-apk --non-interactive
# Dal tuo PC locale (EAS CLI installato globalmente con npm install -g eas-cli@20):
# bash -c "eas build --platform android --profile release-apk --non-interactive"
```

**Differenza rispetto a `preview`:** il canale è `production`, quindi l'app riceverà
aggiornamenti OTA approvati nel pannello admin BikerLink.

---

## 5. Prima build iOS — via Expo Launch (Replit)

**Non usare EAS CLI per iOS.** Usa il pulsante **Publish** su Replit (Expo Launch).

Expo Launch gestisce:
- Build nativa iOS su infrastruttura EAS
- Firma automatica con certificati Apple
- Submission diretta all'App Store / TestFlight

**Requisiti prima di pubblicare:**
- Account Apple Developer attivo (99 $/anno)
- App ID registrato su Apple Developer Portal: `com.bikerlink.app`
- Il team deve essere configurato in Replit

---

## 6. Workflow OTA completo

### Step 1 — Pubblica un aggiornamento JS su EAS (canale staging)

```bash
# Dalla root del progetto (shell Replit o terminale locale)
# IMPORTANTE: pubblica sempre su canale "staging" per entrare nella pipeline di approvazione.
# Il server BikerLink sincronizza dal branch "staging" di EAS e mette le release in pending.
bash scripts/eas.sh update --channel staging --message "Fix: schermata percorsi v52.3.11"
# Dal tuo PC locale (EAS CLI globale): bash -c "eas update --channel staging --message '...'"
```

> **Perché staging e non production?**
> Il server (`server/routes/admin/ota.ts`) sincronizza le nuove release leggendo
> il branch `staging` di EAS. Solo dopo l'approvazione manuale nel pannello admin
> il server le serve sul canale production. Pubblicare direttamente su `production`
> bypasserebbe l'approvazione e le release non entrerebbero nella coda admin.

**EAS aggiorna solo il bundle JS** — non richiede una nuova build se non hai
modificato codice nativo (vedi sezione 7).

### Step 2 — L'update appare nel pannello admin in attesa di approvazione

Il server BikerLink sincronizza automaticamente le nuove release da EAS ogni volta
che si apre il pannello admin OTA. In alternativa, forzare la sincronizzazione:

```
Admin BikerLink → /admin/ota → pulsante "Sync"
```

### Step 3 — Approva la release

```
Admin BikerLink → /admin/ota → lista release pending → "Approva"
```

Solo dopo l'approvazione la release viene promossa a `production` nel DB e diventa
disponibile per gli utenti tramite il server custom.

### Step 4 — Gli utenti ricevono l'aggiornamento

Al prossimo avvio dell'app, il client chiede a:
```
https://biker-link.replit.app/api/expo-updates
```
Il server risponde con il manifest della release approvata (proxy verso EAS CDN).
L'app scarica il nuovo bundle JS e si riavvia automaticamente.

### Flusso completo visivo

```
Developer → bash scripts/eas.sh update --channel staging → EAS ospita bundle JS (branch: staging)
                                                      ↓
                              Server BikerLink sincronizza branch staging da EAS
                              Release creata con status "pending" nel DB
                                                      ↓
                                          Admin approva nel pannello OTA
                              Release aggiornata a status "approved", channel "production"
                                                      ↓
                                         App utente si avvia → chiede /api/expo-updates
                                                      ↓
                                         Server risponde con manifest approvato (proxy EAS CDN)
                                                      ↓
                                         App scarica bundle + si riavvia (silenzioso)
```

---

## 7. Tabella decisionale: nuova build vs OTA

| Tipo di modifica | Serve nuova build nativa? | Basta OTA? |
|---|---|---|
| Fix bug JavaScript/TypeScript | ❌ | ✅ |
| Nuova schermata / componente UI | ❌ | ✅ |
| Nuova logica business lato client | ❌ | ✅ |
| Aggiunta/modifica variabile `EXPO_PUBLIC_*` | ✅ (build-time) | ❌ |
| Aggiunta nuovo plugin Expo (es. expo-camera) | ✅ | ❌ |
| Modifica permessi Android/iOS | ✅ | ❌ |
| Aggiornamento versione SDK Expo | ✅ | ❌ |
| Aggiornamento di una libreria nativa | ✅ | ❌ |
| Modifica `app.json` (icon, splash, scheme...) | ✅ | ❌ |
| Modifica `metro.config.js` | ✅ | ❌ |

**Regola rapida:** se il cambiamento riguarda solo file `.ts`/`.tsx` e non tocca
dipendenze native — basta OTA. Se tocca qualcosa che richiederebbe un `pod install`
o una modifica al Gradle — serve una nuova build.

---

## 8. Bump versione: runtimeVersion vs versionCode

### `runtimeVersion` (in `app.json`)

Controlla la **compatibilità OTA**. Il server servirà un OTA update solo se
`runtimeVersion` del bundle corrisponde esattamente a quella dell'app installata.

**Quando bumppare:**
- Hai fatto una nuova build nativa (nuovo APK/AAB)
- Hai aggiornato dipendenze native che cambiano l'ABI del runtime

```json
// app.json — bump manuale
"runtimeVersion": "11.0.0"  // era "10.0.0"
```

Dopo il bump, tutti gli OTA precedenti smettono di essere distribuiti alle
nuove build (lo vuoi: le build vecchie continuano a ricevere OTA compatibili).

### `version` e `versionCode` (in `app.json`)

`version`: stringa visibile agli utenti (es. "52.3.11") — bump ad ogni release.
`versionCode`: intero incrementale per Android (es. 53) — deve aumentare ad ogni
APK/AAB caricato su Play Store. Non può tornare indietro.

```json
// app.json — esempio bump per nuova build
"version": "52.4.0",
"android": {
  "versionCode": 53
}
```

`ios.buildNumber`: stringa per App Store, deve aumentare ad ogni submission.
```json
"ios": {
  "buildNumber": "35"  // era "34"
}
```

### Checklist prima di una nuova build nativa

```
[ ] Incrementa version (es. 52.3.10 → 52.4.0)
[ ] Incrementa android.versionCode (es. 52 → 53)
[ ] Incrementa ios.buildNumber (es. "34" → "35")
[ ] Bumpa runtimeVersion se cambiano dipendenze native (es. "10.0.0" → "11.0.0")
[ ] Commit + push su GitHub prima di avviare bash scripts/eas.sh build
```

---

## 9. Rollback OTA

### Opzione A — Disattiva la release difettosa (rapido)

```
Admin BikerLink → /admin/ota → release approvata → "Rifiuta"
```

Una volta rifiutata, il server smette di servirla. Gli utenti che l'hanno già
applicata non tornano indietro automaticamente (OTA non fa downgrade),
ma i nuovi avvii non riceveranno più l'update.

### Opzione B — Ri-approva una release precedente buona

```
Admin BikerLink → /admin/ota → release precedente → "Rollback"
```

Il server inizia a servire la versione precedente come aggiornamento attivo.
Gli utenti sulla versione difettosa riceveranno il bundle "vecchio buono"
come se fosse un nuovo update.

### Opzione C — Emergency (nessuna release sana disponibile)

```bash
# Pubblica hotfix immediato sul canale staging (entra nella coda admin come sempre)
bash scripts/eas.sh update --channel staging --message "Hotfix critico: ripristino funzionalità X"
# Poi approva immediatamente dal pannello admin
# Admin BikerLink → /admin/ota → pulsante "Sync" → Approva
```

---

## 10. Variabili d'ambiente a build-time

Le variabili `EXPO_PUBLIC_*` vengono **embedded nel bundle JS** al momento della build.
Non si possono aggiornare via OTA — richiedono una nuova build.

| Variabile | Stato | Note |
|-----------|-------|------|
| `EXPO_PUBLIC_DOMAIN` | ✅ Configurata | `biker-link.replit.app` — URL base API |
| `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY` | ✅ Configurata (Secret) | Google Maps SDK |
| `EXPO_PUBLIC_MAPLIBRE_API_KEY` | 🔜 Futura | Non necessaria per le build attuali. Da aggiungere quando MapLibre passa al rollout completo (task #2313 in corso). |
| `EXPO_PUBLIC_MAPLIBRE_TILE_URL` | 🔜 Futura | URL del tile server self-hosted sul Mini PC. Da aggiungere dopo il deploy del server (vedi `docs/self-hosting-setup.md`). |

Le variabili marcate 🔜 non bloccano la build corrente — MapLibre ha fallback a Leaflet
e il tile server self-hosted non è ancora operativo. Quando saranno pronte, aggiungerle
come Secret in Replit e fare una nuova build nativa (non bastano OTA — le env vars
sono embedded a build-time).

### Aggiungere una variabile mancante prima di buildare

Dalla shell di Replit:
```bash
# Verificare lo stato attuale (da Replit — usa il wrapper)
bash scripts/eas.sh env:list

# Le variabili EXPO_PUBLIC_* vanno nelle Secrets di Replit oppure
# configurate nel progetto EAS:
# https://expo.dev/accounts/andreamasteri/projects/bikerlink/environment-variables
```

**Nota su `EXPO_PUBLIC_MAPLIBRE_*`:** queste variabili saranno necessarie quando
il Mini PC self-hosted sarà operativo e il tile server attivo. Per ora le build
funzionano senza di esse (MapLibre è in rollout graduale, con fallback a Leaflet).
