# BikerLink — Audit di Coerenza Integrazione
**Data**: 2026-06-07  
**Scope**: Verifica sistematica dei task recentemente mergiati — rotte backend, schema DB, chiavi i18n, riferimenti frontend.  
**Metodo**: analisi statica (grep, TypeScript compiler, schema-drift, migration-prefix-check), lettura diretta dei file sorgente, confronto tra moduli.

---

## Legenda

| Simbolo | Significato |
|---------|-------------|
| ✅ | OK — integrato correttamente |
| ⚠️ | WARNING — discrepanza non bloccante / comportamento diverso da atteso |
| ❌ | ERRORE — assente o rotto, richiede azione |

---

## 1. TypeCheck Completo

**Risultato: ✅ VERDE — 6 check passati, 0 falliti**

| Check | Stato |
|-------|-------|
| Client (Expo / React Native) — import check | ✅ |
| Server (Express / Node.js) — import check | ✅ |
| Scripts — full typecheck | ✅ |
| Server Tests — full typecheck | ✅ |
| Root — full typecheck | ✅ |
| Schema-import guard (Check B/C/E) | ✅ (31 warning informativi) |
| Version alignment (app.json / build.gradle / strings.xml) | ✅ |
| Leaflet map guard (anti black-map) | ✅ |

**Note sui warning (31):** tutti riferiti a `shared/db/*.ts` che importano `drizzle-orm`. Comportamento noto e mitigato dal Proxy mock (`mocks/empty.js`). Non richiedono azione.

---

## 2. Schema DB

### 2a. Campi Ghost Mode
| Campo | Schema | Migrazione | Stato |
|-------|--------|-----------|-------|
| `users.ghost_mode` (`ghostMode`) | `shared/db/users.ts:63` | ✅ presente | ✅ |
| `users.privacy_accepted` (`privacyAccepted`) | `shared/db/users.ts:48` | ✅ presente | ✅ |
| `users.consent_accepted_at` (`consentAcceptedAt`) | `shared/db/users.ts:50` | ✅ presente | ✅ |

### 2b. Tabella Consensi GDPR
| Elemento | Stato | Note |
|---------|-------|------|
| Tabella `user_consents` separata | ❌ NON ESISTE | Non è mai stata creata né in `shared/db/` né in nessuna migration |
| Consenso attualmente memorizzato | ⚠️ inline su `users` | `privacyAccepted=true`, `consentAcceptedAt=now()` al momento della registrazione |
| Audit trail separato per tipo consenso | ❌ ASSENTE | Impossibile tracciare revoche parziali o multipli tipi di consenso |

**Raccomandazione:** Se si richiede un audit trail GDPR conforme, creare tabella `user_consents` con colonne `user_id`, `consent_type`, `accepted_at`, `revoked_at`.

### 2c. Schema MotoClub
| Campo | Schema | Stato |
|-------|--------|-------|
| Toggle "accetta zavorrine" per club | ❌ NON ESISTE in `shared/db/motoclubs.ts` | Non implementato nello schema |

### 2d. Schema Drift e Migration
| Check | Risultato |
|-------|-----------|
| Schema-drift (registry ↔ migration) | ✅ verde — 1 noto in baseline (`match_negative_preferences`) |
| Migration prefix duplicati | ✅ verde — 2 noti in baseline (0067, 0072) |

---

## 3. Rotte Backend

### 3a. Rotte presenti e correttamente registrate
| Endpoint | File | Registrazione | Stato |
|---------|------|--------------|-------|
| `POST /api/sos` | `server/routes/sos.ts` | `routes.ts:294` | ✅ |
| `GET /api/sos/nearby` | `server/routes/sos.ts` | incluso nello stesso router | ✅ |
| `PUT /api/users/me/ghost-mode` | `server/routes/users/profile.ts:292` | montato su `/api/users` | ✅ |
| `GET /api/admin/backup-preview` | `server/routes/admin/backup-preview.ts` | `admin.ts:416` | ✅ |
| `GET /api/motoclubs/:id/members` | `server/routes/motoclubs/members.ts` | incluso nel motoclubs router | ✅ |
| `PUT /api/users/me` | `server/routes/users/profile.ts` | ✅ | ✅ |

### 3b. Rotte assenti (mai registrate)
| Endpoint | Stato | Note |
|---------|-------|------|
| `GET /api/gdpr/export` | ❌ NON TROVATA | Nessun router GDPR registrato in `server/routes.ts` |
| `DELETE /api/gdpr/consent` | ❌ NON TROVATA | Idem |
| `POST /api/gdpr/consent` | ❌ NON TROVATA | Idem |

**Note:** `server/routes/admin/legal.ts` esiste ma gestisce solo generazione documenti interni (EULA, Privacy Policy), non export GDPR utente.  
Il frontend (`app/privacy-policy.tsx`) espone testo GDPR ma non chiama endpoint GDPR user-facing.

---

## 4. Ghost Mode — Filtro nelle Query

| Modulo | Ghost escluso? | Metodo | Stato |
|--------|---------------|--------|-------|
| `server/routes/discovery/discovery.ts` | ✅ | filtro SQL esplicito | ✅ |
| `server/routes/discovery/discovery-available.ts` | ✅ | filtro SQL esplicito | ✅ |
| `server/routes/discovery/discovery.next.ts` | ✅ | filtro SQL esplicito | ✅ |
| `server/matching/run-matching.ts` | ✅ | commento SQL: "admin/fake/ghost esclusi via SQL" (righe 51, 87) | ✅ |
| `server/routes/proposals/matching/biker.ts` | ⚠️ nessun filtro esplicito nel JS | il filtro avviene nella query SQL base di `getActiveProposalCandidatePairs()` | ⚠️ da verificare |
| `server/routes/proposals/matching/garage.ts` | ⚠️ nessun filtro esplicito nel JS | idem | ⚠️ da verificare |

**Raccomandazione:** Verificare che `storage.getActiveProposalCandidatePairs()` e `storage.getActiveProposalsWithLocationStats()` escludano effettivamente `ghost_mode=true` a livello SQL prima di consegnare i candidati a `biker.ts` e `garage.ts`.

---

## 5. Internazionalizzazione (i18n)

### 5a. Conteggio chiavi per lingua
| Lingua | File | Chiavi | Gap vs IT |
|--------|------|--------|----------|
| IT (sorgente) | `lib/i18n/it.ts` | **1333** | — |
| EN | `lib/i18n/en.ts` | 1176 | **-142** |
| DE | `lib/i18n/de.ts` | 1160 | **-174** |
| ES | `lib/i18n/es.ts` | 1160 | **-174** |
| FR | `lib/i18n/fr.ts` | 1160 | **-174** |

> **Nota:** `t()` fa fallback su IT quando una chiave manca — l'app non crasha, ma gli utenti non-IT vedono stringhe in italiano.

### 5b. Chiavi critiche per feature recenti
| Feature | Chiavi IT | EN | DE/ES/FR |
|---------|-----------|----|----|
| Ghost Mode (`ride.ghostMode`, `ride.ghostModeDesc`, `ride.ghostModeNotAvailable`, `admin.ghostModeLabel`, `admin.ghostBgTracking`) | ✅ | ✅ | ✅ |
| GDPR/Consenso (`profile.revokeConsent`, `profile.revokeConsentTitle`, `profile.revokeConsentDesc`) | ✅ | ✅ | ✅ |
| SOS (`ready.cancelSosTitle`, `ready.cancelSosMsg`, `home.sosActive`) | ✅ | ✅ | ✅ |

### 5c. Gruppi di chiavi mancanti (EN: 142, DE/ES/FR: 174)
Le chiavi mancanti riguardano feature aggiunte dopo l'ultimo sync traduzioni:

| Gruppo | Chiavi | Mancante in |
|--------|--------|------------|
| `timeProfile.*` (18 chiavi) — profilo orario di guida | ✅ IT | EN, DE, ES, FR |
| `tracking.mountCalib.*` (18 chiavi) — calibrazione montaggio | ✅ IT | EN, DE, ES, FR |
| `push.*` (6 chiavi) — notifiche push | ✅ IT | EN, DE, ES, FR |
| `profile.sensorsCalib.*` (9 chiavi) — calibrazione sensori | ✅ IT | EN, DE, ES, FR |
| `aiAssistant.*` (18 chiavi) — AI Assistant | ✅ IT | EN, DE, ES, FR |
| `music.*` (6 chiavi) — playlist/musica | ✅ IT | EN, DE, ES, FR |
| `admin.*` (14 chiavi) — pannello admin (descrizioni, campagne, DB) | ✅ IT | EN, DE, ES, FR |
| `match.*` proposta/profilo/route/telemetry (22 chiavi) | ✅ IT | EN, DE, ES, FR |
| `match.styleLabel.*` (11 chiavi) — stili guida telemetria | ✅ IT | DE, ES, FR |
| `register.step2.gender`, `register.step3.*` (9 chiavi) — registrazione | ✅ IT | DE, ES, FR |
| `nav.rerouted`, `nav.rerouting`, `common.*` vari | ✅ IT | EN, DE, ES, FR |
| `garage.noMoto`, `garage.motorcycle`, `garage.motorcycles` | ✅ IT | EN, DE, ES, FR |
| `tracking.gpsStartError`, `tracking.permReq/permDenied`, tracking export/delete | ✅ IT | EN, DE, ES, FR |

**Azione consigliata:** tradurre i 142 blocchi EN (che vengono poi usati come base per DE/ES/FR).

---

## 6. Matching Engine — Comportamento Schedulazione

| Modalità | Presente | Stato |
|---------|---------|-------|
| On-demand (trigger da login utente) | ✅ `triggerMatchingRun()` | ✅ corretto |
| Ciclo orario automatico (`setInterval`, 60 min) | ✅ `scheduler.ts:282` | ⚠️ presente |

**Osservazione:** Il log di boot recita:
```
[Matching] Engine avviato — modalità on-demand (trigger da login utente)
[Matching] Ciclo di matching automatico orario avviato
```
Le due righe sono contraddittorie: il messaggio dichiara "on-demand" ma il ciclo orario è attivo. Il ciclo usa lo stesso `triggerMatchingRun()` dell'on-demand, quindi non crea doppioni ma aumenta il carico base (1 ciclo ogni 60 minuti indipendentemente dall'attività).

**Nessuna azione bloccante** — il ciclo è controllato dall'`AppSetting auto_matching_enabled` (default: `true`). Se si vuole eliminare il ciclo orario, rimuovere il `setInterval` a `scheduler.ts:281-291`.

---

## 7. Consenso GDPR in Registrazione

| Aspetto | Stato | Dettaglio |
|---------|-------|----------|
| Consenso registrato al signup | ✅ | `register.ts:171-173`: `privacyAccepted: true`, `consentAcceptedAt: new Date()` |
| Tabella audit separata | ❌ ASSENTE | `user_consents` non esiste |
| Consenso per tipo (privacy / termini / marketing) | ⚠️ PARZIALE | solo `privacyAccepted` (booleano), nessun tipo separato |
| Marketing consent | ✅ | colonna `marketing_consent` su users (migration 0072) |
| Revoca consenso utente | ✅ | `profile.revokeConsentDesc` nella UI → cancellazione account |

---

## 8. Admin Panel — Integrità

| Schermata | File | Stato |
|---------|------|-------|
| Layout admin | `app/admin/_layout.tsx` | ✅ Stack corretto, nessun import rotto |
| Backup preview | `server/routes/admin/backup-preview.ts` → `/backup-preview` | ✅ |
| Google Drive backup | `server/backup-service.ts` + `server/google-drive-backup.ts` | ✅ usa Replit Connector (nessuna credenziale hardcoded) |
| Ads management | `app/admin/ads.tsx` | ✅ esiste |
| Matching diagnostics | `server/routes/admin/matching/diagnostics.ts` | ✅ esiste |

---

## 9. MotoClub — Zavorrine Toggle

| Elemento | Stato | Note |
|---------|-------|------|
| Campo `allow_zavorrine` (o equivalente) in `motoclubs` | ❌ NON IMPLEMENTATO | Assente da `shared/db/motoclubs.ts` (157 righe, nessun riferimento) |
| Logica di filtering per club | ❌ NON IMPLEMENTATA | Nessun filtro trovato nelle route motoclubs |

**Azione richiesta:** se la feature è prevista, aggiungere colonna booleana `allow_zavorrine` alla tabella `moto_clubs` con migration dedicata.

---

## 10. Ads — Placement 'match'

| Elemento | Stato | Note |
|---------|-------|------|
| Placement `'match'` in `ad_campaigns` | ⚠️ NON VERIFICABILE | Il campo `placement` è free-form varchar — nessuna enum validation |
| Endpoint che filtra per `placement='match'` | ❌ NON TROVATO | `server/routes/ads.ts` non espone filtri per placement specifico |
| Admin `placement='match'` | ❌ NON TROVATO | `app/admin/ads.tsx` non lo gestisce separatamente |

**Nota:** Poiché il campo è free-form, il placement 'match' potrebbe esistere nei dati senza alcuna route che lo serva. Se era una feature da rimuovere, è già assente dalla logica; se era da aggiungere, manca l'implementazione.

---

## Riepilogo Azioni

### 🔴 Critiche
| # | Area | Problema | Azione |
|---|------|---------|--------|
| C1 | Rotte | `GET /api/gdpr/export`, `DELETE /api/gdpr/consent` assenti | Implementare router GDPR user-facing o documentare che non sono previste |
| C2 | Schema | Tabella `user_consents` non esiste | Creare tabella + migration se richiesto audit trail GDPR |

### 🟡 Warning
| # | Area | Problema | Azione |
|---|------|---------|--------|
| W1 | i18n | 142 chiavi mancanti in EN, 174 in DE/ES/FR | Traduzione (il fallback IT evita crash) |
| W2 | Ghost Mode | `biker.ts` e `garage.ts` non filtrano esplicitamente ghost in JS | Verificare che la SQL base escluda già ghost_mode=true |
| W3 | Matching | Ciclo orario contraddice messaggio "on-demand" | Rimuovere setInterval se on-demand è l'unica modalità desiderata |
| W4 | MotoClub | `allow_zavorrine` non implementato nello schema | Aggiungere se la feature è pianificata |
| W5 | Ads | Placement 'match' senza enum validation né route dedicata | Aggiungere validation o documentare come intenzionale |

### 🟢 OK
| Area | Stato |
|------|-------|
| TypeCheck completo (6 check) | ✅ |
| Ghost mode filtro nelle discovery routes | ✅ |
| Ghost mode chiavi i18n (tutte le lingue) | ✅ |
| GDPR consent chiavi i18n (tutte le lingue) | ✅ |
| SOS route e chiavi i18n | ✅ |
| Backup Google Drive (Connector, no hardcoded) | ✅ |
| MotoClub members route | ✅ |
| Admin panel layout e import | ✅ |
| Schema drift: verde | ✅ |
| Migration prefix: verde | ✅ |
| Version alignment (app.json, build.gradle, strings.xml) | ✅ |
| Consenso registrazione (users.privacyAccepted, consentAcceptedAt) | ✅ |
| Marketing consent (migration 0072) | ✅ |
| Leaflet map guard | ✅ |

---

*Report generato il 2026-06-07 da analisi statica del codebase. Nessuna modifica al codice effettuata.*
