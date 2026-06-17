---
name: OTA publish pipeline quirks
description: Comportamenti non ovvi del workflow OTA Publish (messaggio stale dal DB, accoppiamento client/server, killer start-expo.sh orfano) per evitare release mal-etichettate o rotte.
---

## start-expo.sh orfano uccide expo export mid-bundle ← CAUSA PRINCIPALE DI HANG/CRASH OTA

**Sintomo:** `expo export` raggiunge 200-300% CPU (bundla davvero), poi muore senza EXIT, senza rollback, dist-ota vuoto.

**Causa:** Watchdog lancia `start-expo.sh` in background come processo figlio. Anche dopo SIGTERM al Watchdog, `start-expo.sh` sopravvive come orfano. Al suo avvio esegue `lsof -ti:8081 | xargs kill -9` — che colpisce il Metro di `expo export` mid-bundle. Il processo Metro riceve SIGKILL → `set -euo pipefail` del publish script non può intrappolarlo → no EXIT, no rollback buildInfo.

**Fix applicato** in `publish-ota-full.sh` (sezione pre-export): blocco che fa `pkill watchdog.sh`, `pkill start-expo.sh`, libera 8081 con SIGTERM→SIGKILL prima di avviare l'export.

**Why:** export Metro e dev Metro competono sulla porta 8081; il dev-starter vince con kill -9.

**Come applicarlo:** il fix è già nello script — non rimuoverlo. Se l'export continua a morire mid-bundle senza errori nel log, controllare per prima cosa i processi orfani start-expo.sh (`pgrep -f start-expo.sh`).

## Messaggio stale dal fallback DB

Il workflow "OTA Publish" si **auto-riavvia** quando riavvii altri workflow dell'env
(es. "Start App"): partono allo stesso timestamp. Lo script `publish-ota-full.sh`
legge `.ota-message`; se è **vuoto**, fa fallback su `app_settings.pending_ota_message`.

**Conseguenza:** se `.ota-message` è vuoto, un restart può ri-pubblicare il bundle del
task PRECEDENTE etichettato col suo vecchio messaggio, ma contenente il **codice corrente**
(working tree) → release mal-etichettata.

**Come applicarlo:** prima di riavviare qualsiasi workflow dopo aver fatto edit client,
scrivi SEMPRE il `.ota-message` corretto per il task in corso. La versione OTA è
`V{androidVersionCode}.{runtimeMajor}.{NEXT}` dove `NEXT = COUNT(*) ota_releases + 1`.
Ogni release nasce `status='pending'` e richiede approvazione admin da /admin/ota
(gli admin la ricevono al cold start per testarla; gli utenti normali solo dopo l'approvazione).

## npx eas-cli hang — aggiungere sempre --yes

Quando `eas-cli` **non è in `node_modules/.bin`**, `npx eas-cli@^20.1.0` chiede
interattivamente `Ok to proceed? (y)` prima di installarlo. Nessuno risponde →
il workflow OTA Publish resta bloccato silenziosamente per 30+ minuti.

**Fix permanente** (`scripts/eas.sh`): usa `exec npx --yes eas-cli@^20.1.0 ...`
così npx auto-conferma l'installazione senza input utente.

**Come applicarlo:** verificare che `--yes` sia sempre presente nella chiamata
npx in `scripts/eas.sh`; se per qualunque motivo viene rimosso, il workflow
pendente richiede kill + restart manuale.

---

## Accoppiamento client OTA ↔ deploy server Express

L'OTA consegna **solo il bundle JS** del client. Il server Express si deploya
**separatamente** (pulsante Publish / deployment Replit). Quando una modifica client
dipende da un nuovo comportamento/endpoint server (es. nuovo campo `replacePhotoId` su
`POST /me/photos`), il **server prod deve essere deployato insieme/prima** di approvare
l'OTA, altrimenti il client nuovo parla con un server vecchio e la feature si rompe
silenziosamente.

**Why:** deploy split (client EAS OTA + server Replit) → niente atomicità tra i due.
**Come applicarlo:** se un task tocca sia client che un endpoint server, avvisa
esplicitamente l'utente di deployare il server prima di approvare l'OTA gated.
