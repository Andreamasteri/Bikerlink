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

## ⚠️ VINCOLO CRITICO — Credenziali

- **EAS_TOKEN** è l'**unico secret necessario** per pubblicare
- **NON inserire** e **NON richiedere** la password admin
- EAS_TOKEN è già configurato come secret Replit — non serve chiederlo all'utente

---

## ⚠️ BUG NOTO — `publish-ota.sh` con GraphQL fallback

Lo script `scripts/publish-ota.sh` interroga l'API GraphQL di EAS per determinare `NEXT_OTA`. **In ambiente Replit, l'API GraphQL EAS spesso non è raggiungibile** → lo script cade nel fallback `NEXT_OTA=1` e imposta erroneamente `APPLIED_OTA_NUMBER=1` in `constants/buildInfo.ts`.

**Non usare lo script direttamente.** Seguire il flusso manuale sotto.

---

## Flusso corretto (manuale)

### 1. Determina il numero OTA corretto

Leggi `constants/buildInfo.ts` e trova il valore attuale di `APPLIED_OTA_NUMBER`. Il prossimo OTA è `APPLIED_OTA_NUMBER + 1`.

```bash
grep APPLIED_OTA_NUMBER constants/buildInfo.ts
```

### 2. Aggiorna `APPLIED_OTA_NUMBER` nel file

```ts
// constants/buildInfo.ts
export const APPLIED_OTA_NUMBER: number | null = <NEXT_OTA>;
```

### 3. Esegui `eas update` direttamente (solo Android)

**Nota critica sul timeout**: `eas update` con bundle Android cold-cache impiega **~90–120 secondi**. Il tool bash ha un timeout massimo di 120000ms. Usare **`--platform android`** (non `--platform all`) per dimezzare i tempi.

```bash
cd /home/runner/workspace && EAS_SKIP_AUTO_FINGERPRINT=1 EXPO_TOKEN="${EAS_TOKEN}" EAS_TOKEN="${EAS_TOKEN}" eas update \
  --channel staging \
  --message "OTA<N>: <descrizione>" \
  --environment production \
  --non-interactive \
  --platform android 2>&1; echo "EXIT=$?"
```

Impostare il timeout del tool a **120000ms**.

Se il comando supera comunque il timeout:
1. Scrivere un file script temporaneo con i token già espansi (le singole virgolette impediscono l'espansione):
```bash
cat > /tmp/run-ota.sh << ENDSCRIPT
#!/usr/bin/env bash
cd /home/runner/workspace
export EAS_TOKEN="${EAS_TOKEN}"
export EXPO_TOKEN="${EAS_TOKEN}"
export EAS_SKIP_AUTO_FINGERPRINT=1
eas update \
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
2. Poi fare polling del log con `cat /tmp/ota-out.log` ogni 30–60 secondi.

**Fallacy da evitare con background + redirection:**
- `setsid bash -c '... $EAS_TOKEN ...'` con singole virgolette → `$EAS_TOKEN` NON viene espanso → processo termina silenziosamente
- `> /tmp/file.log 2>&1 &` non funziona se `nohup` non viene usato o il processo non eredita l'fd
- Soluzione sicura: **scrivere sempre lo script in un file temporaneo**, poi eseguirlo

### 4. Verifica output

Un publish riuscito mostra:
```
✔ Published!
Branch             staging
Runtime version    10.0.0
Platform           android
Update group ID    <uuid>
Android update ID  <uuid>
EXIT=0
```

### 5. Riporta il risultato all'utente

> OTA<N> pubblicata ✓
>
> - Update group ID: `<uuid>`
> - Runtime: `10.0.0`
> - Canale: staging
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

## Storico OTA (per riferimento futuro)

| OTA | APPLIED_OTA_NUMBER | Contenuto | Update group ID |
|-----|-------------------|-----------|-----------------|
| OTA1 | 1 | Prima release OTA | — |
| OTA2 | 2 | Fix mappa nera Android APK (Leaflet WebView black map) | — |
| OTA3 | 3 | Admin: pulsante "Forza Aggiornamento OTA" in OtaPanel | `efa135f0-1801-48fd-9b7c-871c6f415799` |

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
| `app.json` | `runtimeVersion`, `versionCode`, `version` |
| `components/admin/ota/OtaPanel.tsx` | Pannello admin OTA con pulsante Forza Aggiornamento |

---

## Checks pre-publish

Prima di pubblicare:
1. `npx tsc --noEmit` → 0 errori TypeScript
2. Workflow `typecheck` → VERDE
3. Workflow `hooks-check` → PASS
4. `APPLIED_OTA_NUMBER` aggiornato al numero corretto in `constants/buildInfo.ts`
