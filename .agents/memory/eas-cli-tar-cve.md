---
name: eas-cli tar CVE block
description: Replit Security Policy blocca tar@7.5.7 durante il download di eas-cli@^20.x; fix è aggiornare a ^21.0.0
---

## Regola
eas.sh deve sempre usare `eas-cli@^21.0.0` (non ^20.x), e eas.json deve avere `cli.version ">= 21.0.0"`.

**Why:** eas-cli@20.x scarica tar@7.5.7 come dipendenza transitiva. Replit Socket Security Policy blocca tar@7.5.7 per CVE critica con HTTP 403. La versione 21.x usa tar@7.5.19 (non bloccata). Se `node_modules/.bin/eas` è assente (caso normale in Replit), eas.sh cade su npx e scarica la versione specificata in eas.sh.

**How to apply:** Se l'OTA publish fallisce con 403 su tar@7.x.y: verificare la versione in scripts/eas.sh e aggiornare a eas-cli@^(latest major). Verificare anche eas.json cli.version.
