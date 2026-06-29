---
name: EMCY pipeline filesystem + EAS env fix
description: Due quirks bloccanti nello script publish-ota-emcy.sh su Replit — filesystem separati per /tmp e workspace, e flag obbligatorio EAS --environment.
---

## Problema 1 — filesystem separati (/tmp vs /home/runner/workspace)

**Regola:** Il worktree git va in `/tmp` (git lo chiede), ma il BUILD_DIR dove Metro fa `expo export` DEVE stare in `/home/runner/workspace/` (stesso filesystem di `node_modules`).

**Why:** Metro non segue symlink fuori dalla project root. I hard-link (`cp -rl`) falliscono con "Invalid cross-device link" perché /tmp e /home/runner/workspace sono mount separati in Replit. Il risultato era `expo export` che usciva 0 senza bundle.

**How to apply:**
```bash
WORKTREE_DIR="/tmp/emcy-worktree-$$"     # git checkout qui
BUILD_DIR="/home/runner/workspace/.emcy-build-$$"  # expo export qui

# Copia sorgenti con tar pipe (rsync non disponibile in Replit)
( cd "$WORKTREE_DIR" && tar --exclude=./node_modules --exclude=./.git -cf - . ) \
  | ( cd "$BUILD_DIR" && tar xf - )

# Symlink node_modules (stesso filesystem → funziona)
ln -sf /home/runner/workspace/node_modules "$BUILD_DIR/node_modules"

# Export e EAS update girano da BUILD_DIR
cd "$BUILD_DIR" && npx expo export ...
```

## Problema 2 — EAS update --non-interactive richiede --environment

**Regola:** Aggiungere sempre `--environment production` quando si chiama `eas update --non-interactive`.

**Why:** EAS CLI 20.x in non-interactive mode rifiuta la chiamata se --environment non è specificato esplicitamente: "The `--environment` flag must be set when running in `--non-interactive` mode."

**How to apply:** Tutti gli script che chiamano `eas update --non-interactive` (publish-ota.sh, publish-ota-full.sh, publish-ota-emcy.sh) devono includere `--environment production`.

## Note operative

- `rsync` non è installato in Replit — usare sempre `tar` per copie cross-directory con esclusioni.
- Il cleanup trap deve rimuovere sia WORKTREE_DIR che BUILD_DIR.
- DIST_DIR è relativo a BUILD_DIR: `"${BUILD_DIR}/dist-ota-emcy"`.
