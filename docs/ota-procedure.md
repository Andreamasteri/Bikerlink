# BikerLink — Procedura OTA (Over-The-Air Update)

## Come pubblicare un OTA — 3 passi

### 1. Scrivi il messaggio
Apri il file `.ota-message` nella root del progetto e scrivi una riga con la descrizione del rilascio:
```
Fix crash login + nuova schermata impostazioni + miglioramento mappa
```

### 2. Riavvia il workflow "OTA Publish"
Dal pannello Replit, clicca sul workflow **OTA Publish** e premi **Restart**.

### 3. Monitora i log
Attendi 5-8 minuti (Metro deve ricompilare il bundle JavaScript).
Il workflow mostra il progresso in tempo reale. Quando vedi:
```
[OTA ✓] OTA pubblicata con successo!
```
L'aggiornamento è live per tutti gli utenti Android.

---

## Cosa fa lo script in automatico
1. Legge il messaggio da `.ota-message`
2. Calcola il prossimo numero OTA dal DB
3. Aggiorna `APPLIED_OTA_NUMBER` in `constants/buildInfo.ts`
4. Pubblica il bundle su EAS (canale staging)
5. Approva la release nel DB → gli utenti ricevono l'aggiornamento
6. Svuota `.ota-message` (pronto per il prossimo OTA)
7. Fa il push su GitHub

## Versioning OTA
Formula: `<build>.<progressive_ota>.<ciclo_runtime>`
- Esempio: `53.2.10` = build 53, secondo OTA, ciclo runtime 10
- `APPLIED_OTA_NUMBER` corrisponde al numero progressivo OTA

## Note
- Gli OTA funzionano **solo su Android** (iOS usa TestFlight/App Store)
- La `runtimeVersion` (`10.0.0`) deve essere identica tra build e OTA
- Se il workflow fallisce: correggi il problema, riscrivi `.ota-message`, riavvia
- **Non serve approvare manualmente** — lo script approva direttamente nel DB

## File coinvolti
| File | Ruolo |
|------|-------|
| `.ota-message` | Input: descrizione del rilascio |
| `scripts/publish-ota-full.sh` | Script principale |
| `constants/buildInfo.ts` | Aggiornato automaticamente (APPLIED_OTA_NUMBER) |
| `server/routes/expo-updates.ts` | Serve il manifest agli utenti |
| `server/routes/admin/ota.ts` | Pannello admin OTA |
