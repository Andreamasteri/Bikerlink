---
name: bikerlink-ota-publish
description: Pubblica un OTA BikerLink su staging tramite EAS. Trigger: "vai con l'ota", "pubblica ota", "ota update", "nuovo ota", "lancia ota". NON richiedere password admin — EAS_TOKEN è l'unico secret necessario.
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

---

## Contesto fisso (aggiornare dopo ogni APK bump)

| Campo | Valore corrente |
|-------|----------------|
| `versionCode` APK | **70** |
| `versionName` | **70.10.112** |
| `runtimeVersion` | **10.0.0** |
| Ultima OTA nel ciclo v70 | **OTA-113** → la prossima sarà **OTA-114** |

> ⚠️ Aggiornare questa tabella ad ogni nuovo APK (e dopo ogni OTA pubblicata), in lockstep con la tabella storica in `bikerlink-versioning/SKILL.md`.
> I valori correnti sono sempre la fonte di verità: `node -e "const a=require('./app.json'); console.log(a.expo.android.versionCode, a.expo.runtimeVersion, a.expo.version)"`

---

## ⚠️ VINCOLO CRITICO — Credenziali

- **EAS_TOKEN** è l'**unico secret necessario** per pubblicare
- **NON inserire** e **NON richiedere** la password admin
- EAS_TOKEN è già configurato come secret Replit — non serve chiederlo all'utente

---

## ⚠️ BUG NOTO — `publish-ota.sh` con GraphQL fallback

Lo script `scripts/publish-ota.sh` interroga l'API GraphQL di EAS per determinare `NEXT_OTA`. **In ambiente Replit, l'API GraphQL EAS spesso non è raggiungibile** → lo script cade nel fallback `NEXT_OTA=1` e imposta erroneamente `APPLIED_OTA_NUMBER=1` in `constants/buildInfo.ts`.

**Non usare `publish-ota.sh` direttamente.** Usare invece `publish-ota-full.sh` (flusso primario sotto), che calcola `NEXT_OTA` dal DB invece di GraphQL — aggirando il bug senza workaround manuale.

---

## Flusso primario — `publish-ota-full.sh`

> **Prerequisito**: `DATABASE_URL` deve essere disponibile nell'ambiente (sempre vero in Replit).
> Se `DATABASE_URL` non è disponibile, usare il [Flusso manuale (fallback)](#flusso-manuale-fallback) più sotto.

Lo script `publish-ota-full.sh` esegue in modo atomico:
- Calcola `NEXT_OTA` dal DB (non da GraphQL → nessun bug di fallback)
- Aggiorna `constants/buildInfo.ts` con `APPLIED_OTA_NUMBER` prima del bundle
- Esegue `expo export` + `eas update` (Android only)
- Inserisce la release nel DB come `pending`
- Svuota `.ota-message`
- Push su GitHub (best-effort, integrato)

### 1. Scrivi il messaggio OTA in `.ota-message`

```bash
echo "OTA<N>: <descrizione breve del contenuto>" > .ota-message
```

Sostituire `<N>` con il numero OTA nel ciclo corrente (vedi tabella "Contesto fisso" sopra).

### 2. Lancia `publish-ota-full.sh`

```bash
bash scripts/publish-ota-full.sh 2>&1; echo "EXIT=$?"
```

Impostare il timeout del tool a **120000ms** (export ~40-90s + upload ~15-50s = totale ~90-120s tipico).

> **Cache Metro**: lo script rileva automaticamente la corruzione della cache (pattern ENOENT,
> "Cannot resolve module", ecc.) e fa pulizia + retry senza intervento manuale. Non serve
> alcun flag. Se il retry riesce, la pubblicazione continua normalmente.

Se il comando supera il timeout, lanciarlo in background con polling:

```bash
cat > /tmp/run-ota-full.sh << ENDSCRIPT
#!/usr/bin/env bash
cd /home/runner/workspace
bash scripts/publish-ota-full.sh > /tmp/ota-full.log 2>&1
echo "EXIT=\$?" >> /tmp/ota-full.log
ENDSCRIPT
chmod +x /tmp/run-ota-full.sh
/tmp/run-ota-full.sh &
```

Poi fare polling con `cat /tmp/ota-full.log` ogni 30–60 secondi.

### 3. Verifica output

Un publish riuscito termina con:
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[OTA ✓] OTA pubblicata come PENDING!
  Versione OTA  : <BUILD>.<RUNTIME>.<N>
  Update ID     : <uuid>
  Messaggio     : <testo>
  Stato DB      : pending → NON auto-applicata; admin usa 'Prova OTA' per testarla manualmente
  Prossimo step : admin testa la OTA, poi click 'Approva' su /admin/ota per distribuirla a tutti
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
EXIT=0
```

Il timing di ogni fase (export / upload / db / git) è loggato in `logs/ota-timing.log`.

### 4. Aggiorna "Contesto fisso" in questa skill

Dopo la pubblicazione: aggiorna la tabella "Contesto fisso" (campo "Ultima OTA nel ciclo") con il numero appena pubblicato.

> `constants/buildInfo.ts` e il push GitHub sono già gestiti dallo script — non servono step manuali aggiuntivi.

### 5. Riporta il risultato all'utente

> OTA<N> pubblicata ✓
>
> - Update group ID: `<uuid>`
> - Runtime: `<runtimeVersion da app.json>` (es. `10.0.0`)
> - Canale: production
> - GitHub: sincronizzato ✓  *(oppure: "GitHub: push saltato (GITHUB_TOKEN non disponibile)")*
>
> Prossimo passo: apri il pannello OTA admin nell'app → "Prova OTA" su OTA<N> per testare, poi "Approva e Distribuisci" per promuovere a tutti gli utenti.

---

## Canale `diagnostic` (OTA per le diagnostic-apk)

Le build `diagnostic-apk` (vedi skill `bikerlink-apk-build`) sono pubblicate sul canale
EAS **`diagnostic`**, isolato da `staging`/`production`. Gli OTA diagnostici NON devono
raggiungere gli utenti di produzione: usa sempre il canale dedicato.

> Perché serve: il segnale `EXPO_PUBLIC_BUILD_PROFILE` viene baked al build EAS ma cancellato
> da ogni bundle OTA. Per far sopravvivere il riconoscimento "diagnostic" agli OTA, la
> diagnostica `detectBuildCapabilities()` legge `Updates.channel`: una build pubblicata sul
> canale `diagnostic` resta riconosciuta come diagnostic APK anche dopo aggiornamenti OTA.

Per pubblicare un OTA sul canale diagnostico usa il flag `--diagnostic` di `publish-ota.sh`
(imposta sia `--channel diagnostic` sia `EXPO_PUBLIC_BUILD_PROFILE=diagnostic` nell'`expo export`):

```bash
EXPO_TOKEN="${EAS_TOKEN}" bash scripts/publish-ota.sh \
  --message "OTA<N> diagnostic: <descrizione>" \
  --diagnostic 2>&1; echo "EXIT=$?"
```

Il riepilogo finale dello script mostra `Canale: diagnostic`. Senza `--diagnostic` lo script
pubblica sul canale `staging` (flusso produzione/staging standard) come prima.

---

## Flusso manuale (fallback)

> Usare **solo** quando `DATABASE_URL` non è disponibile nell'ambiente e `publish-ota-full.sh` non può girare.

### 1. Determina il numero OTA corretto

> ⚠️ **ATTENZIONE — Due contatori distinti, significati diversi:**
>
> | Contatore | Dove | Significato | Usa per |
> |-----------|------|-------------|---------|
> | `APPLIED_OTA_NUMBER` in `constants/buildInfo.ts` | Contatore **globale sequenziale** — conta tutte le OTA di tutti i cicli APK mai pubblicati (es. 85) | Solo aggiornamento di `constants/buildInfo.ts` |
> | OTA nel ciclo APK corrente | Il numero centrale di `versionName` (es. `55.`**10**`.10`) — ricomincia da 1 ad ogni nuovo APK | Messaggio `--message`, `versionName`, e comunicazione all'utente |
>
> **NON usare `APPLIED_OTA_NUMBER` come numero OTA da pubblicare.** Se `APPLIED_OTA_NUMBER = 85` e siamo al ciclo v55 con OTA-10 come ultima, la prossima è **OTA-11** (non OTA-86).

```bash
node -e "const a=require('./app.json'); const v=a.expo.version.split('.'); console.log('Ultima OTA nel ciclo:', v[1], '→ prossima: OTA-' + (parseInt(v[1])+1))"
grep APPLIED_OTA_NUMBER constants/buildInfo.ts
```

### 2. Aggiorna i due contatori

**a) Contatore globale** (`constants/buildInfo.ts`) — incrementa sempre di 1:

```ts
// constants/buildInfo.ts
export const APPLIED_OTA_NUMBER: number | null = <APPLIED_OTA_NUMBER_PRECEDENTE + 1>;
```

**b) Aggiorna "Contesto fisso"** in questa skill — cambia "Ultima OTA nel ciclo" con il numero appena pubblicato.

### 3. Esegui `bash scripts/eas.sh update` direttamente (solo Android)

**Nota critica sul timeout**: impiega **~90–120 secondi**. Impostare il timeout del tool a **120000ms**.

```bash
cd /home/runner/workspace && EAS_SKIP_AUTO_FINGERPRINT=1 EXPO_TOKEN="${EAS_TOKEN}" EAS_TOKEN="${EAS_TOKEN}" bash scripts/eas.sh update \
  --channel staging \
  --message "OTA<N>: <descrizione>" \
  --environment production \
  --non-interactive \
  --platform android 2>&1; echo "EXIT=$?"
```

Se supera il timeout, usare il file script temporaneo:

```bash
cat > /tmp/run-ota.sh << ENDSCRIPT
#!/usr/bin/env bash
cd /home/runner/workspace
export EAS_TOKEN="${EAS_TOKEN}"
export EXPO_TOKEN="${EAS_TOKEN}"
export EAS_SKIP_AUTO_FINGERPRINT=1
bash scripts/eas.sh update \
  --channel staging \
  --message "OTA<N>: <descrizione>" \
  --environment production \
  --non-interactive \
  --platform android > /tmp/ota-out.log 2>&1
echo "EXIT=\$?" >> /tmp/ota-out.log
ENDSCRIPT
chmod +x /tmp/run-ota.sh
/tmp/run-ota.sh &
```

Poi fare polling con `cat /tmp/ota-out.log` ogni 30–60 secondi.

**Fallacy da evitare**: `setsid bash -c '... $EAS_TOKEN ...'` con singole virgolette → `$EAS_TOKEN` NON viene espanso. Scrivere sempre in un file temporaneo.

### 4. Verifica output

```
✔ Published!
Branch             staging
Runtime version    <runtimeVersion>
Platform           android
Update group ID    <uuid>
Android update ID  <uuid>
EXIT=0
```

### 5. Push GitHub (manuale)

> Best-effort: un fallimento non blocca il report OTA.

```bash
git push "https://x-access-token:${GITHUB_TOKEN}@github.com/Andreamasteri/Bikerlink.git" HEAD:main 2>&1
```

Se fallisce con "non-fast-forward": aggiungere `--force`. Mai stampare `$GITHUB_TOKEN` nei log.

### 6. Riporta il risultato all'utente

> OTA<N> pubblicata ✓
>
> - Update group ID: `<uuid>`
> - Runtime: `<runtimeVersion da app.json>` (es. `10.0.0`)
> - Canale: staging
> - GitHub: sincronizzato ✓  *(oppure: "GitHub: push saltato / fallito")*
>
> Prossimo passo: apri il pannello OTA admin nell'app → Direct Apply su OTA<N> per testare, poi Approva per promuovere a production.

---

## Flusso approvazione (post-publish)

Dopo la pubblicazione su staging, l'admin deve:
1. Aprire il pannello OTA nell'app (sezione admin)
2. Cliccare **"Prova OTA"** / Direct Apply → testa sul dispositivo admin
3. Cliccare **"Approva e Distribuisci"** → promuove a `production`

La promozione avviene tramite il pannello admin nell'app — non tramite CLI.

---

## Cicli precedenti (storico OTA)

> Aggiornare questa sezione dopo ogni APK bump: aggiungere la riga corrispondente all'APK appena pubblicato.
> Il campo `APPLIED_OTA_NUMBER` in `constants/buildInfo.ts` è il contatore globale — non il numero dell'OTA nel ciclo APK corrente.

### Ciclo 10 — runtimeVersion 10.0.0

| APK base | OTA nel ciclo | Contenuto notevole | Update group ID |
|----------|--------------|---------------------|-----------------|
| v50 | OTA-1 | Prima OTA ciclo 10 | — |
| v50 | OTA-2 | Fix mappa nera Android APK (Leaflet WebView black map) | — |
| v50 | OTA-3 | Admin: pulsante "Forza Aggiornamento OTA" in OtaPanel | `efa135f0-1801-48fd-9b7c-871c6f415799` |
| v53 | OTA-1 | Fix sistema mappe (tile ID, normalizeTileId), admin DB Debug/Dimensioni | — |
| v53–v54 | OTA-2…10 | Task vari; v54 inglobava OTA-10 | — |
| v55 | OTA-10 inglobata | Build ciclo v55 | — |
| v56–v66 | — | Build intermedie ciclo 10 (nessuna OTA standalone documentata) | — |
| v67 | OTA-10 inglobata | **Build corrente** — debug-apk; prossima OTA sarà OTA-11 | — |

---

## Fix mappa nera Android APK (documentato per OTA2)

**Causa**: su Android WebView in produzione APK, `source={{ uri: backendUrl }}` nella WebView non recapitava in modo affidabile il postMessage `mapReady` → `injectJavaScript` non veniva mai chiamato → mappa nera.

**Fix**: passare da `source={{ uri }}` a `source={{ html: buildXxx(...), baseUrl: getApiUrl() }}` in tutti i componenti Leaflet.

**Componenti corretti** (5 file):
- `components/InteractiveMap.tsx`
- `components/LeafletMiniMap.tsx`
- `components/LeafletPickerMap.tsx`
- `components/LeafletTrackingMap.tsx`
- `components/LeafletRouteMap.tsx`

Pattern corretto:
```tsx
// PRIMA (causa mappa nera su APK Android produzione)
<WebView source={{ uri: `${backendUrl}/map-page` }} ... />

// DOPO (funziona su tutti gli ambienti)
<WebView
  source={{ html: buildMapHtml(...), baseUrl: getApiUrl() }}
  originWhitelist={['*']}
  ...
/>
```

`baseUrl: getApiUrl()` è necessario per i fetch relativi all'interno dell'HTML inline.

---

## Pulsante "Forza Aggiornamento OTA" in OtaPanel

**File**: `components/admin/ota/OtaPanel.tsx`

Il pulsante esegue in sequenza:
```ts
const result = await Updates.checkForUpdateAsync();
if (result.isAvailable) {
  await Updates.fetchUpdateAsync();
  await Updates.reloadAsync();
}
```

Stato: `forcingUpdate` (boolean) per il loading indicator. Gestione errori con try/catch e alert.

**Nota Android lifecycle**: su Android, "swipa dall'app" NON killa il processo — serve **Force Stop** da Impostazioni → App → BikerLink → Forza chiusura per un cold restart completo. Il pulsante "Forza Aggiornamento" bypassa questo problema.

---

## File chiave

| File | Ruolo |
|------|-------|
| `constants/buildInfo.ts` | `APPLIED_OTA_NUMBER` — da aggiornare manualmente a ogni OTA |
| `scripts/publish-ota.sh` | Script publish (con bug GraphQL fallback — vedi sopra) |
| `scripts/publish-ota-full.sh` | Script publish atomico con push GitHub integrato (riferimento per logica di push consolidata) |
| `app.json` | `runtimeVersion`, `versionCode`, `version` |
| `components/admin/ota/OtaPanel.tsx` | Pannello admin OTA con pulsante Forza Aggiornamento |

---

## Checks pre-publish

Prima di pubblicare:
1. `npx tsc --noEmit` → 0 errori TypeScript
2. Workflow `typecheck` → VERDE
3. Workflow `hooks-check` → PASS
4. `APPLIED_OTA_NUMBER` aggiornato al numero corretto in `constants/buildInfo.ts`
