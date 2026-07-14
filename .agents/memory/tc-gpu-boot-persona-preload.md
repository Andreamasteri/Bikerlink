---
name: TC GPU boot dependency + always-on persona preload
description: Perché Ollama sul ThinkCentre non partiva da solo dopo un riavvio, come si diagnostica l'assenza reale di GPU vs driver rotto, e come si mantengono i modelli delle persone AI sempre residenti in memoria (VRAM/RAM) al boot.
---

## Boot-blocking dependency
`ollama.service` aveva un drop-in (`ollama.service.d/nvidia.conf`) con `Requires=nvidia-persistenced-boot.service`.
Se quel servizio fallisce (es. GPU spenta/non rilevata), il `Requires=` rigido impedisce a `ollama.service` di
partire affatto — niente log utile, semplicemente "inactive (dead)" con "Job failed with result 'dependency'".

**Fix permanente applicato:** `Requires=` → `Wants=` nello stesso drop-in. Così, se la dipendenza GPU fallisce,
Ollama parte comunque (su CPU) invece di restare morto finché qualcuno non lo riavvia a mano.

**Why:** un riavvio del TC con la GPU anche solo momentaneamente non pronta lasciava tutta l'infra AI (Bowie,
Horus, Nadir, Quebracho) offline silenziosamente, con impatto diretto sugli agenti in produzione.

## "Nessuna GPU" vs "driver rotto" — come distinguerli
`nvidia-smi` che dice "couldn't communicate with the NVIDIA driver" è ambiguo: può significare sia "non c'è
hardware NVIDIA" sia "il modulo non è caricato". Il discriminante è `lspci -nnk` (se non compare NESSUNA riga
NVIDIA, l'hardware non è enumerato sul bus PCI — non è un problema software) insieme a `modprobe nvidia`
("No such device" = nessun device PCI corrispondente, conferma hardware assente/non enumerato).

**Causa reale riscontrata:** GPU (GTX 1070, dedicata, alimentata da PSU/cavo ausiliario separato) rimasta senza
alimentazione dopo un evento di spegnimento del TC. L'enumerazione PCIe avviene al POST del BIOS: un semplice
`reboot` via SSH (soft reboot OS) NON basta a farla riapparire se non era alimentata già al POST — serve uno
spegnimento fisico completo + verifica del cavo di alimentazione GPU + accensione a freddo.

**Why:** un `systemctl reboot` da SSH può sembrare un "riavvio completo" ma non forza una nuova negoziazione
PCIe se il case non è stato scollegato/rialimentato; utile per non perdere tempo a debuggare driver quando il
problema è a monte, fisico.

## Always-on persona preload (keep_alive=-1)
Per tenere Bowie/Horus/Nadir sempre caricati (GPU se possibile) e Quebracho forzato su CPU/RAM, mentre Ares resta
dormiente fino a chiamata esplicita, serve un systemd oneshot separato (`ollama-preload.service`, `After=ollama.service`,
`Requisite=ollama.service`, enabled su `multi-user.target`) che dopo il boot chiama:
- `/api/generate` con `"keep_alive":-1` per i modelli di chat/generazione (lascia scegliere a Ollama GPU vs CPU).
- `/api/embed` (non `/api/generate`, altrimenti 400) per i modelli di sole embedding (es. `all-minilm`).
- `/api/generate` con `"options":{"num_gpu":0}` per forzare un modello specifico su CPU/RAM anche se la VRAM
  avrebbe spazio (usato per Quebracho, per riservare la VRAM limitata a Bowie/Horus/Nadir).

**Gotcha 1 — `OLLAMA_MAX_LOADED_MODELS`:** senza settarlo esplicitamente, Ollama evince modelli "kept alive"
per farne spazio a un nuovo load anche se la RAM/VRAM sembra sufficiente; il default per CPU-only è troppo
basso (osservato: cap effettivo di 1 modello simultaneo). Va settato esplicitamente (`Environment=` drop-in,
es. `=4`) al numero di modelli always-on desiderati.

**Gotcha 2 — race di caricamento in sequenza:** anche con `OLLAMA_MAX_LOADED_MODELS` corretto, caricare N
modelli in rapida sequenza può evictare momentaneamente uno di quelli appena caricati durante il transiente
(osservato su GPU 8GB con 3 modelli che in teoria ci stavano tutti). Fix: dopo il primo giro di load, fare un
pass di verifica (`/api/ps`) e ricaricare chi risulta assente prima di considerare il preload concluso.

**How to apply:** ogni volta che si aggiunge/rimuove una persona always-on o si cambia il modello assegnato,
aggiornare sia la lista nello script di preload sia il valore di `OLLAMA_MAX_LOADED_MODELS` in lockstep.
