# ThinkCentre Performance Tuning — Guida

Hardware: Intel i5-7500T · 32 GB RAM · Intel HD Graphics 630 · Ubuntu 22.04+  
Servizi ottimizzati: **GraphHopper** + **Ollama**

---

## Prerequisiti

| Requisito | Verifica |
|---|---|
| Ubuntu 22.04+ | `lsb_release -rs` |
| Java 21+ (per ZGC Generazionale) | `java -version` |
| systemd | `systemctl --version` |
| Ollama installato come servizio systemd | `systemctl status ollama` |
| Accesso root | `sudo -v` |

> **Nota Java:** ZGC Generazionale (`-XX:+ZGenerational`) richiede Java 21+.  
> Con Java 17 rimuovere solo `-XX:+ZGenerational` e usare `-XX:+UseZGC` da solo.

---

## File inclusi

| File | Destinazione | Scopo |
|---|---|---|
| `apply-tuning.sh` | Eseguire con `sudo` | Script all-in-one idempotente |
| `cpu-performance.service` | `/etc/systemd/system/` | Mantiene governor CPU a `performance` al boot |
| `sysctl-bikerlink.conf` | `/etc/sysctl.d/99-bikerlink.conf` | Tuning kernel (swap, dirty pages, THP, TCP) |
| `graphhopper-jvm.conf` | Riferimento / documentazione | Flag JVM ottimizzati (sorgente dei valori in `graphhopper.service`) |
| `graphhopper.service` | `/etc/systemd/system/` | Unit systemd che avvia GraphHopper con i flag JVM al boot |
| `ollama-override.conf` | `/etc/systemd/system/ollama.service.d/bikerlink.conf` | Variabili env Ollama (concorrenza, threading) |

---

## Come applicare il tuning

```bash
# Dalla root del progetto BikerLink:
cd scripts/thinkcentre
sudo bash apply-tuning.sh
```

Lo script è **idempotente**: si può ri-eseguire senza danni dopo aggiornamenti o riavvii.

---

## Cosa fa ogni ottimizzazione

### 1. CPU Governor — `performance`

**Problema:** L'i5-7500T di default usa il governor `powersave` che riduce la frequenza  
dei core in idle. Quando arriva una richiesta di routing o inferenza, ci sono decine di  
millisecondi di ramp-up prima che i core raggiungano la frequenza massima (3.5 GHz boost).

**Soluzione:** Il governor `performance` mantiene i core alla frequenza massima costante.

**Effetto atteso:** latenza P99 routing −15–30 ms, primo token Ollama −20–50 ms.

**Costo:** consumo energetico +5–10 W in idle (trascurabile su server).

```bash
# Verifica
cat /sys/devices/system/cpu/cpu0/cpufreq/scaling_governor
# Atteso: performance

systemctl is-enabled cpu-performance.service
# Atteso: enabled
```

---

### 2. Sysctl kernel tuning — `sysctl-bikerlink.conf`

| Parametro | Valore | Motivazione |
|---|---|---|
| `vm.swappiness` | `5` | Con 32 GB RAM il swap è quasi sempre uno spreco; swap = latenza spike |
| `vm.dirty_ratio` | `15` | Riduce gli stall I/O bloccanti durante i write-back di GH cache |
| `vm.dirty_background_ratio` | `5` | Il kernel inizia a fare flush prima, distribuendo il costo nel tempo |
| THP (via sysfs al boot) | `madvise` | JVM e llama.cpp li usano quando vantaggioso; persistito da `cpu-performance.service` |
| `net.core.somaxconn` | `4096` | Coda TCP più lunga sotto carico burst di richieste HTTP |
| `net.ipv4.tcp_tw_reuse` | `1` | Riusa i socket TIME_WAIT → meno esaurimento porte sotto carico |

```bash
# Verifica sysctl
sysctl vm.swappiness vm.dirty_ratio vm.dirty_background_ratio
# Atteso: 5, 15, 5

# Verifica THP (sysfs — non sysctl)
cat /sys/kernel/mm/transparent_hugepage/enabled
# Atteso: always [madvise] never
# Nota: THP non è una chiave sysctl; è persistito da cpu-performance.service
# che scrive in /sys/kernel/mm/transparent_hugepage/enabled al boot.
```

---

### 3. GraphHopper systemd unit — `graphhopper.service`

A partire da questa versione del tuning, GraphHopper è gestito da una **unit systemd dedicata**  
che incorpora direttamente i flag JVM ottimizzati. Questo garantisce:

- Auto-start al boot del ThinkCentre (nessun intervento manuale dopo un riavvio)
- Restart automatico in caso di crash (`Restart=on-failure`)
- Log centralizzati in journald (`journalctl -u graphhopper`)
- Separazione netta dall'utente interattivo (processo isolato sotto `User=graphhopper`)

#### Pre-requisiti prima di installare

1. **Personalizzare il file `scripts/thinkcentre/graphhopper.service`** — i placeholder `<VERSION>` e i path devono rispecchiare l'installazione locale:

```bash
# Verificare la versione del JAR installato:
ls /opt/graphhopper/graphhopper-web-*.jar
# es. graphhopper-web-9.1.jar → usare 9.1

# Il file di configurazione:
ls /opt/graphhopper/config.yml
```

2. **Creare l'utente di sistema** (se non esiste già):

```bash
sudo useradd --system --no-create-home --shell /usr/sbin/nologin graphhopper
sudo chown -R graphhopper:graphhopper /opt/graphhopper
```

3. **Configurare i thread nel `config.yml`** (l'unico modo — i flag JVM `-D...` non hanno effetto):

```yaml
graphhopper:
  prepare:
    threads: 3   # usati solo nella fase offline di prepare
  routing:
    threads: 4   # thread di routing concorrenti (tutti i core fisici)
```

#### Installazione manuale

```bash
# Personalizzare prima il file (vedere sopra), poi:
sudo cp scripts/thinkcentre/graphhopper.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now graphhopper
```

#### Installazione via apply-tuning.sh

Lo script `apply-tuning.sh` include una **sezione 4 opzionale** con prompt di conferma:

```bash
cd scripts/thinkcentre
sudo bash apply-tuning.sh
# → rispondere 'y' alla domanda sull'installazione di graphhopper.service
```

#### Verifica

```bash
# Stato del servizio
systemctl status graphhopper
# Atteso: active (running)

# Abilitato al boot
systemctl is-enabled graphhopper
# Atteso: enabled

# Log in tempo reale (utile per verificare avvio JVM e ZGC)
journalctl -u graphhopper -f

# Conferma che ZGC sia attivo (nel log di avvio):
journalctl -u graphhopper --no-pager | grep -i "Z Garbage Collector"
# Atteso: Using The Z Garbage Collector

# Oppure a runtime:
jcmd $(pgrep -f graphhopper) VM.flags | grep -i zgc
# Atteso: -XX:+UseZGC
```

**Ripartizione memoria:**

```
32 GB totali
├── GraphHopper heap: 12 GB  (Xmx12g)
├── Ollama modello:   ~4–8 GB (dipende dal modello)
├── OS + cache FS:    ~4 GB
└── Buffer libero:    ~8 GB
```

> **Nota:** Il file `graphhopper-jvm.conf` rimane come riferimento documentale dei flag  
> e della motivazione di ciascuno. I valori effettivi usati dal servizio sono in `graphhopper.service`.

---

### 4. Ollama systemd drop-in — `ollama-override.conf`

| Variabile | Valore | Motivazione |
|---|---|---|
| `OLLAMA_NUM_PARALLEL` | `2` | Max 2 richieste AI in parallelo; oltre si degrada per mancanza di RAM |
| `OLLAMA_MAX_LOADED_MODELS` | `1` | Evita il thrashing tra modelli; BikerLink usa un modello solo |
| `OLLAMA_NUM_THREADS` | `4` | Tutti i core fisici per l'inferenza (condivisi con GH, picchi raramente coincidono) |
| `OLLAMA_FLASH_ATTENTION` | `1` | Riduce RAM KV-cache, +10–20% token/s su context window lunghe |
| `OLLAMA_INTEL_GPU` | `0` | Disabilita probe GPU integrata (HD 630): non ha driver affidabili, rallenta il boot |

```bash
# Verifica
systemctl show ollama | grep -i "OLLAMA_NUM_PARALLEL\|OLLAMA_NUM_THREADS\|OLLAMA_FLASH"
# Atteso: Environment=OLLAMA_NUM_PARALLEL=2 OLLAMA_NUM_THREADS=4 OLLAMA_FLASH_ATTENTION=1 ...

# Verifica che il drop-in sia caricato:
systemctl cat ollama | grep -A5 "drop-in"
```

---

## Valori attesi prima/dopo

| Metrica | Prima | Dopo | Note |
|---|---|---|---|
| Latenza routing P50 | ~120 ms | ~80 ms | Governor + ZGC |
| Latenza routing P99 | ~800 ms | ~400 ms | ZGC elimina pause GC lunghe |
| Primo token Ollama | ~800 ms | ~500 ms | Governor + Flash Attention |
| Token/s (Mistral 7B) | ~12–15 | ~18–22 | Flash Attention + threads |
| Spike swap (sotto carico) | frequenti | rari | swappiness=5 |
| Stall I/O write-back | visibili | ridotti | dirty_ratio tuning |

> I valori sono stime basate su hardware simile. Misurare con `htop`, `iotop`  
> e i log di GraphHopper (`routing took Xms`) per confermare i miglioramenti effettivi.

---

## Rollback

### CPU Governor
```bash
sudo systemctl disable --now cpu-performance.service
sudo rm /etc/systemd/system/cpu-performance.service
sudo systemctl daemon-reload
# Il governor tornerà a powersave al prossimo riavvio.
# Per ripristino immediato:
for cpu in /sys/devices/system/cpu/cpu[0-9]*/cpufreq/scaling_governor; do
  echo powersave | sudo tee "$cpu" > /dev/null
done
```

### Sysctl
```bash
sudo rm /etc/sysctl.d/99-bikerlink.conf
sudo sysctl --system
# I parametri (swappiness, dirty_ratio, TCP) tornano ai default di Ubuntu al prossimo riavvio.
# Per ripristino immediato:
sudo sysctl vm.swappiness=60
sudo sysctl vm.dirty_ratio=20
sudo sysctl vm.dirty_background_ratio=10
```

### Transparent Hugepages
THP è persistito da `cpu-performance.service`, non da sysctl. Per ripristinarlo a `always`:
```bash
# Sessione corrente:
echo always | sudo tee /sys/kernel/mm/transparent_hugepage/enabled > /dev/null
# Permanente: disinstallare cpu-performance.service (vedi sezione CPU Governor sopra)
# oppure modificare ExecStart in /etc/systemd/system/cpu-performance.service
```

### Ollama drop-in
```bash
sudo rm /etc/systemd/system/ollama.service.d/bikerlink.conf
sudo systemctl daemon-reload
sudo systemctl restart ollama
```

### GraphHopper systemd unit
```bash
sudo systemctl disable --now graphhopper
sudo rm /etc/systemd/system/graphhopper.service
sudo systemctl daemon-reload
```
GraphHopper non si avvierà più automaticamente al boot. Riavviarlo manualmente se necessario  
con il comando precedente (senza flag JVM ottimizzati) o con una propria soluzione di avvio.

---

## Troubleshooting

**`scaling_governor` non esiste:**  
Il kernel non ha caricato il modulo cpufreq. Prova:
```bash
sudo modprobe acpi-cpufreq
# oppure (Intel):
sudo modprobe intel_pstate
```

**Ollama non parte dopo il drop-in:**  
Verificare la sintassi del file:
```bash
systemd-analyze verify /etc/systemd/system/ollama.service
journalctl -u ollama -n 50
```

**GraphHopper OutOfMemoryError:**  
Ridurre `-Xmx12g` a `-Xmx10g` se Ollama carica modelli più grandi di 7B.  
Modificare il valore in `/etc/systemd/system/graphhopper.service`, poi:
```bash
sudo systemctl daemon-reload && sudo systemctl restart graphhopper
```

**ZGenerational non disponibile (Java 17):**  
Rimuovere `-XX:+ZGenerational` dalla riga `ExecStart` in `/etc/systemd/system/graphhopper.service`.  
ZGC base funziona con Java 17+.

**graphhopper.service non parte (placeholder `<VERSION>` non sostituito):**  
```bash
journalctl -u graphhopper -n 30
# Cercare: "Unable to access jarfile /opt/graphhopper/graphhopper-web-<VERSION>.jar"
# Fix: modificare ExecStart con la versione corretta del JAR
sudo systemctl edit --full graphhopper   # oppure modificare direttamente il file
sudo systemctl daemon-reload && sudo systemctl restart graphhopper
```

**graphhopper.service non parte (permessi `/opt/graphhopper`):**  
```bash
ls -la /opt/graphhopper/
# Se i file non appartengono a 'graphhopper':
sudo chown -R graphhopper:graphhopper /opt/graphhopper
sudo systemctl restart graphhopper
```

**Timeout avvio (TimeoutStartSec=300 scaduto):**  
Con `AlwaysPreTouch` il primo avvio su 12 GB di heap può richiedere più di 5 minuti.  
Aumentare `TimeoutStartSec` nella unit se il warm-up iniziale è particolarmente lento:
```bash
sudo systemctl edit graphhopper
# Aggiungere: [Service]
#              TimeoutStartSec=600
sudo systemctl daemon-reload && sudo systemctl restart graphhopper
```
