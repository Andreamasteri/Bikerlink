# Audit pre-aggiornamento: @bull-board/api + @bull-board/express

**Data audit**: 2026-06-13
**Versione attuale**: 7.2.1
**Versione target**: 8.0.0 (latest, rilasciata 2026-06-11)
**File analizzati**: `server/cache/bull-board.ts`, `server/routes.ts`, `package.json`

---

## Versioni disponibili nel range 7.x – 8.x

| Versione | Data |
|----------|------|
| 7.0.0 | 2026-04-14 |
| 7.1.3 | 2026-05-14 |
| 7.1.5 | 2026-05-14 |
| 7.2.0 | 2026-06-07 |
| 7.2.1 | 2026-06-07 |
| **8.0.0** | **2026-06-11** |

Non esistono versioni intermedie tra 7.2.1 e 8.0.0.

---

## Changelog 7.2.1 → 8.0.0

Fonte: `https://raw.githubusercontent.com/felixmosh/bull-board/master/CHANGELOG.md`

### Features
- Docs & Demo site (#1217)
- Localizzazione tedesca de-DE (#1215)

### Chores
- `date-fns` localization rimossa, sostituita con native `Intl` API (cambio interno UI, zero impatto API server)

### Documentation
- Documentazione opzione `uiConfig.showMetrics` (#1216)
- README cleanup

**Nessun breaking change alle API server-side.**

---

## API usate in `server/cache/bull-board.ts`

| Symbol | Import da | Stato in v8.0.0 |
|--------|-----------|-----------------|
| `createBullBoard` | `@bull-board/api` | ✅ invariata |
| `BullMQAdapter` | `@bull-board/api/bullMQAdapter` | ✅ invariata |
| `ExpressAdapter` | `@bull-board/express` | ✅ invariata |
| `serverAdapter.setBasePath(path)` | metodo di `ExpressAdapter` | ✅ invariato |
| `serverAdapter.getRouter()` | metodo di `ExpressAdapter` | ✅ invariato |

---

## Sub-path export `@bull-board/api/bullMQAdapter`

Confronto campo `exports` in `package.json`:

| Versione | Entry | File |
|----------|-------|------|
| 7.2.1 | `"./bullMQAdapter"` | `"./bullMQAdapter.js"` |
| 8.0.0 | `"./bullMQAdapter"` | `"./bullMQAdapter.js"` |

**Identico in entrambe le versioni.** L'import dinamico `await import("@bull-board/api/bullMQAdapter")` continua a funzionare senza modifiche.

---

## Compatibilità peer/dep

### BullMQ
`@bull-board/api` non dichiara `bullmq` come peer dep in nessuna versione (7.x né 8.x).
BullMQ installato nel progetto: `5.78.0`. **Nessun conflitto.**

### Express
- `@bull-board/express@8.0.0` richiede `express@^5.2.1`
- Express installato nel progetto: `5.2.1` ✅

### Nuova dipendenza in v8.0.0
- `@bull-board/express@8.0.0` introduce `ejs@^6.0.1` come dipendenza diretta (template engine per la UI).
  Viene installata automaticamente da npm. **Nessuna modifica al codice applicativo.**

### Dipendenza interna `@bull-board/ui`
- v7.2.1 dipende da `@bull-board/ui@7.2.1`
- v8.0.0 dipende da `@bull-board/ui@8.0.0`

Il bump è automatico e trasparente: `@bull-board/ui` è una dipendenza interna di presentazione senza API esposte al codice applicativo.

---

## Modifiche necessarie al codice

**Nessuna.**

`server/cache/bull-board.ts` e `server/routes.ts` non richiedono alcuna modifica.

---

## Conclusione

**SAFE TO UPGRADE a 8.0.0.**

L'aggiornamento si riduce a un bump di versione in `package.json` + reinstallazione delle dipendenze. Il task di aggiornamento effettivo è tracciato separatamente.
