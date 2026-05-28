# Smoke Test — Pannello Admin BikerLink

Checklist manuale del pannello Admin web. Da eseguire dopo merge / deploy / OTA
insieme allo smoke dell'app (`docs/smoke-test.md`). Annotare PASS/FAIL nel report
giornaliero (`docs/smoke-test-report-<YYYY-MM-DD>.md`).

Accesso: `/admin` con account ruolo `admin`. Nessuna delle azioni qui sotto deve
essere eseguita su dati di produzione: usare ambiente dev/staging.

| Sezione | Voce | Severità | Passi | Risultato atteso |
|---------|------|----------|-------|------------------|
| Health | DB integrity | BLOCKER | Aprire `Admin → Health → DB` | tutti i check verdi |
| Health | Server status | BLOCKER | `Admin → Health → Server` | uptime > 0, memory < 90% |
| Health | Watchdog | MAJOR | `Admin → Health → Watchdog` | running, ultimo tick < 2min |
| Users | Search | MAJOR | Cerca per email/nickname | risultati coerenti |
| Users | Edit user | MAJOR | Apri un utente, modifica campo non sensibile, salva | salvato + audit log |
| Users | Ban / Unban | BLOCKER | Ban utente di test, login da app | login bloccato; unban ripristina |
| Users | Device stats | MINOR | `Admin → Users → Devices` | grafico/tabella popolati |
| Matching | Engine on/off | BLOCKER | Toggle engine | stato persistito; effetto su `/api/matches` |
| Matching | Rules edit | MAJOR | Modifica una regola, salva | versione regola incrementata |
| Matching | Telemetry | MAJOR | `Admin → Matching → Telemetry` | grafici visibili, dati recenti |
| Moderation | Digest AI | MAJOR | Apri ultimo digest | report leggibile |
| Moderation | False reports | MAJOR | Apri lista report falsi | filtri funzionanti |
| Moderation | Log | MINOR | Apri log moderazione | eventi recenti |
| Maps | Tile provider config | BLOCKER | Cambia provider, salva | `GET /api/maps/provider/status` riflette il cambio |
| Maps | Rollout | MAJOR | Modifica % rollout | persistito |
| Maps | Routing test | MAJOR | Esegui test route A→B | distanza/durata coerenti |
| OTA | Pubblicazione | BLOCKER | Pubblica OTA dummy | manifest aggiornato |
| OTA | Assistant chatbot | MINOR | Chiedi help al chatbot OTA | risponde |
| OTA | Rollback | MAJOR | Rollback ultimo OTA | manifest torna alla versione precedente |
| Sensors | Debug realtime | MINOR | `Admin → Sensors` con device attivo | stream live di lettura sensori |
| Ads | Creazione | MAJOR | Crea ad di test | comparisa in lista |
| Ads | Rotazione | MAJOR | Verifica rotazione | almeno 2 ads ruotano |
| Ads | Analytics click | MINOR | Clicca su un ad, verifica counter | incrementa |
| Stregatti | Gestione utenti virtuali | MAJOR | Crea/edit Stregatto | salvato |
| AI Hub | Console (#2664) | MAJOR | Apri AI Hub, invia prompt diagnostica | risposta entro 10s |
| Invite codes | Creazione | MAJOR | Crea codice (max uses, expires) | codice creato |
| Invite codes | Attivazione | BLOCKER | Usa il codice in registrazione | utente creato, counter incrementato |
| Invite codes | Max uses | MAJOR | Esaurisci max uses | nuovo uso rifiutato |
| Invite codes | Expires | MAJOR | Crea codice scaduto | rifiutato |
| Invite codes | Gift | MINOR | Verifica gift al referrer | gift assegnato |
