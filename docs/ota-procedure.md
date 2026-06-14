# BikerLink — Procedura OTA (Over-The-Air Update)

## Architettura (semplice)

```
[Replit script]  →  [EAS production]  →  [APK utenti]
                       u.expo.dev
```

L'APK è configurato in `app.json` per controllare gli aggiornamenti direttamente su EAS (`u.expo.dev`, canale `production`). Il server BikerLink **non** serve manifest OTA — fa solo tracking nel pannello admin.

---

## Come pubblicare un OTA — 3 passi

### 1. Scrivi il messaggio
Apri `.ota-message` nella root e scrivi una riga:
```
Fix crash login + nuova schermata impostazioni
```

### 2. Riavvia il workflow "OTA Publish"
Dal pannello Replit, clicca il workflow **OTA Publish** → **Restart**.

### 3. Attendi 5-8 minuti
Metro deve ricompilare il bundle. Quando vedi:
```
[OTA ✓] OTA pubblicata con successo!
```
L'aggiornamento è live. Gli utenti Android lo ricevono al prossimo avvio dell'app.

---

## Cosa fa lo script in automatico
1. Legge il messaggio da `.ota-message`
2. Calcola il prossimo `APPLIED_OTA_NUMBER` dal DB
3. Aggiorna `constants/buildInfo.ts`
4. Esegue `bash scripts/eas.sh update --channel production --message "..."` (bundle Metro)
5. Salva la release nel DB (`status='approved'`, `channel='production'`) per tracking admin
6. Svuota `.ota-message`
7. Fa il push su GitHub

## Versioning OTA
Formula: `<build>.<progressive_ota>.<ciclo_runtime>` — es. `53.2.10`

## Note
- **MAI staging** — solo `production`. L'APK guarda solo il canale production.
- OTA funziona solo su **Android** (iOS via TestFlight/App Store).
- `runtimeVersion` (`10.0.0`) deve essere identica tra APK e OTA.
- Il pannello admin (`/admin/ota`) mostra la cronologia ma **non controlla la distribuzione** — è solo tracking.

## File coinvolti
| File | Ruolo |
|------|-------|
| `.ota-message` | Input: descrizione del rilascio |
| `scripts/publish-ota-full.sh` | Script principale |
| `app.json` | Config EAS: `updates.url` + `channel=production` |
| `constants/buildInfo.ts` | `APPLIED_OTA_NUMBER` (aggiornato dallo script) |
| `server/routes/admin/ota.ts` | Pannello admin (sola lettura/tracking) |
| `server/routes/admin/ota-assistant.ts` | AI Orchestrator (Task #2535) |
| `components/admin/ota/OtaAssistantChat.tsx` | Chat assistente nel pannello admin |

---

## AI Orchestrator OTA (Task #2535)

Nel pannello admin OTA c'è una chat **Assistente OTA** che accetta richieste in italiano e copre l'intero ciclo OTA:

- **Publish**: "pubblica un OTA con messaggio: fix mappa" → l'assistente propone l'azione, dopo conferma esegue `publish-ota-full.sh` in background con log streaming nella chat. Retry singolo automatico su errori EAS transitori (timeout/rate-limit/5xx GraphQL).
- **Diagnosi**: "perché l'OTA 127 non è arrivata all'utente X?" → incrocia release attiva, runtime, status, e ultimo evento boot dell'utente.
- **Watchdog post-publish**: "ci sono release da rollbackare?" → propone (senza eseguire) le release approved con boot success sotto la soglia AI ma sopra quella deterministica. L'`ota-auto-rollback.ts` resta safety net.
- **Release planner**: "quando conviene pubblicare la prossima?" → raccomandazione publish/wait/block basata su età ultima release, success rate, finestra oraria 08–22.
- **Storico**: "elenca le release pending" / "ultimi 5 OTA con success rate <80%" → query tabellari.

### Sicurezza

Le azioni mutanti (publish, approve, reject, sync) NON sono date al modello: il modello dispone solo di `proposeMutation` che produce una card di conferma. L'esecuzione avviene SOLO dopo click esplicito dell'admin su "Conferma ed esegui". Ogni interazione viene loggata in `ota_assistant_runs` per audit.

### Configurazione

| Variabile | Default | Descrizione |
|-----------|---------|-------------|
| `OPENAI_API_KEY` | — | **Obbligatoria**. Senza, l'endpoint risponde 500. |
| `OTA_ASSISTANT_MODEL` | `gpt-4o-mini` | Modello OpenAI usato dall'assistente. |
| `OTA_ASSISTANT_TEMPERATURE` | `0.2` | Temperatura LLM (bassa per output deterministico). |
| `OTA_ASSISTANT_ROLLBACK_THRESHOLD` | `85` | Soglia % boot success sotto la quale l'AI propone rollback. Più conservativa della soglia deterministica per-release (default 70). |
| `OTA_ASSISTANT_ROLLBACK_MIN_DOWNLOADS` | `5` | Download minimi prima che l'AI consideri una release per la proposta di rollback. |

### Endpoint

- `POST /api/admin/ota/assistant` — invia prompt, riceve risposta + eventuali `pendingMutations` da confermare.
- `POST /api/admin/ota/assistant/confirm` — esegue una mutazione approvata dall'admin (`tool`, `args`).
- `GET  /api/admin/ota/assistant/history?limit=50&adminId=…` — storico interazioni paginato.
- `GET  /api/admin/ota/assistant/run/:runId/log` — tail log di una publish run (polling client ogni 3s).
