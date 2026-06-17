---
name: diagnostic-report-dump
description: Legge e stampa su stdout gli ultimi N report diagnostici dalla tabella diagnostic_reports del DB. Usa quando l'utente chiede di vedere i report diagnostici, di controllare i risultati dei test in-app, o quando vuoi leggere i log di diagnosi tramite refresh_all_logs.
---

# Diagnostic Report Dump

Script admin che scarica dal DB i report generati dalla suite diagnostica in-app (7 tap sul numero versione) e li stampa su stdout in formato leggibile.

## File coinvolti

- `scripts/dump-diagnostic-report.ts` — lo script
- `shared/db/diagnostic.ts` — schema tabella `diagnostic_reports` e `diagnostic_queue`
- Workflow `Diagnostic Report` in `.replit` → `npx tsx scripts/dump-diagnostic-report.ts`

## Come usare

### Via workflow (consigliato)
```javascript
await restartWorkflow({ workflowName: "Diagnostic Report" });
// poi:
await refresh_all_logs(); // cattura l'output su stdout
```

### Via bash
```bash
# Ultimo report (default)
npx tsx scripts/dump-diagnostic-report.ts

# Ultimi N report
npx tsx scripts/dump-diagnostic-report.ts --limit 3
```

## Formato output

```
════════════════════════════════════════════════════════════
  DIAGNOSTIC REPORT DUMP  (1 report)
════════════════════════════════════════════════════════════

────────────────────────────────────────────────────────────
  Report 1 / 1
────────────────────────────────────────────────────────────
  ID:          <uuid>
  UserId:      <uuid>
  Nickname:    mario_biker
  Trigger:     auto | admin | remote | user
  App version: 1.4.2
  Platform:    ios | android
  Device:      iPhone 15 Pro
  RunAt:       2026-06-17T10:32:00.000Z
  Sentry ID:   <se presente>

  ── Sommario ──
  PASS:    12
  FAIL:    1
  WARN:    2
  SKIP:    0
  Totale:  15
  Durata:  4231 ms

  ── Risultati ──

  ── Network ──
    ✅ [PASS] Backend raggiungibile (312ms)
    ❌ [FAIL] WebSocket connesso (timeout)  → Connessione WebSocket rifiutata
    ⚠️  [WARN] Latenza API (980ms)  → Latenza elevata: 980ms
```

## Dati nel DB

La tabella `diagnostic_reports` (in `shared/db/diagnostic.ts`) contiene:
- `id`, `userId`, `triggeredBy`, `appVersion`, `platform`, `deviceModel`
- `runAt` (timestamp), `sentryEventId`
- `summary` (JSONB: `{totalTests, passed, failed, warned, skipped, durationMs}`)
- `results` (JSONB: array di `{section, name, status, message?, durationMs}`)

JOIN su `users` per ottenere `nickname`.

## Note

- Lo script usa la connessione DB condivisa (`server/db`) — nessuna connessione propria
- DB vuoto → stampa "Nessun report diagnostico trovato nel DB." + exit 0
- Il workflow termina dopo la stampa (non è un processo persistente)
