---
name: GPS offline buffer rimosso
description: Perché il buffer GPS offline client è stato eliminato e cosa NON reintrodurre; framework di log retention server.
---

# Buffer GPS offline (rimosso)

Il vecchio buffer GPS offline client (`appendPointToOfflineBuffer` in `hooks/tracking/useTrackingRefs.ts`)
era un ring buffer **write-only**: scriveva segmenti in AsyncStorage (`@bikerlink/gps_buffer_seg_*`)
a ogni fix GPS ma **non veniva MAI riletto** per il recovery. Su ride lunghe saturava lo storage
SQLite (SQLITE_FULL), e l'errore propagato rompeva la mappa (e a cascata altre schermate).

**Why:** dopo un OTA la mappa e le campagne si rompevano; root cause = saturazione AsyncStorage
da parte di questo buffer inutile.

**How to apply:** NON reintrodurre persistenza GPS lato client senza un percorso di lettura/recovery
reale. Il re-invio dei punti in assenza di rete è già coperto da `pointsBufferRef` + `flushPoints`
(retry con riaccodamento su errore).

**Lezione: il recovery di uno storage saturo va eseguito al BOOT, mai su una schermata che lo
stato rotto impedisce di raggiungere.** Lo stesso sintomo (storage SQLITE_FULL) si manifesta come
triade: mappa nera (home) + immagini campagne nere + upload immagine che congela l'app (la
manipolazione immagine scrive un temp file che fallisce su storage pieno). Se la mappa nera è sulla
home, l'utente non raggiunge mai altre tab, quindi un cleanup montato su una tab secondaria non
gira mai. Il recovery vero gira nel bootstrap dell'app e cancella per PREFISSO di chiave (non per
range numerico fisso). Rimuovere il codice che scriveva il buffer NON libera lo storage già pieno:
serve un purge esplicito al boot finché esistono installazioni vecchie intasate.

# Log retention server

`server/jobs/log-retention.ts` è config-driven (`RETENTION_TARGETS`): per aggiungere un log basta una
riga con tabella + colonna timestamp + giorni. Gira al boot (+2min) e poi ogni 5 giorni.

**Attenzione:** `system_signals` e `maps_telemetry_events` hanno GIÀ un cleanup proprio nel watchdog
a 7 giorni — nel job di retention sono allineati a 7gg come safety net, non abbassare sotto i 7
o si rischia di cancellare dati che il watchdog si aspetta. Il purge una-tantum TOTALE di `gps_errors`
è gated dal flag AppSetting `logRetention.gpsErrorsPurgedV1` ed esegue delete+set-flag nella stessa
transazione (atomico) per non ripetersi cancellando di continuo la telemetria.

**Eccezione `notification_history`:** NON è una tabella drizzle (creata via SQL raw in
`boot-phase3-db-init.ts`), quindi non può stare in `RETENTION_TARGETS`. Ha un purge dedicato
`purgeNotificationHistory()` con DELETE SQL grezza su `created_at`; soglia configurabile via
AppSetting `notification_history_retention_days` (default 60gg) — stesso pattern di
`ai_audit_retention_days` in vacuum-service.ts.
