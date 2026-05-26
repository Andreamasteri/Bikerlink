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
4. Esegue `eas update --channel production --message "..."` (bundle Metro)
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
