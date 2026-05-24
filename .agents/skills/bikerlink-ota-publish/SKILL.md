---
name: bikerlink-ota-publish
description: Pubblica un OTA BikerLink su staging tramite script shell. Trigger: "vai con l'ota", "pubblica ota", "ota update", "nuovo ota", "lancia ota". NON richiedere password admin — EAS_TOKEN è l'unico secret necessario.
---

# BikerLink — OTA Publish Skill

## Trigger

Attivare questa skill quando l'utente dice una delle seguenti (o varianti):
- "vai con l'ota"
- "pubblica ota"
- "lancia ota"
- "ota update"
- "nuovo ota"
- "fai l'ota"
- "pubblica l'aggiornamento OTA"

## Prerequisiti

**Leggere prima** `.agents/skills/bikerlink-versioning/SKILL.md` per capire il formato versione OTA.

## ⚠️ VINCOLO CRITICO — Credenziali

- **EAS_TOKEN** è l'**unico secret necessario** per pubblicare
- **NON inserire** e **NON richiedere** la password admin
- La password admin non è un secret e non deve diventarlo
- EAS_TOKEN è già configurato come secret Replit — non serve chiederlo all'utente

## Passi da seguire

### 1. Raccogli il messaggio changelog

- Se l'utente ha fornito un messaggio changelog nella sua richiesta, usalo direttamente
- Se il messaggio NON è fornito, chiedi: *"Qual è il messaggio changelog per questo OTA? (es: 'Fix crash login', 'Nuova sezione eventi')"*
- Non procedere senza un messaggio

### 2. Esegui lo script

```bash
./scripts/publish-ota.sh --message "MESSAGGIO_CHANGELOG_QUI"
```

**Importante:**
- Lo script usa `EAS_TOKEN` dall'ambiente automaticamente
- Pubblica sempre sul canale `staging` (mai direttamente su `production`)
- L'output include la versione OTA calcolata e l'Update ID EAS

### 3. Riporta il risultato all'utente

Dopo l'esecuzione riportare:
- **Versione OTA** pubblicata (es. `49.1.10`)
- **Update ID** EAS (GUID)
- **Canale**: staging
- **Link al pannello**: apri `/admin/settings` nel web portal oppure la sezione OTA nell'app admin

Esempio di risposta:

> OTA pubblicata ✓
>
> - Versione: `49.1.10`
> - Update ID: `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`
> - Canale: staging
>
> Ora apri il pannello OTA admin (nell'app o su /admin/settings) per testare e approvare la distribuzione a production.

### 4. Non richiedere altro

Non chiedere all'utente:
- Password admin ❌
- Credenziali EAS ❌
- Conferma del token ❌

## Script path

`scripts/publish-ota.sh`

## Cosa fa lo script

1. Valida presenza di `--message` e `EAS_TOKEN`
2. Legge `versionCode` e `runtimeVersion` da `app.json`
3. Interroga EAS GraphQL API per il numero OTA più alto tra staging e production
4. Calcola `NEXT_OTA = max + 1` e `VERSION = "<build>.<NEXT_OTA>.<ciclo>"`
5. Esegue `eas update --channel staging --message "..." --non-interactive`
6. Stampa versione OTA, Update ID, canale, messaggio

## Formula versione OTA

```
<build>.<NEXT_OTA>.<ciclo>
```

Vedi `.agents/skills/bikerlink-versioning/SKILL.md` per dettagli completi.

## Flusso approvazione (post-publish)

Dopo la pubblicazione su staging, l'admin deve:
1. Testare l'OTA nell'app (tasto "Prova OTA" nel pannello admin)
2. Approvare (→ promuove su `production`) o Rifiutare

La promozione avviene tramite il pannello admin nell'app o nel web portal — non tramite CLI.
