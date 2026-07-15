---
name: TC LAN subnet drift (192.168.0.x vs 192.168.1.x)
description: The ThinkCentre's real LAN subnet is 192.168.0.0/24 (IP .100), not 192.168.1.0/24 — some older notes/comments still reference the old subnet.
---

Il ThinkCentre è oggi su **192.168.0.100/24** (interfaccia `enp0s31f6`), non più `192.168.1.x`. Probabile cambio router/rete non seguito da un aggiornamento di tutti i riferimenti.

**Why:** il firewall ufw del TC aveva una regola `22/tcp ALLOW IN 192.168.1.0/24` (commento storico "TC static .35 wired / .36 wifi") mentre il box è realmente su `192.168.0.0/24`. Con default `deny incoming`, questo droppava silenziosamente ogni tentativo SSH da un PC locale sulla sottorete reale — sintomo: timeout, non "connection refused". Corretto il 2026-07-15 (`sudo ufw delete allow from 192.168.1.0/24 ...` + `sudo ufw allow from 192.168.0.0/24 ...`).

**How to apply:** se un utente riferisce "non riesco a fare SSH al TC dalla mia rete locale" (non dalla sandbox, che comunque non può risolvere IP LAN — vedi skill thinkcentre-access), controlla PRIMA `ip addr show` sul TC per la sottorete reale e confrontala con le regole ufw (`sudo ufw status verbose`), non assumere che valga ancora 192.168.1.0/24. Altri riferimenti al vecchio schema IP (es. commenti in .agents/skills/thinkcentre-access/SKILL.md, script su TC) potrebbero essere altrettanto stale — verificare live, non fidarsi del commento.
