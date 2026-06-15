---
name: pusha
description: Esegui git push verso GitHub in modo autonomo. Usa questa skill quando l'utente scrive "pusha", "git push", "pusha su github", "sincronizza github" o simili. NON creare task, NON chiedere conferme — esegui direttamente tutto in un unico bash call.
---

# Pusha — Git push autonomo verso GitHub

Quando l'utente scrive "pusha" (o varianti), esegui il push direttamente senza creare task e senza chiedere conferme.

## Repo e credenziali

- Repo: `https://github.com/Andreamasteri/Bikerlink.git`
- URL autenticato: `https://x-access-token:${GITHUB_TOKEN}@github.com/Andreamasteri/Bikerlink.git`
- ⚠️ Senza `x-access-token:` davanti al token → 401. Non usare il token nudo.
- NON stampare mai il token nei log.

## Procedura completa (un unico bash call)

```bash
REMOTE_URL="https://x-access-token:${GITHUB_TOKEN}@github.com/Andreamasteri/Bikerlink.git"

# 1. Prova push normale
PUSH_OUT=$(git push "$REMOTE_URL" main 2>&1)
PUSH_RC=$?

if [ $PUSH_RC -eq 0 ]; then
  echo "✅ Push OK"
else
  # 2. Se fallisce (non-fast-forward o altro), force push
  echo "Push normale fallito — forzo..."
  PUSH_OUT=$(git push "$REMOTE_URL" main --force 2>&1)
  PUSH_RC=$?
fi

echo "$PUSH_OUT" | grep -v "x-access-token" | grep -v "github_pat_"

# 3. Verifica allineamento
REMOTE_SHA=$(git ls-remote "$REMOTE_URL" refs/heads/main | cut -f1)
LOCAL_SHA=$(git rev-parse HEAD)
if [ "$REMOTE_SHA" = "$LOCAL_SHA" ]; then
  echo "✅ SYNC OK — $LOCAL_SHA"
else
  echo "❌ MISMATCH: remote=$REMOTE_SHA local=$LOCAL_SHA"
  exit 1
fi
```

## Comportamento atteso

| Situazione | Azione |
|---|---|
| Storia lineare (fast-forward) | `git push` normale → OK |
| Storia diverge (non-fast-forward) | `git push --force` → OK |
| Timeout pack-protocol | Il comando fallisce con errore esplicito — riportarlo all'utente |

## Note importanti

- Il warning `current Git remote contains credentials` è normale e ignorabile.
- Il lock stale `.git/refs/remotes/origin/main.lock` è ignorabile se exit code = 0.
- `--force-with-lease` può rifiutare per "stale info" in questo env → usare `--force` diretto.
- Non usare project task, non chiedere conferme: eseguire tutto inline in un unico `bash` call.
- Dopo il push, riportare all'utente solo: SHA finale + ✅/❌.
