# Runbook — Bootstrap OTA Canale Emergenza (EMCY)

> **NOTA**: questi passi vanno eseguiti DALL'AMBIENTE MAIN (non da un task-agent isolato).
> Richiedono `EAS_TOKEN` e `DATABASE_URL` nell'ambiente.

---

## Stato precondizioni

| Elemento | Stato |
|---|---|
| Script `scripts/publish-ota-emcy.sh` | ✅ presente e completo (guard G1–G4) |
| Pannello admin `OtaPanelExtra.tsx` | ✅ presente con toggle + approva/revoca |
| API backend `/api/admin/ota/emergency/*` | ✅ endpoint toggle + status |
| Manifest redirect `ota_emergency_active` | ✅ implementato in `server/routes/ota-public.ts` |
| Commit base `408f82d1` | ✅ nel repo (runtimeVersion `10.0.0`) |

---

## Obiettivo del bootstrap

Pubblicare EMCY-1 sul canale `emergency` come release di standby **approvata e pronta**.
In condizioni normali rimane inattiva (il toggle è OFF). Quando la production si rompe,
basta premere **🚨 Attiva redirect EMCY** per riportare tutti i device alla base sana.

---

## Step 1 — Dry-run (verifica senza pubblicare)

```bash
bash scripts/publish-ota-emcy.sh \
  --message "Bootstrap EMCY-1" \
  --base 408f82d1 \
  --channel emergency \
  --dry-run
```

Output atteso:

```
[EMCY ✓] DRY-RUN completato — nessuna pubblicazione effettuata.
  Avrebbe pubblicato : EMCY-1 sul canale 'emergency'
  Runtime            : 10.0.0
  Messaggio EAS      : [OTA:EMCY-1] Bootstrap EMCY-1
  Bundle             : .../index.android.bundle (N byte)
```

Se la Guard G1 fallisce (`runtimeVersion` mismatch), verificare:

```bash
git show 408f82d1:app.json | node -e \
  "const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')); console.log(d.expo.runtimeVersion)"
```

---

## Step 2 — Pubblicazione live (solo dall'ambiente main)

```bash
bash scripts/publish-ota-emcy.sh \
  --message "Bootstrap EMCY-1" \
  --base 408f82d1 \
  --channel emergency
```

Lo script:
1. Crea un git worktree detached su `408f82d1` (HEAD/branch non toccati).
2. Copia i sorgenti del worktree in un `BUILD_DIR` dentro `/home/runner/workspace/` (stesso
   filesystem di `node_modules`) via tar pipe; symlink `node_modules` dal workspace — Metro
   risolve `expo-router/entry.js` correttamente.
3. `npx expo export --platform android` dal `BUILD_DIR`.
4. Smoke test: bundle > 1 KB.
5. `eas update --channel emergency --environment production` (1-2 minuti).
6. Insert in `ota_releases`: `channel='emergency'`, `status='pending'`.

Output finale atteso:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[EMCY ✓] EMCY pubblicata come PENDING!
  Versione      : EMCY-1
  Canale        : emergency
  Runtime       : 10.0.0
  Update ID     : <uuid>
  Prossimi step : 1) /admin/ota → sezione EMCY → Approva la release
                  2) attiva il redirect EMCY per distribuirla a TUTTI i device
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

---

## Step 3 — Approvazione in-app

1. Aprire l'app come admin.
2. Navigare in **Admin → OTA**.
3. Nella sezione **Canale Emergenza (EMCY)** trovare `EMCY-1` con stato `PENDING`.
4. Premere **Approva** → confermare nel dialog.
5. Verificare che lo stato mostri **APPROVED**.

Il pulsante **🚨 Attiva redirect EMCY** diventa operativo non appena esiste almeno
una release EMCY approvata.

---

## Verifica rapida via API (opzionale)

```bash
curl -s "$EXPO_PUBLIC_DOMAIN/api/admin/ota/emergency/status" \
  -H "Cookie: connect.sid=<admin-session>" \
  | jq '{active:.active, releases:[.releases[]|{v:.otaVersion,s:.status}]}'
```

Risposta attesa dopo l'approvazione:

```json
{
  "active": false,
  "releases": [{ "v": "EMCY-1", "s": "approved" }]
}
```

---

## Come attivare il redirect in un'emergenza reale

> **Usare solo se la production è rotta** e i device devono essere riportati alla base sana.

1. In-app: **Admin → OTA → Canale Emergenza (EMCY)** → **🚨 Attiva redirect EMCY**.
2. Confermare il dialog di avvertimento.
3. Entro il prossimo ciclo OTA (~5 minuti), tutti i device ricevono EMCY-1.
4. Per tornare alla production normale: **🛑 Disattiva redirect EMCY**.

---

## Pubblicare una EMCY-N successiva (con patch opzionale)

```bash
# Prepara patch dal diff tra commit base e HEAD
git diff 408f82d1..HEAD -- path/to/fix.ts > /tmp/my-fix.patch

# Pubblica EMCY-2 con la patch applicata sul commit base
bash scripts/publish-ota-emcy.sh \
  --message "Fix critico: <descrizione>" \
  --base 408f82d1 \
  --patch /tmp/my-fix.patch \
  --channel emergency
```

Poi approvare EMCY-2 dal pannello admin. Il toggle EMCY servirà automaticamente
la release approvata più recente sul canale `emergency`.

---

## Invarianti di sicurezza

| Guard | Descrizione |
|---|---|
| G1 | Build solo dal commit con `runtimeVersion=10.0.0` — altri runtime non ricevono EMCY |
| G2 | Sorgenti del commit base in `BUILD_DIR` (stesso filesystem workspace) + `node_modules` symlinkato — Metro risolve correttamente le dipendenze |
| G3 | Release entra sempre `pending` — nessun device riceve EMCY senza approvazione admin |
| G4 | Smoke test bundle > 1 KB prima dell'upload — previene distribuzione bundle corrotti |
| Toggle guard | `active=true` bloccato se non esiste release `emergency` con `status='approved'` |
| Channel preserve | `approve` mantiene `release.channel` — EMCY approvata rimane su `emergency`, mai su `production` |

---

## Componenti del sistema

| Componente | File |
|---|---|
| Script publish | `scripts/publish-ota-emcy.sh` |
| Manifest redirect | `server/routes/ota-public.ts` |
| Admin API | `server/routes/admin/ota.ts` |
| Admin UI (toggle + approva) | `components/admin/ota/OtaPanelExtra.tsx` |
| Schermata admin | `app/admin/ota.tsx` |
