---
name: deploy-build .cache cleanup
description: Why scripts/deploy-build.sh must not rm the .cache/ directory during the build.
---

# Non pulire .cache/ nel deploy build script

`scripts/deploy-build.sh` NON deve fare `rm` su `.cache/`. Quella directory è
gestita dalla piattaforma come layer separato del deploy. Inoltre conteneva file
"dotslash" read-only di proprietà di un altro utente: un `rm` su di essi falliva e,
con `set -e` attivo nello script, faceva fallire l'intero build del deploy in modo
poco diagnosticabile.

**Why:** un tentativo di "alleggerire" il build cancellando `.cache/` ha rotto il
deploy con un errore di permessi su file non nostri.

**How to apply:** se serve ridurre la dimensione del layer di deploy, agire su
`.local/state/replit/` (vedi repl-layer-size.md), non su `.cache/`. Lasciare `.cache/`
intatta nel build script.
