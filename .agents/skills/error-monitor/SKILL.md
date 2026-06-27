---
name: error-monitor
description: Monitora il backend BikerLink in tempo reale (porta 5000). Suggerisci questa skill quando l'utente segnala crash, errori API, backend down, o vuole tenere sotto controllo la salute del server durante lo sviluppo o dopo un deploy.
---

# Error Monitor — Monitoraggio Backend BikerLink

## Quando suggerirla

Usa questa skill (ovvero suggerisci di lanciare lo script) quando:

- L'utente segnala che il **backend non risponde**, crasha, o dà errori API
- Stai debuggando un problema su un **endpoint critico** (road-hazards, telemetry, proposals)
- Vuoi tenere d'occhio il server **durante una sessione di sviluppo intensiva**
- Dopo un **deploy o un aggiornamento OTA** per verificare che tutto regga
- L'utente chiede "come faccio a monitorare il backend?" o "c'è un modo per vedere i crash?"
- Il workflow `Start Backend` è stato rimosso dagli slot attivi ma serve diagnostica live

## Come avviarlo

```bash
bash scripts/error-monitor.sh
```

Lo script è **singleton** (usa `flock`): se ne gira già una copia, la nuova uscirà subito con un messaggio. Per riavviarlo bisogna prima terminare il processo esistente.

Per eseguirlo in background:

```bash
bash scripts/error-monitor.sh &
```

Per seguire i log in tempo reale su un'altra shell:

```bash
tail -f logs/error-monitor.log
```

## Cosa controlla

| Check | Frequenza | Tag nel log | Note |
|---|---|---|---|
| `GET /api/health` (porta 5000) | Ogni 30s | `BACKEND_OK` / `BACKEND_INIT` / `BACKEND_DOWN` / `BACKEND_ERROR` | Misura anche la latenza in ms; `BACKEND_INIT` = server vivo ma ancora in boot |
| Crash recenti backend | Ogni 30s | `BACKEND_CRASH` | Legge `logs/backend-crashes.log` (se esiste); segnala le ultime 3 righe aggiunte dall'ultimo ciclo |
| `GET /api/lastfm/status` (produzione) | Ogni ~5 min (ciclo × 10) | `LASTFM_OK` / `LASTFM_WARN` | Contro `https://biker-link.replit.app`; **401 è atteso** (auth richiesta) e viene trattato come OK |
| Endpoint critici locali | Ogni ~5 min (ciclo × 10) | `ENDPOINT_OK` / `ENDPOINT_WARN` / `ENDPOINT_ERROR` | Proba: `/api/road-hazards`, `/api/admin/telemetry-stats`, `/api/admin/telemetry/users`, `/api/proposals`; 401/403 = route viva → OK; 5xx = errore reale |

### Rotazione log

Il file `logs/error-monitor.log` viene troncato automaticamente ogni 20 cicli (~10 min) se supera 2000 righe: le prime metà vengono scartate, si conservano le ultime 1000.

## Dove trovare i log

| File | Contenuto |
|---|---|
| `logs/error-monitor.log` | Output completo dello script (stdout + file) |
| `logs/backend-crashes.log` | Crash del processo backend (scritto dal watchdog/cerbero) |
| `/tmp/error-monitor.flock` | File di supporto per il lock singleton — la sua presenza non indica un processo attivo |

## Note operative

- **flock singleton**: se un nuovo avvio esce subito con "Altra istanza già in esecuzione", significa che un processo monitor è ancora vivo. Verificare con `pgrep -a error-monitor` e terminarlo con `kill <PID>`. Il file `/tmp/error-monitor.flock` è solo un file di supporto per `flock`: cancellarlo non libera il lock finché il processo originale è in esecuzione.
- **401 su Last.fm**: è il comportamento atteso per una chiamata non autenticata. Non è un problema.
- **BACKEND_INIT**: il server è vivo (risponde 200) ma il campo `initializing: true` nel body indica che sta ancora caricando. Aspettare qualche secondo prima di testare le API.
- **Nessun Metro/frontend**: lo script monitora solo il backend Express (porta 5000). Il frontend Expo usa EAS build + OTA, non un server locale da monitorare.
- **Modifica host produzione**: la variabile `PROD_HOST` in cima allo script (`scripts/error-monitor.sh`) punta a `https://biker-link.replit.app`. Cambiala se il dominio prod cambia.
