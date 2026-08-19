# ThinkCentre Scripts — BikerLink

Script shell pronti all'uso per il ThinkCentre (Ubuntu, IP 192.168.1.35, user `andrea`).

Dopo `git pull`, tutti i comandi sono disponibili senza digitarli a mano.
I processi lunghi girano in `screen` e sopravvivono alla disconnessione SSH.

---

## Prerequisiti

- Docker installato e in esecuzione
- `screen` installato (`sudo apt install screen`)
- PBF scaricato in `~/valhalla/data/europe-latest.osm.pbf`
  ```bash
  wget -c -P ~/valhalla/data/ https://download.geofabrik.de/europe-latest.osm.pbf
  ```

### Hardware e swap (PC fisso i5-14400, 32 GB RAM, SSD)

La build Valhalla per l'**Europa** è un **blocco unico** (non divisibile per area) e
ha picchi di RAM elevati nelle fasi di parsing iniziale e `graphenhancer`.
Con 32 GB di RAM il kernel raramente interviene, ma i picchi possono superare la RAM
fisica nei momenti più intensi dell'enhancer.

Valhalla usa file memory-mapped su disco: su **SSD** lo swap degrada in modo graceful,
quindi la build completa accettando un rallentamento tollerabile.

➡ **Su 32 GB lo swap è consigliato** come rete di sicurezza, non obbligatorio. Prima
della build esegui `./swap.sh` (crea uno swapfile da 16 GB su SSD, idempotente).

Per spremere la CPU durante la build, esegui `./cpu.sh` (governor `performance`,
persistente al reboot).

---

## Script

| Script    | Cosa fa                                                                  |
|-----------|--------------------------------------------------------------------------|
| `00.sh`   | `git pull` con stash automatico delle modifiche locali                   |
| `01.sh`   | Monitor CPU + RAM + disco (aggiorna ogni 2s)                             |
| `02.sh`   | Monitor build Valhalla: container, tiles, log (ogni 5s)                  |
| `03.sh`   | Pulizia Valhalla: ferma container, rimuove tiles e log                   |
| `04.sh`   | **Preflight HULK read-only**: hardware, NVIDIA, rete, OS/systemd/log e Valhalla (OK/WARN/FAIL/SKIP) |
| `05.sh`   | Avvia build grafo Valhalla in background (screen), `--shm-size=16g`      |
| `06.sh`   | Verifica post-build: tiles, container, test HTTP /status                 |
| `07.sh`   | Prepara workspace Nominatim + crea docker-compose.yml                    |
| `08.sh`   | Avvia import Nominatim in background (screen)                            |
| `09.sh`   | Monitor import Nominatim: container, log, test HTTP                      |
| `reset.sh`| **Soft reset** (default) o **reset completo**: ferma container, rimuove tiles; opzionalmente elimina anche il PBF |
| `install-valhalla.sh` | Installa Docker (repo ufficiale) + `docker pull` immagine Valhalla (idempotente) |
| `config-valhalla.sh`  | Fonte unica dei parametri di serve (porta `8002`, tiles/data); sorgeabile da `05.sh`/`99.sh` |
| `usb.sh`  | **Monta** la USB raw, **copia** `europe-latest.osm.pbf` in `~/valhalla/data/`, **smonta** |
| `swap.sh` | Crea/verifica swapfile su SSD, default 16 GB su 32 GB RAM (idempotente)  |
| `cpu.sh`  | CPU governor → `performance`, persistente al reboot (riusa la unit systemd) |
| `99.sh`   | **Boot check**: riavvia Valhalla (serve-only) e Nominatim dopo un reboot |
| `diag-system.sh` | **Diagnostica sistema post-crash**: RAM, swap, disco, carico CPU, container Docker, temperatura CPU |
| `diag-build.sh`  | **Diagnostica build post-crash**: causa del crash, conteggio errori, durata, ultime righe log, stato container |
| `recover.sh`     | **Recovery guidato post-crash**: esegue entrambe le diagnostiche, interpreta i `[FAIL]` e propone/esegue le azioni correttive passo-passo |

### Preflight HULK

`04.sh` è il gate read-only prima della build: esegue sempre tutte le sezioni
hardware, NVIDIA, rete, sistema operativo/systemd/log e Valhalla. Un controllo
mancante o fallito non viene nascosto: produce `[SKIP]`, `[WARN]` o `[FAIL]` e
il riepilogo finale è `READY_WITH_WARNINGS` oppure `BLOCKED`.

Il default è volutamente severo per il ThinkCentre: NVIDIA e i servizi attesi
(`docker`, `ollama`, `cloudflared`, `tailscaled`) sono richiesti. Per un test
offline locale si può usare soltanto `PREFLIGHT_LIVE_NETWORK=0`; sul TC non va
impostato, così DNS/HTTPS/ICMP restano verificati realmente.

---

## Recovery guidato

Il modo più rapido per riprendersi da un crash è usare `recover.sh`, che esegue
automaticamente entrambe le diagnostiche, interpreta i `[FAIL]` e guida passo-passo
verso il ripristino:

```bash
./recover.sh                        # legge /tmp/valhalla-build.log (default)
./recover.sh /tmp/altro-log.log    # log alternativo
```

Lo script:
1. Esegue `diag-system.sh` (RAM, swap, disco, CPU, Docker, temperatura)
2. Esegue `diag-build.sh` (causa crash, errori, durata, ultime righe)
3. Interpreta tutti i `[FAIL]` rilevati e propone le azioni correttive:
   - **Swap assente/insufficiente** → offre di eseguire `./swap.sh`
   - **Docker non in esecuzione** → offre di eseguire `sudo systemctl start docker`
   - **Crash critico** (double free, SIGABRT, container terminato con errore) → offre di eseguire `./03.sh` per pulire tiles e log
   - **Spazio disco critico** → mostra suggerimenti manuali
4. Chiede conferma esplicita prima di ogni azione distruttiva (`03.sh`)
5. Al termine, offre di eseguire `./04.sh` per il check pre-build

Usa gli stessi prefissi `[OK]` / `[WARN]` / `[FAIL]` / `[INFO]` degli altri script.

---

## Diagnostica manuale post-crash

Se preferisci eseguire le diagnostiche singolarmente senza azioni guidate:

```
diag-system.sh   ← fotografia dello stato del sistema (RAM, swap, disco, CPU, Docker)
diag-build.sh    ← analisi del log di build (causa crash, errori, durata, ultime 40 righe)
```

`diag-system.sh` non richiede argomenti. `diag-build.sh` accetta opzionalmente il percorso
del log come primo argomento (default: `/tmp/valhalla-build.log`):

```bash
./diag-build.sh                        # legge /tmp/valhalla-build.log
./diag-build.sh /tmp/altro-log.log    # log alternativo
```

Entrambi gli script usano i prefissi `[OK]` / `[WARN]` / `[FAIL]` / `[INFO]`.
Non eseguono repair automatico: servono solo per capire cosa è andato storto.
Se la causa è OOM-kill, esegui `./swap.sh` prima di ritentare la build.

---

## Ordine consigliato

### Valhalla (build grafo routing — Europa su 32 GB)

#### Da Ubuntu pulito (primo setup → prima build)

Ordine consigliato: **install → config → usb → build**.

```
install-valhalla.sh ← installa Docker (repo ufficiale) + pull immagine Valhalla
config-valhalla.sh  ← (verifica) parametri di serve: porta 8002, tiles/data dir
usb.sh              ← monta la USB raw, copia europe-latest.osm.pbf, smonta
swap.sh             ← crea/verifica swapfile 16 GB (consigliato su 32 GB)
cpu.sh              ← governor performance (opzionale ma consigliato)
04.sh               ← preflight HULK completo (hardware, NVIDIA, rete, OS/systemd/log + PBF/Docker)
05.sh               ← avvia build (dura ore)
02.sh               ← monitora (in un'altra sessione SSH)
06.sh               ← verifica quando il monitor mostra "TERMINATO"
```

`install-valhalla.sh` va eseguito **una sola volta** sul setup iniziale (idempotente:
se Docker e l'immagine ci sono già non rifà nulla). `config-valhalla.sh` non va
"eseguito": è un file sorgeabile che `05.sh` e `99.sh` leggono in automatico — lo si
lancia direttamente solo per **stampare** la config effettiva (override via env, es.
`VALHALLA_PORT=9002 ./05.sh`).

`swap.sh` e `cpu.sh` vanno eseguiti **una sola volta** (sono idempotenti e persistono
al reboot): alle build successive puoi ripartire da `04.sh`.

> Se Docker è già installato dal vecchio PC/setup, puoi saltare `install-valhalla.sh`
> e ripartire da `usb.sh` (o, su ripartenza da zero, da `reset.sh`).

> `reset.sh` offre due modalità: **soft reset** (default — conserva PBF e immagine
> Docker, rimuove solo tiles e log; riparti da `04.sh`) oppure **reset completo**
> (elimina `~/valhalla/` intera; dovrai ricopiare il PBF con `usb.sh`).

#### Ripartenza parziale (tiles rotti, build incompleta — PBF già presente)

Se la build è fallita ma il PBF è già in `~/valhalla/data/`: `03.sh` poi `05.sh`.

### Nominatim (geocoding self-hosted)

```
07.sh   ← prepara workspace e docker-compose.yml
08.sh   ← avvia import (6–24h per Europe)
09.sh   ← monitora (in un'altra sessione SSH)
```

### Boot check dopo riavvio ThinkCentre

```
99.sh   ← avvia Valhalla (serve-only) + Nominatim e verifica HTTP
```

`99.sh` non esegue nessuna build. Usa i tiles già presenti su disco.
Se i tiles non esistono, avvisa e salta Valhalla — esegui prima `05.sh`.

---

## Note operative

- **Ctrl+C** sui monitor (01/02/09) esce dal monitor, **non** ferma la build.
- `screen -ls` → lista sessioni attive
- `screen -r valhalla-build` → rientra nella sessione Valhalla
- `screen -r nominatim-import` → rientra nella sessione Nominatim
- I log sono sempre in `/tmp/*.log`

---

## Porte

| Servizio   | Porta         |
|------------|---------------|
| Valhalla   | `8002`        |
| Nominatim  | `8080`        |
