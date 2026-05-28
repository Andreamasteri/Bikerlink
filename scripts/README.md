# scripts/

Raccolta script operativi (smoke, e2e, migration helpers, build, ecc.).

## Smoke / E2E AI

| Script | Scopo |
|---|---|
| `smoke-ai-console-backend.ts` | Smoke pure-logic (no DB/LLM) per la AI Console backend: SCOPES, schema Drizzle, tool registry. |
| `smoke-ai-system.ts` | **Task #2663.** Smoke runtime end-to-end di tutto il sistema AI (Watchdog, AI Console, AI Pinned, AI Layer, AI Moderation, FAB). Chiama ogni endpoint usato dalle schermate admin e stampa OK/FAIL con status + tempo di risposta. Exit code != 0 se almeno un FAIL. |
| `e2e-ai-coordinator.ts` | E2E Coordinator + Governance (scenari A–F): conflict resolution, kill-switch, override, coordinator-down simulation. |

### Eseguire `smoke-ai-system.ts`

Prerequisiti: backend in ascolto su `E2E_BASE` (default `http://localhost:5000`), `ADMIN_USER_ID` di un utente con role `admin`/`moderator`/`superadmin`, e `SESSION_SECRET` (per auto-firmare la sessione) **oppure** un `SESSION_COOKIE` valido già pronto.

```bash
# Auto-firma sessione admin (usa SESSION_SECRET dal .env)
ADMIN_USER_ID=<uuid> npx tsx scripts/smoke-ai-system.ts

# Oppure con cookie già pronto
SESSION_COOKIE='connect.sid=...' ADMIN_USER_ID=<uuid> npx tsx scripts/smoke-ai-system.ts

# Backend remoto
E2E_BASE=https://staging.example.com ADMIN_USER_ID=<uuid> SESSION_COOKIE='...' \
  npx tsx scripts/smoke-ai-system.ts
```

Cosa fa:

- Crea on-the-fly 2 proposte watchdog dummy (`kind=proposal`, `scope=smoke-test`) per testare realmente `proposals/:id/accept` e `proposals/:id/reject`.
- Crea 1 conversazione + 1 messaggio dummy per testare `pin/:messageId`, `pinned`, `DELETE pinned/:id` e `DELETE conversations/:id`.
- Per gli endpoint SSE (`/watchdog/chat`, `/ai/console/message`) verifica solo l'handshake (status 200 + `Content-Type: text/event-stream`) e chiude la connessione — **non bruciamo budget LLM**.
- A fine run cancella tutti i record dummy e (se ha firmato lei la sessione) distrugge il `session` row.

Esempio output:

```
Smoke AI System — base=http://localhost:5000 admin=a1b2c3d4…

── Watchdog ─────────────────────────────────────────
✓ GET /api/admin/watchdog/snapshot → 200 (38ms)
✓ GET /api/admin/watchdog/snapshots?limit=10 → 200 (22ms)
…
══════════════════════════════════════════════════════
Totale endpoint testati: 38   OK: 38   FAIL: 0   (4127ms cumulati)
══════════════════════════════════════════════════════
```

Endpoint coperti (high-level):

- **Watchdog** — `snapshot`, `snapshots`, `logs`, `weekly-reports`, `enabled`, `run-now`, `propose-now`, `proposals/:id/accept`, `proposals/:id/reject`, `chat` (SSE).
- **AI Console** — `scopes`, `budget`, `admin-prefs` (GET+PATCH), `conversations` (GET/POST/DELETE), `conversations/:id/messages`, `conversations/:id/pin/:messageId`, `pinned` (GET/DELETE), `actions/pending`, `search`, `message` (SSE).
- **AI Layer** — `overview`, `health`, `audit`, `policies`, `policies/yaml`, `policies/validate`, `paused`, `pause`, `resume`, `conflicts`, `cleanup-status`.
- **AI Moderation** — `stats`, `settings`, `hub-card`, `digest/latest`, `digest/unread`, `digest/run`, `anomaly/scan`.

> ⚠️ Lo scopo è verificare che **nessun endpoint crashi** e che il contratto auth funzioni. Eventuali bug runtime trovati vanno tracciati come task separati (vedi "Out of scope" in `.local/tasks/task-2663.md`).
