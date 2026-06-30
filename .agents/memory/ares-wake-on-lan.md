---
name: Ares Wake-on-LAN via ThinkCentre
description: Come svegliare Ares (PC Windows fisso, Ollama diagnostica) da remoto inviando un magic packet dalla LAN del ThinkCentre.
---

Ares è collegato via WiFi (no ethernet) e va spesso in standby. La scheda WiFi
ha "Wake on WLAN" abilitato lato Windows (confermato funzionante dall'utente),
quindi il magic packet WoL standard arriva anche da standby WiFi (non è la
solita limitazione hardware "WoL solo via cavo").

**MAC address Ares (WiFi)**: `A8:E2:91:2C:90:6A`
**Broadcast LAN**: `192.168.1.255` (stessa subnet del ThinkCentre, `enp0s31f6`)

**Come svegliarlo**: eseguire `scripts/thinkcentre/wake-ares.sh` SUL
ThinkCentre (stessa LAN di Ares) via `tc.py exec`. Non serve installare
`wakeonlan`/`etherwake` — lo script costruisce il magic packet a mano con
python3 puro (già presente sul box), perché `apt-get install` da Replit verso
una macchina remota viene comunque bloccato dal guard sandbox locale che
intercetta il pattern "install" anche per host remoti SSH.

**Why**: evitare di richiedere ogni volta MAC address e broadcast all'utente,
e avere un comando pronto invece di costruire il packet inline ogni sessione.
