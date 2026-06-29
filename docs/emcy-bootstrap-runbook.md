# Runbook — Bootstrap OTA Canale Emergenza (EMCY)

> **NOTA**: questo file va eseguito DALL'AMBIENTE MAIN (non da un task-agent isolato).
> Richiede `EAS_TOKEN` e `DATABASE_URL` nell'ambiente.

---

## Stato precondizioni (verificate da task-5091)

| Elemento | Stato |
|---|---|
| Script `scripts/publish-ota-emcy.sh` | ✅ presente e completo (guard G1–G4) |
| Pannello admin `OtaPanelExtra.tsx` | ✅ presente con toggle + approva/revoca |
| Commit base `408f82d1` | ✅ nel repo (runtimeVersion `10.0.0`) |
| Patch infrastruttura EMCY | ✅ `docs/emcy-bootstrap.patch` (1262 righe) |
| API backend `/api/admin/ota/emergency/*` | ✅ endpoint toggle + status |

---

## Strategia canali

| Tipo | Canale EAS | Quando |
|---|---|---|
| Bootstrap (questo step) | `production` | Prima release dal commit base sul canale normale |
| Release emergenza | `emergency` | Quando la production è rotta — redirect automatico |

Il **bootstrap** va su `production` perché è il punto di partenza sicuro che i device
già receivono normalmente. Le release EMCY successive usano `emergency` e vengono
attivate tramite redirect (flag `ota_emergency_active`).

---

## Step 1 — Dry-run (verifica pre-pubblicazione)

```bash
bash scripts/publish-ota-emcy.sh \
  --message "Bootstrap EMCY — base di recupero runtime 10.0.0" \
  --base 408f82d1 \
  --channel production \
  --dry-run
```

Atteso output:
```
[EMCY ✓] DRY-RUN completato — nessuna pubblicazione effettuata.
  Avrebbe pubblicato : EMCY-1 sul canale 'production'
  Runtime            : 10.0.0
  Bundle             : *.hbc (<size> byte)
```

Se la GUARD G1 fallisce (`runtimeVersion` mismatch), verificare che
`app.json` nel commit `408f82d1` abbia `runtimeVersion: "10.0.0"`.

---

## Step 2 — Pubblicazione bootstrap (solo dall'ambiente main)

```bash
bash scripts/publish-ota-emcy.sh \
  --message "Bootstrap EMCY — base di recupero runtime 10.0.0" \
  --base 408f82d1 \
  --channel production
```

La release viene inserita in DB con `status='pending'` e `channel='production'`.
EAS riceve la release nel canale `production`.
**La release NON è ancora distribuita** (flag admin-first, stato `pending`).

---

## Step 3 — Approvazione dal pannello admin

1. Aprire l'app come admin
2. Navigare in **Pannello Admin → OTA**
3. La release comparirà nella lista OTA con stato `PENDING`
4. Premere **Approva** → confermare
5. Verificare che lo status passi a `APPROVED`

---

## Step 4 — Pubblicazione EMCY (quando la production è rotta)

Quando serve la rete di sicurezza, pubblicare una nuova release dal commit
base sul canale `emergency`:

```bash
bash scripts/publish-ota-emcy.sh \
  --message "Emergenza: <descrizione del problema>" \
  --base 408f82d1 \
  --channel emergency
```

Poi dal pannello admin (sezione **Canale Emergenza**):
1. Approvare la release EMCY-N
2. Premere **🚨 Attiva redirect EMCY**
3. Il manifest `/api/ota/manifest` inizia a servire EMCY-N a tutti i device
4. Per disattivare: **🛑 Disattiva redirect EMCY**

---

## Note tecniche

- Il toggle EMCY ON viene **rifiutato** se non esiste una release `emergency` con `status='approved'`
- Le release EMCY usano numerazione `EMCY-N` separata dalla production (`N.N.N`)
- La sync EAS production ignora le EMCY (regex `^[0-9]+\.[0-9]+\.[0-9]+$`)
- `approve` preserva `release.channel` — le release restano sul loro canale originale
- Base commit `408f82d1` = OTA-131, runtimeVersion `10.0.0`
