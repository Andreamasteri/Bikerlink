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
(retry con riaccodamento su errore). Un `useEffect` mount-once in `useTrackingState.ts` svuota i
segmenti legacy sui device già intasati — tenerlo finché ci sono installazioni vecchie in giro.

# Log retention server

`server/jobs/log-retention.ts` è config-driven (`RETENTION_TARGETS`): per aggiungere un log basta una
riga con tabella + colonna timestamp + giorni. Gira al boot (+2min) e poi ogni 5 giorni.

**Attenzione:** `system_signals` e `maps_telemetry_events` hanno GIÀ un cleanup proprio nel watchdog
a 7 giorni — nel job di retention sono allineati a 7gg come safety net, non abbassare sotto i 7
o si rischia di cancellare dati che il watchdog si aspetta. Il purge una-tantum TOTALE di `gps_errors`
è gated dal flag AppSetting `logRetention.gpsErrorsPurgedV1` ed esegue delete+set-flag nella stessa
transazione (atomico) per non ripetersi cancellando di continuo la telemetria.
