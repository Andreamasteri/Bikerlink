---
name: Cerbero — guardiano porte (ex watchdog)
description: Architettura del guardiano a tre teste che monitora backend 5000 + Metro 8081; vincoli non ovvi.
---

# Cerbero — guardiano a tre teste delle porte

`watchdog.sh` è ora uno **shim** (`exec cerbero.sh`); la logica vive in `cerbero.sh` + lib stateless `cerbero-lib.sh`. Il workflow `Watchdog` lancia comunque `bash scripts/watchdog.sh`. Log in `logs/cerbero.log` (NON più watchdog.log). Backup originale: `scripts/backup/watchdog.sh.bak`.

## Vincolo non ovvio: TESTA 1 e i 3 stati di /api/health
`/api/health` è **initializing-aware**: ritorna **HTTP 503 `{status:initializing}`** durante il boot DB e **200 `{status:ok}`** a regime.

**Regola:** la decisione di restart del backend NON deve basarsi su "status:ok". Deve riavviare SOLO se la porta è **irraggiungibile** (curl non connette / http_code 000). Un 503 initializing = backend VIVO → non toccare.

**Perché:** se Cerbero riavviasse il backend ogni volta che `/api/health` non è ancora "ok", durante ogni boot DB (che può durare secondi) lo ucciderebbe e ripartirebbe → crash loop perpetuo. `cerbero_health_backend` ritorna 3 stati: 0=ok, 2=initializing(vivo), 1=down(riavvia).

**Come applicarlo:** qualsiasi nuovo check di liveness su un endpoint con fase di init deve distinguere "irraggiungibile" da "raggiungibile-ma-non-pronto".

## Counter crash separati
Backend e Metro hanno array crash + backoff + sessioni INDIPENDENTI (3 crash/300s → 300/600/1200s). Un crash backend non azzera il counter Metro e viceversa. Grace window 180s si applica SOLO a Metro (il lento al boot); il backend ha solo il cooldown.

## Gate Metro (TESTA 3) e TOCTOU
Il cancello Metro = `pgrep scripts/start-expo.sh` OR lock `/tmp/start-metro.lock` ancora detenuto (flock -n su **fd 200**, MAI fd 9 che è di start-expo e del single-instance Cerbero). Prima di uccidere Metro il restart ricontrolla il gate, e rimuove il lock SOLO se riesce a riacquisirlo (stale); se la riacquisizione fallisce → un avvio è appena partito → bail senza kill. Vedi anche `metro-startup-race.md`.

## Clean Metro — fast vs deep
`clean-metro-restart.sh`: default = **fast clean** (solo `.expo/` preservando `types/` + `.metro-cache/`), NON tocca `node_modules/.cache/metro-*` → start-expo riusa la cache (no `--reset-cache`) → porta 8081 apre in pochi secondi (niente DIDNT_OPEN_A_PORT). `FORCE_RESET=1` → deep clean (`clean-metro.sh`) + `rm /tmp/.metro-cache-key` per forzare `expo start --reset-cache`.
