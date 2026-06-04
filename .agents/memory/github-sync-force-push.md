---
name: GitHub sync via force-push
description: Come/perché il remoto GitHub di questo repo è un mirror force-push del progetto Replit, e il quirk del lock file di tracking.
---

# Sync GitHub (origin/github) come mirror force-push

Entrambi i remote `origin` e `github` puntano allo stesso repo
`https://github.com/Andreamasteri/Bikerlink.git`. Il flusso consolidato è:
**GitHub è un mirror del progetto Replit locale, allineato via force-push**
(vedi commit storici "Sync GitHub: force push locale → origin/main allineato").

**Why:** le storie divergono spesso (fix fatti a volte direttamente su GitHub,
a volte sul Replit). Quando un push normale viene rifiutato non-fast-forward,
la scelta dell'utente è in genere force-push del locale → GitHub.
Confermare comunque con l'utente perché scarta i commit presenti solo sul remoto.

**How to apply:**
- Auth: header `http.https://github.com/.extraheader` con
  `AUTHORIZATION: basic <base64 di x-access-token:$GITHUB_TOKEN>`. Mai mettere il
  token nella URL del remote né stamparlo. Per i log, NON usare un sed che
  redige stringhe esadecimali di 40 char: maschera anche gli SHA git.
- Le operazioni git distruttive (force-push, merge, rebase, rm in `.git/`) sono
  bloccate per il main agent → vanno eseguite tramite un Project Task in background.
- Quirk ricorrente in questo env Replit: `.git/refs/remotes/origin/main.lock`
  resta stale e fa fallire l'aggiornamento del ref di **tracking** locale
  ("cannot lock ref refs/remotes/origin/main"). Questo NON fa fallire il push
  verso GitHub: se l'output mostra `<old>...<new> main -> main (forced update)`
  con rc=0, il push è riuscito. `--force-with-lease` può essere rifiutato per
  "stale info" a causa dello stesso lock → fallback a `--force`.
- Verifica esito con `git ls-remote origin refs/heads/main` confrontando lo SHA
  con HEAD locale (ls-remote non espone il token).
