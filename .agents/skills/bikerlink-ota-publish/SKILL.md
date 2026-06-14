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
| `versionCode` APK | **67** |
| `versionName` | **67.10.103** |
| `runtimeVersion` | **10.0.0** |
| Ultima OTA nel ciclo v67 | **OTA-11** → la prossima sarà **OTA-12** |

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

**Non usare lo script direttamente.** Seguire il flusso manuale sotto.

---

## Flusso corretto (manuale)

### 1. Determina il numero OTA corretto

> ⚠️ **ATTENZIONE — Due contatori distinti, significati diversi:**
>
> | Contatore | Dove | Significato | Usa per |
> |-----------|------|-------------|---------|
> | `APPLIED_OTA_NUMBER` in `constants/buildInfo.ts` | Contatore **globale sequenziale** — conta tutte le OTA di tutti i cicli APK mai pubblicati (es. 85) | Solo aggiornamento di `constants/buildInfo.ts` |
> | OTA nel ciclo APK corrente | Il numero centrale di `versionName` (es. `55.`**10**`.10`) — ricomincia da 1 ad ogni nuovo APK | Messaggio `--message`, `versionName`, e comunicazione all'utente |
>
> **NON usare `APPLIED_OTA_NUMBER` come numero OTA da pubblicare.** Se `APPLIED_OTA_NUMBER = 85` e siamo al ciclo v55 con OTA-10 come ultima, la prossima è **OTA-11** (non OTA-86).

**Come trovare il numero OTA corretto nel ciclo:**

Guarda la tabella "Contesto fisso" in questa skill (sezione sopra) → campo "Ultima OTA nel ciclo". In alternativa, leggi il `versionName` corrente da `app.json`:

```bash
node -e "const a=require('./app.json'); const v=a.expo.version.split('.'); console.log('Ultima OTA nel ciclo:', v[1], '→ prossima: OTA-' + (parseInt(v[1])+1))"
```

**Poi aggiorna `APPLIED_OTA_NUMBER`** (contatore globale, sempre +1 rispetto al precedente):

```bash
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

**Nota critica sul timeout**: `bash scripts/eas.sh update` con bundle Android cold-cache impiega **~90–120 secondi**. Il tool bash ha un timeout massimo di 120000ms. Usare **`--platform android`** (non `--platform all`) per dimezzare i tempi.

```bash
cd /home/runner/workspace && EAS_SKIP_AUTO_FINGERPRINT=1 EXPO_TOKEN="${EAS_TOKEN}" EAS_TOKEN="${EAS_TOKEN}" bash scripts/eas.sh update \
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
Runtime version    <runtimeVersion>   ← corrisponde a expo.runtimeVersion in app.json (es. 10.0.0)
Platform           android
Update group ID    <uuid>
Android update ID  <uuid>
EXIT=0
```

### 5. Push GitHub (automatico)

> ⚠️ Il push è best-effort: un eventuale fallimento **non blocca** il report OTA all'utente.

**Prerequisito**: verifica che `GITHUB_TOKEN` sia disponibile nell'ambiente:

```bash
if [[ -z "${GITHUB_TOKEN}" ]]; then
  echo "[GH] GITHUB_TOKEN non disponibile — push saltato"
fi
```

Se `GITHUB_TOKEN` è assente, loggare il warning e proseguire al **Step 6**.

**Fase 1 — Push normale:**

```bash
git push "https://x-access-token:${GITHUB_TOKEN}@github.com/Andreamasteri/Bikerlink.git" HEAD:main 2>&1
```

> ⚠️ **Mai stampare `$GITHUB_TOKEN` nei log.** Usarlo esclusivamente espanso dentro la URL, come sopra.

**Fase 2 — Force push** (solo se Fase 1 fallisce con errore "non-fast-forward"):

```bash
git push --force "https://x-access-token:${GITHUB_TOKEN}@github.com/Andreamasteri/Bikerlink.git" HEAD:main 2>&1
```

Se anche il force push fallisce: comunicare il messaggio di errore all'utente nel riepilogo (Step 6), senza bloccare il report OTA.

**Verifica esito** (dopo un push riuscito):

```bash
REMOTE_SHA=$(git ls-remote "https://x-access-token:${GITHUB_TOKEN}@github.com/Andreamasteri/Bikerlink.git" refs/heads/main | awk '{print $1}')
LOCAL_SHA=$(git rev-parse HEAD)
if [[ "$REMOTE_SHA" == "$LOCAL_SHA" ]]; then
  echo "[GH ✓] GitHub sincronizzato — SHA: ${LOCAL_SHA:0:8}"
else
  echo "[GH !] SHA remoto (${REMOTE_SHA:0:8}) ≠ HEAD locale (${LOCAL_SHA:0:8}) — push potrebbe non essere completo"
fi
```

> **Nota auth**: il formato corretto è `https://x-access-token:${GITHUB_TOKEN}@github.com/...`.
> Il formato senza username (`https://${GITHUB_TOKEN}@...`) ritorna 401.
> `git ls-remote` non espone il token nei log — usarlo sempre per la verifica.

### 6. Riporta il risultato all'utente

> OTA<N> pubblicata ✓
>
> - Update group ID: `<uuid>`
> - Runtime: `<runtimeVersion da app.json>` (es. `10.0.0`)
> - Canale: staging
> - GitHub: sincronizzato ✓  *(oppure: "GitHub: push saltato (GITHUB_TOKEN non disponibile)" / "GitHub: push fallito — `<messaggio errore>`")*
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
