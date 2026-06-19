# Smoke Test — BikerLink App

Checklist end-to-end per verificare in modo rapido e ripetibile che le aree critiche
dell'app (frontend Expo + backend Express) siano funzionanti dopo merge, deploy o OTA.

- **Esecuzione**: per ogni voce, eseguire i passi, confrontare con il "Risultato atteso"
  e annotare PASS / FAIL nel report giornaliero (`docs/smoke-test-report-<YYYY-MM-DD>.md`).
- **Severità**:
  - **BLOCKER** → blocca rilascio / OTA / deploy.
  - **MAJOR** → degrado funzionale importante, fix prima del prossimo OTA.
  - **MINOR** → bug cosmetico o non critico, può essere schedulato.
- **Automazione**: le voci marcate ⚙️ sono coperte da `scripts/smoke/run-smoke.ts`
  (workflow Replit `Smoke Test`). Le restanti sono manuali (UI).
- **Admin panel**: vedi `docs/smoke-test-admin.md`.

---

## 1. Auth & Onboarding

| # | Voce | Severità | Auto | Passi | Risultato atteso |
|---|------|----------|------|-------|------------------|
| 1.1 | Health endpoint | BLOCKER | ⚙️ | `GET /healthz` | 200 + `{ ok: true }` o equivalente |
| 1.2 | Registrazione Biker | BLOCKER | ⚙️ | `POST /api/auth/register` con email/password/nickname/userType=biker | 200/201 + utente creato, email di verifica inviata |
| 1.3 | Registrazione Zavorrina | BLOCKER | — | UI → Register → userType=zavorrina | utente creato, redirect a verifica email |
| 1.4 | Registrazione con codice invito | MAJOR | — | UI → Register con `inviteCode` valido | utente creato, codice marcato come usato |
| 1.5 | Email di verifica | BLOCKER | — | Aprire mailbox dell'account smoke | email arriva entro 60s con codice 8 hex |
| 1.6 | Verifica codice email | BLOCKER | ⚙️ | `POST /api/auth/verify-email` con codice | 200 + account `status=active` |
| 1.7 | Login | BLOCKER | ⚙️ | `POST /api/auth/login` con credenziali | 200 + cookie sessione |
| 1.8 | Logout | MAJOR | ⚙️ | `POST /api/auth/logout` | 200 + sessione invalidata |
| 1.9 | Password reset | MAJOR | — | UI → Forgot password → mail → reset | password aggiornata, login ok con la nuova |
| 1.10 | Sessione persistente | MAJOR | — | Login → restart app → riapertura | utente ancora loggato |
| 1.11 | GPS Gate denied | BLOCKER | — | Negare permessi posizione al primo avvio | tab `Mappa`, `Match`, `Giri` mostrano CTA di sblocco; tab `Profilo` accessibile |
| 1.12 | GPS Gate granted | BLOCKER | — | Concedere permessi posizione | tutte le tab accessibili; heartbeat parte (verificare in admin Health) |

## 2. Home / Mappa

| # | Voce | Severità | Auto | Passi | Risultato atteso |
|---|------|----------|------|-------|------------------|
| 2.1 | Caricamento mappa | BLOCKER | — | Aprire tab `Mappa` | mappa visibile entro 5s, niente schermo grigio |
| 2.2 | Tile provider attivo | MAJOR | ⚙️ | `GET /api/maps/provider/status` | provider attivo coerente con admin config |
| 2.3 | Marker biker live | MAJOR | — | UI → centrare sulla propria città | marker bikers online visibili (>0 in città seedata) |
| 2.4 | Refresh 5 min | MINOR | — | Restare sulla mappa 6 minuti | refresh automatico (network trace) |
| 2.5 | Controlli mappa | MINOR | — | Zoom +/-, pan, recenter, layer | tutti i controlli reattivi |

## 3. Match

| # | Voce | Severità | Auto | Passi | Risultato atteso |
|---|------|----------|------|-------|------------------|
| 3.1 | Stack Bikers | BLOCKER | ⚙️ | `GET /api/matches/bikers` | array non vuoto in ambiente seedato |
| 3.2 | Stack Proposals | MAJOR | ⚙️ | `GET /api/matches/proposals` | risposta 200, lista coerente |
| 3.3 | Stack Music | MAJOR | — | UI → tab Music | almeno 1 card o stato empty corretto |
| 3.4 | Stack Garage | MAJOR | — | UI → tab Garage | almeno 1 card o stato empty corretto |
| 3.5 | Why Match? | MINOR | — | Tap su card → "Why match?" | popup con motivi visibile |
| 3.6 | Preferenze negative | MAJOR | — | Settings → preferenze negative → set → match | utenti filtrati di conseguenza |
| 3.7 | Nessun tipo a 0 (reg. #59) | BLOCKER | ⚙️ | `GET /api/matches/summary` | **nessuna** categoria a 0 in dataset seed |

## 4. Giri (Planned Routes)

| # | Voce | Severità | Auto | Passi | Risultato atteso |
|---|------|----------|------|-------|------------------|
| 4.1 | Lista giri | BLOCKER | ⚙️ | `GET /api/planned-routes` | 200 + lista |
| 4.2 | Creazione giro | MAJOR | ⚙️ | `POST /api/planned-routes` payload minimo | 201 + id |
| 4.3 | Dettaglio giro | MAJOR | ⚙️ | `GET /api/planned-routes/:id` | 200 + waypoints |
| 4.4 | Meteo waypoint | MINOR | — | UI → giro → meteo | icona/temp visibili |
| 4.5 | Filtri | MINOR | — | UI → filtra per distanza/difficoltà | risultati coerenti |

## 5. Navigazione turn-by-turn

| # | Voce | Severità | Auto | Passi | Risultato atteso |
|---|------|----------|------|-------|------------------|
| 5.1 | Avvio navigazione | MAJOR | — | UI → giro → "Naviga" | mappa nav, prossima istruzione visibile |
| 5.2 | Istruzioni vocali | MINOR | — | Volume on | TTS pronuncia istruzione |
| 5.3 | Fine percorso | MAJOR | — | Completare o annullare | ritorno alla schermata giro |

## 6. Chat

| # | Voce | Severità | Auto | Passi | Risultato atteso |
|---|------|----------|------|-------|------------------|
| 6.1 | Lista conversazioni | BLOCKER | ⚙️ | `GET /api/chat/conversations` | 200 + lista |
| 6.2 | Invio messaggio | BLOCKER | ⚙️ | `POST /api/chat/conversations/:id/messages` | 201 |
| 6.3 | SSE realtime | BLOCKER | ⚙️ | `GET /api/chat/stream` per 5s | evento ping/keepalive ricevuto |
| 6.4 | Chat di gruppo MotoClub | MAJOR | — | UI → club → chat → invio | messaggio compare per tutti i membri |
| 6.5 | Filtro hashtag | MINOR | — | UI → cerca `#hashtag` | risultati filtrati |
| 6.6 | Gestione amici | MAJOR | — | Add friend → accept → chat 1-1 | conversazione creata |

## 7. Proposals

| # | Voce | Severità | Auto | Passi | Risultato atteso |
|---|------|----------|------|-------|------------------|
| 7.1 | Creazione proposta | MAJOR | — | UI → New proposal | 201, visibile nella lista |
| 7.2 | Ricerca proposte | MAJOR | — | UI → filtri | risultati coerenti |
| 7.3 | Accettazione | MAJOR | — | Tap accept | stato → accepted |
| 7.4 | Completamento | MINOR | — | Tap complete | stato → completed |

## 8. Motoclub

| # | Voce | Severità | Auto | Passi | Risultato atteso |
|---|------|----------|------|-------|------------------|
| 8.1 | Discovery | BLOCKER | ⚙️ | `GET /api/motoclubs` | lista club |
| 8.2 | Richiesta join | MAJOR | ⚙️ | `POST /api/motoclubs/:id/requests` | 201 |
| 8.3 | Auto-join regionale | MAJOR | — | Utente con regione X → motoclub regionale | join automatico |
| 8.4 | Invito | MINOR | — | UI → invita amico | invito creato |
| 8.5 | Profilo club | MAJOR | — | UI → dettaglio club | membri, regole, chat |

## 9. Ready / SOS

| # | Voce | Severità | Auto | Passi | Risultato atteso |
|---|------|----------|------|-------|------------------|
| 9.1 | Precisione GPS | MAJOR | — | UI → SOS → check accuracy | accuracy < 50m in cond. normali |
| 9.2 | Privacy | BLOCKER | — | Verificare consenso esplicito | dialog mostrato prima del primo SOS |
| 9.3 | Attivazione SOS (DRY-RUN) | BLOCKER | ⚙️ | `POST /api/sos/dry-run` (no broadcast reale) | 200 + payload simulato |
| 9.4 | Stato SOS | MAJOR | ⚙️ | `GET /api/sos/status` | 200 |

> ⚠️ Lo smoke automatizzato NON deve attivare SOS reali. Usare solo dry-run.

## 10. Tracking / Ride

| # | Voce | Severità | Auto | Passi | Risultato atteso |
|---|------|----------|------|-------|------------------|
| 10.1 | Avvio sessione | MAJOR | ⚙️ | `POST /api/tracking/sessions` | 201 + sessionId |
| 10.2 | Upload punti GPS | MAJOR | ⚙️ | `POST /api/tracking/sessions/:id/points` batch | 200 |
| 10.3 | Telemetria sensori | MINOR | — | UI → ride → accelera | grafico aggiornato |
| 10.4 | Statistiche | MINOR | — | Fine sessione | distanza, durata, vel. media |
| 10.5 | Chiusura sessione | MAJOR | ⚙️ | `POST /api/tracking/sessions/:id/close` | 200 |

## 11. Garage / Music / Arcade / Contest / Profilo / Feedback

| # | Voce | Severità | Auto | Passi | Risultato atteso |
|---|------|----------|------|-------|------------------|
| 11.1 | Garage → add moto | MAJOR | — | UI | moto creata |
| 11.2 | Garage → wishlist | MINOR | — | UI | wishlist aggiornata |
| 11.3 | Music matching | MAJOR | — | UI | almeno 1 match |
| 11.4 | Music radio | MINOR | — | UI | player ok |
| 11.5 | Arcade avvio gioco | MINOR | — | UI | gioco parte |
| 11.6 | Arcade submit punteggio | MINOR | — | UI | leaderboard aggiornata |
| 11.7 | Contest lista | MINOR | — | UI | contest attivo visibile |
| 11.8 | Contest upload foto | MINOR | — | UI | upload ok |
| 11.9 | Profilo altrui | MAJOR | — | UI | dati visibili |
| 11.10 | Edit profilo | MAJOR | — | UI | salvataggio ok |
| 11.11 | Blocco/segnalazione | MAJOR | — | UI | utente bloccato/segnalato |
| 11.12 | Feedback bug/feature | MINOR | — | UI | invio ok |

## 12. OTA & Heartbeat & Invite

| # | Voce | Severità | Auto | Passi | Risultato atteso |
|---|------|----------|------|-------|------------------|
| 12.1 | OTA manifest | BLOCKER | ⚙️ | `GET /api/ota/manifest` | 200 con versione corrente |
| 12.2 | OTA no crash loop | BLOCKER | — | Pubblicare OTA dummy, aprire app 3 volte | nessun rollback automatico |
| 12.3 | OTA rollback | MAJOR | — | Trigger errore → riavvii consecutivi | rollback alla precedente |
| 12.4 | Heartbeat ping | BLOCKER | ⚙️ | `POST /api/heartbeat` | 200, `lastSeen` aggiornato |
| 12.5 | Invite code validate | MAJOR | ⚙️ | `GET /api/invitations/preview/:code` | 200 con codice di test |

## 13. Pallino flottante UNICO — touch behavior (Android device)

> Questi test devono essere eseguiti su un **dispositivo Android fisico** (non emulatore).
> I crash e i conflitti di touch routing si manifestano in modo affidabile solo su hardware reale,
> in particolare su dispositivi con `insets.bottom = 0` (es. Android senza gesture bar).
>
> **Contesto tecnico (Task #4456):** un SOLO pallino flottante sostituisce i due vecchi widget
> (FloatingWidget arancione + AssistantFab viola). Gesti gestiti SOLO con `PanResponder` di
> react-native (NIENTE react-native-gesture-handler): drag e tap erano i punti di rottura su
> Android reale. Il menu è reso al livello root `absoluteFill` con `Pressable`/`TouchableOpacity`
> semplici — essendo l'unico componente flottante non c'è più conflitto di routing dei touch.

| # | Voce | Severità | Auto | Passi | Risultato atteso |
|---|------|----------|------|-------|------------------|
| 13.1 | Pallino — apertura menu | BLOCKER | — | Tap sul pallino | menu a 5 voci (Assistente AI / Chat / Notifiche / Nuovi Match / Player) si apre senza crash |
| 13.2 | Pallino — tap Assistente AI | BLOCKER | — | Menu aperto → tap "Assistente AI" | si apre la chat AI (AssistantChatSheet); nessun crash |
| 13.3 | Pallino — tap Chat | BLOCKER | — | Menu aperto → tap "Chat" | naviga alla tab Chat; app non si chiude né si resetta |
| 13.4 | Pallino — tap Notifiche | BLOCKER | — | Menu aperto → tap "Notifiche" | naviga alla schermata Notifiche; nessun crash |
| 13.5 | Pallino — tap Nuovi Match | BLOCKER | — | Menu aperto → tap "Nuovi Match" | naviga alla tab Match; nessun crash |
| 13.6 | Pallino — tap Player | BLOCKER | — | Menu aperto → tap "Player" | naviga alla tab Music; nessun crash |
| 13.7 | Pallino — chiusura backdrop | MAJOR | — | Menu aperto → tap fuori dal menu | menu si chiude; nessuna navigazione indesiderata |
| 13.8 | Pallino — drag + persistenza | BLOCKER | — | Drag pallino in nuova posizione, riavvia app | pallino segue il dito, resta dentro lo schermo, e ricompare nella posizione salvata |
| 13.9 | Pallino — tap dopo drag | MAJOR | — | Drag oltre soglia, poi tap | il drag NON apre il menu; un tap successivo apre il menu |
| 13.10 | Pallino — badge combinato | MAJOR | — | Avere chat/notifiche/match non letti | badge sul pallino = somma; per-voce badge corretti nel menu |
| 13.11 | Pallino — gating Assistente AI | MAJOR | — | Disabilitare assistente (admin/utente) | la voce "Assistente AI" sparisce dal menu; restano 4 voci |
| 13.12 | Pallino — soppressione arcade | MAJOR | — | Avviare un gioco arcade | il pallino sparisce durante il gioco e riappare all'uscita |
| 13.13 | Pallino — nessuna regressione iOS | MAJOR | — | Dispositivo iOS (notch/Dynamic Island) | pallino visibile, draggabile e clampato sopra la tab bar; `insets` rispettati |

## 14. Web platform

| # | Voce | Severità | Auto | Passi | Risultato atteso |
|---|------|----------|------|-------|------------------|
| 14.1 | Insets web | MINOR | — | Aprire app su browser | top ≥67px, bottom 34px |
| 14.2 | Mappa web | MAJOR | — | Tab Mappa su web | mappa renderizzata |
| 14.3 | Layout web | MINOR | — | Resize finestra | nessun overflow |

---

## Come eseguire lo smoke automatico

```bash
# Da Replit shell:
BASE_URL=http://localhost:5000 \
SMOKE_EMAIL=smoke@bikerlink.test \
SMOKE_PASSWORD='Smoke1234!' \
  npx tsx scripts/smoke/run-smoke.ts
```

Oppure tramite workflow Replit: avviare il workflow `Smoke Test`.

Lo script esce con codice `!= 0` al primo fallimento **BLOCKER** automatizzato e
stampa una tabella PASS/FAIL per ogni check.
