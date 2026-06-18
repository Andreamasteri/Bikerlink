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

### Hardware e swap (PC fisso i5-14400, 16 GB RAM, SSD)

La build Valhalla per l'**Europa** è un **blocco unico** (non divisibile per area) e
ha picchi di RAM **oltre i 16 GB** nelle fasi di parsing iniziale e `graphenhancer`.
Su 16 GB di RAM, **senza swap** il kernel uccide il container a metà build (OOM-kill).

Valhalla usa file memory-mapped su disco: su **SSD** lo swap degrada in modo graceful,
quindi la build completa accettando un rallentamento tollerabile.

➡ **Su 16 GB lo swap è obbligatorio.** Prima della build esegui `./swap.sh` (crea uno
swapfile da 32–48 GB su SSD, idempotente). Con 32+ GB di RAM lo swap resta consigliato
come rete di sicurezza ma non è critico.

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
| `04.sh`   | Check pre-build: PBF, Docker, disco, **RAM + swap** (OK/WARN/FAIL)       |
| `05.sh`   | Avvia build grafo Valhalla in background (screen), `--shm-size=8g`       |
| `06.sh`   | Verifica post-build: tiles, container, test HTTP /status                 |
| `07.sh`   | Prepara workspace Nominatim + crea docker-compose.yml                    |
| `08.sh`   | Avvia import Nominatim in background (screen)                            |
| `09.sh`   | Monitor import Nominatim: container, log, test HTTP                      |
| `reset.sh`| **Reset completo**: ferma container, elimina `~/valhalla/` intera        |
| `install-valhalla.sh` | Installa Docker (repo ufficiale) + `docker pull` immagine Valhalla (idempotente) |
| `config-valhalla.sh`  | Fonte unica dei parametri di serve (porta `8002`, tiles/data); sorgeabile da `05.sh`/`99.sh` |
| `usb.sh`  | **Monta** la USB raw, **copia** `europe-latest.osm.pbf` in `~/valhalla/data/`, **smonta** |
| `swap.sh` | Crea/verifica swapfile 32–48 GB su SSD (idempotente, persistente fstab)  |
| `cpu.sh`  | CPU governor → `performance`, persistente al reboot (riusa la unit systemd) |
| `99.sh`   | **Boot check**: riavvia Valhalla (serve-only) e Nominatim dopo un reboot |

---

## Ordine consigliato

### Valhalla (build grafo routing — Europa su 16 GB)

#### Da Ubuntu pulito (primo setup → prima build)

Ordine consigliato: **install → config → usb → build**.

```
install-valhalla.sh ← installa Docker (repo ufficiale) + pull immagine Valhalla
config-valhalla.sh  ← (verifica) parametri di serve: porta 8002, tiles/data dir
usb.sh              ← monta la USB raw, copia europe-latest.osm.pbf, smonta
swap.sh             ← crea/verifica swapfile 32–48 GB (OBBLIGATORIO su 16 GB)
cpu.sh              ← governor performance (opzionale ma consigliato)
04.sh               ← check pre-build (PBF, Docker, disco, RAM + swap)
05.sh               ← avvia build (dura ore; con swap su SSD è più lenta ma non viene uccisa)
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

> ⚠ `reset.sh` elimina anche il PBF: dopo il reset devi sempre eseguire `usb.sh`
> per ricopiarlo dalla USB prima di avviare la build.

> ⚠ Su 16 GB di RAM senza swap la build Europa viene uccisa dall'OOM-killer a metà
> lavoro. `04.sh` segnala FAIL se lo swap manca o è troppo piccolo. La build con swap
> su SSD impiega più tempo (file memory-mapped) ma arriva in fondo.

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
