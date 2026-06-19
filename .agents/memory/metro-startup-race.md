---
name: Metro startup race (clean-metro / watchdog)
description: Perché Clean Metro e Watchdog devono essere lock-aware prima di killare la porta 8081, e come recuperare se l'avvio si rompe.
---

# Metro startup race (Clean Metro / Watchdog vs start-expo)

**Regola:** qualsiasi componente che gestisce la porta 8081 (clean-metro-restart.sh, watchdog.sh, futuro Cerbero) DEVE controllare il gate prima di killare: lock `/tmp/start-metro.lock` tenuto **OR** processo `scripts/start-expo.sh` attivo (`pgrep`). Se vero → osservare, NON killare. Kill solo mirati per porta del processo errato; mai `pkill -f "expo start"` / kill-by-name.

**Why:** al cold boot tutti i workflow partono in parallelo. Clean Metro/Watchdog con kill ciechi (`lsof -ti:8081 | xargs kill`, `pkill -f "expo start"`) corrono contro `start-expo.sh` che sta avviando Metro → SIGTERM → Metro exit 143, Clean Metro `DIDNT_OPEN_A_PORT`, race non deterministica. `start-expo.sh` è l'owner del lock (flock fd 9).

**Gate di regressione:** `scripts/__tests__/metro-startup-race.test.sh` (in post-merge.sh) prova in modo deterministico — start-expo MOCKATO via flock holder + finto processo per il ramo pgrep, lock e porta override via env su `clean-metro-restart.sh` — che il gate `cerbero_metro_starting` rilevi l'avvio, che clean-metro skippi senza kill, che il lock attivo non venga mai rimosso e che non compaia "METRO CRASH". `lsof`/`nc` NON esistono nel sandbox: il test non li usa. **Why:** senza test, una modifica a watchdog/clean-metro reintrodurrebbe la race in silenzio.

**How to apply:** non riscrivere watchdog.sh/clean-metro-restart.sh dal vivo (sono workflow attivi: rompono l'avvio in corso e possono buttare giù sia 5000 che 8081). Sviluppare in file nuovi e fare lo switch atomico solo a race verificata. Recupero se l'avvio si rompe: ripristina i file da git HEAD con `git --no-optional-locks show HEAD:<path> > <path>`, `rm` dei file non tracciati, poi restart di `Start App` + `Watchdog`. Nota: clean-metro che rimuove la cache key forza `--reset-cache`, troppo lento per la finestra `waitForPort=8081` → timeout.
