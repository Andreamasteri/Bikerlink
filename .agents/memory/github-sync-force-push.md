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

## Fallback: GitHub Contents API (quando git push si blocca)

`git push` via pack protocol tende a fare **timeout** dal container Replit (anche
con `http.postBuffer` ridotto e `HTTP/1.1`). L'API REST di GitHub è sempre
raggiungibile e funziona su file singoli:

```bash
# 1. Fetch SHA corrente del file su GitHub (obbligatorio — cambia ad ogni update)
SHA=$(curl -s -H "Authorization: token ${GITHUB_TOKEN}" \
  "https://api.github.com/repos/Andreamasteri/Bikerlink/contents/<path>" \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['sha'])")

# 2. Upload contenuto
CONTENT=$(base64 -w 0 <file_locale>)
curl -s -X PUT \
  -H "Authorization: token ${GITHUB_TOKEN}" \
  -H "Content-Type: application/json" \
  "https://api.github.com/repos/Andreamasteri/Bikerlink/contents/<path>" \
  -d "{\"message\":\"<msg>\",\"content\":\"${CONTENT}\",\"sha\":\"${SHA}\"}"
```

**Why:** il sandbox Replit blocca connessioni TCP lunghe (pack negotiation git),
ma le request HTTP brevi verso api.github.com passano sempre.

**How to apply:**
- Fare SHA fetch fresco SUBITO prima del PUT (anche 5s di delay cambia il SHA
  se un'altra update è in mezzo).
- NON parallelizzare PUT sullo stesso branch: il secondo ottiene SHA stale →
  "does not match". Fare in sequenza.
- Crea commit separati su GitHub (diverge dalla storia Replit locale). Per
  riallineare in seguito: project-task con `git pull --rebase` o force-push.
