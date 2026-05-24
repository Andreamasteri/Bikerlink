---
name: bikerlink-ota-publish
description: Pubblica un aggiornamento OTA BikerLink su EAS Update (canale staging). Usare quando l'utente dice "vai con l'ota", "pubblica ota", "ota update", "nuovo ota", o varianti.
---

# BikerLink — Pubblicazione OTA automatica

## Trigger

Questa skill si attiva quando l'utente dice:
- "vai con l'ota"
- "pubblica ota"
- "ota update"
- "nuovo ota"
- qualsiasi variante che implica pubblicare un aggiornamento OTA

## Prerequisiti

1. Leggere **`bikerlink-versioning`** prima di procedere (`.agents/skills/bikerlink-versioning/SKILL.md`).
2. `EAS_TOKEN` deve essere presente nei secret Replit — è l'**unico** secret necessario.

> ⛔ **NON inserire e NON richiedere la password admin — non è un secret e non deve diventarlo.**
> Lo script usa solo `EAS_TOKEN`. Nessuna altra credenziale è richiesta.

## Autenticazione

| Secret | Necessario | Note |
|--------|-----------|------|
| `EAS_TOKEN` | ✅ Sì | Token EAS per autenticarsi all'API e pubblicare |
| Password admin | ❌ No | Non richiesta, non usata, non da inserire |

## Passi da seguire

### 1. Raccogliere il messaggio changelog

Se l'utente non ha fornito un messaggio di changelog, chiedere:
> "Qual è il messaggio da associare a questo aggiornamento OTA?"

Il messaggio sarà visibile nel pannello EAS e agli sviluppatori.

### 2. Eseguire lo script

```bash
bash scripts/publish-ota.sh --message "Messaggio del changelog"
```

Lo script:
- Verifica `EAS_TOKEN` nell'ambiente (esce con errore se mancante)
- Interroga l'EAS GraphQL API per determinare `NEXT_OTA` (max updateNumber tra staging e production + 1)
- Calcola la versione OTA secondo la formula `<build>.<NEXT_OTA>.<ciclo>` (es. `49.1.10`)
- Pubblica con `eas update --channel staging --message "..." --non-interactive`
- Stampa in output: versione OTA, update ID EAS, canale, messaggio

### 3. Riportare il risultato all'utente

Dopo l'esecuzione riuscita, comunicare all'utente:
- **Versione pubblicata** (es. `49.1.10`)
- **Update ID EAS** (UUID)
- **Canale**: staging
- **Link approvazione**: `https://expo.dev/accounts/<owner>/projects/<slug>/updates`

Esempio di risposta:
> OTA pubblicata:
> - Versione: `49.1.10`
> - Update ID: `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`
> - Canale: staging
> - Approva/rifiuta su: https://expo.dev/accounts/...

## Contesto fisso (ciclo corrente)

| Campo | Valore |
|-------|--------|
| versionCode APK | `49` |
| runtimeVersion | `10.0.0` |
| Ciclo OTA | `10` |
| Formula versione | `49.<NEXT_OTA>.10` |
| Canale pubblicazione | `staging` |

> Questi valori vanno aggiornati ogni volta che cambia il versionCode APK o la runtimeVersion.
> Vedi checklist in `bikerlink-versioning`.

## Gestione errori

| Errore | Causa probabile | Azione |
|--------|----------------|--------|
| `EAS_TOKEN non presente` | Secret non configurato | Aggiungere `EAS_TOKEN` nei Secrets Replit |
| `EAS CLI non trovato` | eas-cli non installato | Eseguire `npm install -g eas-cli` |
| `Pubblicazione OTA fallita` | Errore EAS (auth, rete, config) | Leggere l'output completo di EAS per diagnosticare |
| `NEXT_OTA impostato a 1` | API EAS non raggiungibile o app non trovata | Verificare `EAS_TOKEN` e slug/owner in `app.json` |

## Path script

```
scripts/publish-ota.sh
```

## Fuori scope

- Promozione automatica staging → production (approvazione manuale nel pannello EAS)
- Bump di versione APK o runtimeVersion (vedi `bikerlink-versioning`)
- Notifiche push agli utenti
