---
name: OTA Emergency channel (EMCY)
description: Parallel emergency OTA pipeline — manifest redirect flag, channel-preserving approve, worktree-from-base-commit publish.
---

# OTA Canale Emergenza (EMCY)

Pipeline OTA parallela per riportare TUTTI i device a una base sana quando la production è rotta,
senza ricostruire un APK. Convive con la pipeline production normale.

## Pezzi e invarianti durature

- **Redirect via flag, non via canale hardcoded.** `app_settings('ota_emergency_active')` (string "true"/"false").
  Quando true, `GET /api/ota/manifest` serve l'ultima release `channel='emergency'` invece di `production`.
  Quando false il manifest si comporta ESATTAMENTE come prima (filtra `channel='production'`): tutte le righe
  storiche sono `production`, quindi nessuna regressione. Il filtro canale è la chiave del no-regression.

- **`approve` DEVE preservare `release.channel`.** L'endpoint admin approve storicamente forzava
  `channel:'production'`; approvare una EMCY così la spostava per errore sul canale normale e i device
  production la ricevevano. Fix: `channel: release.channel`. Stessa regola per qualunque update di stato.

- **Toggle ON gated su release approvata.** `POST /api/admin/ota/emergency/toggle {active:true}` rifiuta
  se non esiste una release `channel='emergency', status='approved'`, altrimenti i device riceverebbero
  `allowed:false` e resterebbero senza OTA.

- **Numerazione separata.** Le EMCY usano `ota_version = 'EMCY-N'` (N progressivo proprio), NON il formato
  production `N.N.N`. La sync EAS production ignora le EMCY (regex `^[0-9]+\.[0-9]+\.[0-9]+$`): le righe EMCY
  vengono inserite direttamente dallo script di publish, non auto-sincronizzate.

## publish-ota-emcy.sh — builda da un COMMIT, non da HEAD

- Usa `git worktree add --detach /tmp/... <baseCommit>`: checkout isolato del commit base (recovery base
  OTA-131 = `408f82d1`, runtime `10.0.0`) senza toccare HEAD/branch. Trap di cleanup rimuove il worktree.
- **G2 (npm ci + proxy):** applica il sed `package-firewall.replit.local → registry.npmjs.org` al
  `package-lock.json` del worktree PRIMA di `npm ci`, altrimenti npm ci risolve dal proxy Replit e poi EAS
  crasha. ci dal lockfile del commit base = deps esatte di quella release.
- **G1 (runtime guard):** se `app.json.expo.runtimeVersion` del commit base ≠ atteso → ABORT (i device sul
  runtime atteso non riceverebbero l'OTA). **G4 (smoke test):** il bundle Hermes/JS deve esistere e essere
  > ~1KB prima dell'upload. **G3:** la release entra sempre `status='pending'` (admin-first).
- `--channel production` + `--patch <diff>` riusa lo stesso strumento per il bootstrap (deploy di un fix
  sopra il commit base sul canale production). `--dry-run` valida tutto senza pubblicare.

## Vincolo workflow

Il progetto gira già 12 workflow CI (limite Replit 10): NON si possono aggiungere workflow. Una pubblicazione
è un comando one-off → si lancia via `bash scripts/publish-ota-emcy.sh ...`, non come workflow.
