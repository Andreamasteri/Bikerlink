---
name: bootguard-toggle
description: Accendi/spegni il BootGuard diagnostico (BootGate) sui device BikerLink da qui, e leggi il log di boot APPROFONDITO in tempo reale. Usa questa skill quando l'utente dice "attiva/disattiva bootguard", "accendi/spegni la diagnostica di avvio", "fammi vedere il log di boot", "perché l'app non parte", o quando devi diagnosticare un crash-loop al boot di un APK/OTA in produzione.
---

# BootGuard — toggle + log di boot in tempo reale

Il **BootGuard** (BootGate diagnostico, Task #4979/#5061) è una rete di sicurezza
al cold start dell'app Expo. Quando è ATTIVO, il client monta i provider uno alla
volta dietro una schermata di bisect interattiva e invia un *ping* per ogni
checkpoint. Così, se l'app crasha al boot, invece di un crash-loop silenzioso si
vede ESATTAMENTE dove si ferma — e l'agente legge tutto da qui.

Quando è SPENTO (default) il percorso di boot è quello normale, byte-per-byte
invariato: zero overhead.

## ⚠️ Importante: dev e prod condividono il DB

Gli script usano `server/db` (stesso `DATABASE_URL` del server). In questo Repl il
database gestito è condiviso tra dev e produzione, quindi **scrivere il flag qui
ha effetto reale sui device in produzione al prossimo avvio**. Il flag arriva al
client tramite il manifest OTA (`GET /api/ota/manifest → bootGateEnabled`), letto
da `resolveBootGateActive()` in `app/_layout.tsx`.

## Accendere / spegnere il BootGuard

```bash
npx tsx scripts/bootguard.ts status   # stato attuale (default)
npx tsx scripts/bootguard.ts on       # ATTIVA → device entrano in diagnostica al prossimo avvio
npx tsx scripts/bootguard.ts off      # SPEGNE → boot normale
```

Lo script fa upsert di `boot_gate_enabled` in `app_settings` (`true`/`false`).
È idempotente e stampa stato prima/dopo.

Note operative:
- Il device applica il cambio al **prossimo avvio** (rilegge il manifest).
- Su un'app già aperta NON cambia nulla finché non viene riavviata.
- Per gli account admin che testano una OTA pending serve "Prova OTA"; le OTA
  pending non si auto-applicano.

## Leggere il log di boot in tempo reale

```bash
npx tsx scripts/dump-boot-log.ts            # watch continuo (ogni 15s, default)
npx tsx scripts/dump-boot-log.ts --once     # snapshot una tantum
npx tsx scripts/dump-boot-log.ts --limit 10 # snapshot + ultimi 10 crash log
```

Consolida tre fonti del DB in una vista unica e annotata:

1. **`boot_gate_enabled`** — BootGuard attivo o spento.
2. **`boot_gate_latest_ping`** — timeline dell'ultimo boot bisect (ultimi 30 step).
   Ogni step è arricchito con etichetta + modulo + `knownRisks` da
   `lib/boot-gate-steps.ts`, così si capisce a quale area (e a quale fix
   anti-crash-loop) corrisponde ogni checkpoint. Stampa anche un **🔎 Sospetto**
   con lo step dove il boot si è fermato.
3. **`boot_gate_latest_error`** — ultimo errore client di boot (message + stack +
   componentStack). Viene persistito SOLO quando il BootGuard è attivo, dalla
   route `POST /api/admin/client-error`.
4. **`app_crash_logs`** — crash e segnali recenti dei device.

### Lettura in tempo reale dall'agente

Il limite di workflow Replit (10) è già saturo in questo Repl, quindi NON c'è un
workflow dedicato "Boot Log". L'agente legge in tempo reale così:

- **on-demand**: `npx tsx scripts/dump-boot-log.ts --once` via bash — snapshot
  immediato (stesso pattern di "Diagnostic Report" letto via `refresh_all_logs`).
- **streaming**: `npx tsx scripts/dump-boot-log.ts` in un terminale bash — stampa
  ogni nuovo ping/errore di boot appena arriva (polling 15s).

Se in futuro si libera uno slot workflow, si può aggiungere
`configureWorkflow({ name: "Boot Log", command: "npx tsx scripts/dump-boot-log.ts", outputType: "console" })`
per catturare gli eventi via `refresh_all_logs` automaticamente.

## Flusso tipico di diagnosi crash-loop

1. `npx tsx scripts/bootguard.ts on` — attiva la rete di sicurezza.
2. Pubblica/installa la build da testare; l'utente avvia l'app.
3. `npx tsx scripts/dump-boot-log.ts --once` (o leggi il workflow "Boot Log") per
   vedere dove si ferma il boot e l'errore esatto.
4. Applica il fix mirato all'area indicata da `module` / `knownRisks`.
5. `npx tsx scripts/bootguard.ts off` quando il boot è confermato sano.

## Anti-regressione (NON reintrodurre crash-loop)

Il logging NON deve causare re-render: i ping passano da ref/throttle, i gate non
restituiscono mai `null` senza children, niente prop inline su
`tabBar`/`headerLeft`/`screenOptions`. Vedi memoria: `map-ready-gate-null-bug`,
`rnav-screenoptions-nested`, `stack-screen-inline-options`, `context-provider-value-memo`.
Gate CI da rispettare prima di pubblicare: `scripts/check-rnav-inline-props.sh`,
typecheck client+server, lint `--max-warnings=0`.
