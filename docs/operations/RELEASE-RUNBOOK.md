# BikerLink — Runbook operativo delle release

**Autorità:** procedura esecutiva del Release System v1.0.  
**Regola assoluta:** Andrea è l'unico decisore per approvazione candidata,
promozione a produzione e chiusura definitiva. Quebracho non può promuovere
automaticamente né usare DB-2 Production come ambiente di prova.

## Ruoli

| Fase | Esecutore | Decisore | Evidenza obbligatoria |
|---|---|---|---|
| Sviluppo e verifiche DEV | Quebracho | Andrea definisce l'obiettivo | commit, test, migration numerate |
| Creazione DB-1 Candidate | Quebracho, tramite azione controllata | Andrea ha autorizzato il ciclo release | branch Neon con parent=production, ID e timestamp |
| Staging/CI/smoke/OTA admin | Quebracho prepara ed esegue; admin testa | Andrea | manifest, CI/smoke, ID EAS, esito test device |
| Approvazione candidata | — | **Andrea soltanto** | formula esplicita con release ID e commit |
| Preparazione promozione PROD | Quebracho | Andrea | preflight: commit, checksum migration, DB-2, PITR, runtime |
| Promozione DB-2/backend/OTA production | pipeline protetta eseguita da Quebracho **solo dopo conferma di Andrea** | **Andrea soltanto** | audit deploy, smoke PROD, EAS production ID |
| Chiusura ed eliminazione Candidate | Quebracho esegue cleanup controllato | **Andrea autorizza la chiusura** | record chiuso, endpoint/branch eliminati, audit conservato |

## Formule di controllo

| Azione | Formula richiesta da Andrea | Effetto |
|---|---|---|
| Aprire candidata | CREA CANDIDATA &lt;release_id&gt; DAL COMMIT &lt;sha&gt; | Quebracho crea/verifica DB-1 e registra il manifest |
| Approvare candidata | APPROVO CANDIDATA &lt;release_id&gt; COMMIT &lt;sha&gt; | abilita solo il preflight production, non effettua deploy |
| Promuovere production | AUTORIZZO PROMOZIONE PROD &lt;release_id&gt; COMMIT &lt;sha&gt; | abilita una sola pipeline PROD con stesso commit e migration |
| Chiudere candidata | CHIUDI CANDIDATA &lt;release_id&gt; | Quebracho elimina DB-1/endpoint staging e conserva l'audit |
| Rifiutare candidata | RIFIUTO CANDIDATA &lt;release_id&gt;: &lt;motivo&gt; | blocca la release; DB-2 e utenti restano invariati |

Una conferma deve sempre riportare release ID e SHA completo. Una semplice
parola come “vai” non è valida per PROD.

## Gate e responsabilità

### 1. Creazione candidate — Quebracho

Quebracho può creare DB-1 soltanto da DB-2 Production, non da DEV. Prima di
proseguire registra nel manifest project/branch ID, parent ID, timestamp, commit
congelato e stato migration. Se parent, host o ID non corrispondono, fallisce
chiuso.

### 2. Approvazione candidate — Andrea

Andrea approva soltanto dopo CI, smoke candidate, backend staging, OTA staging/admin
e test dispositivo reale compatibile con il runtime. L'esito cambia lo stato in
CANDIDATE_APPROVED; non rende visibile nulla agli utenti.

### 3. Promozione PROD — Andrea + pipeline protetta

Quebracho prepara il pacchetto di preflight ma non possiede il potere di
promozione autonoma. La pipeline ricontrolla SHA, migration/checksum, DB-2,
PITR valido e compatibilità con il client precedente. Un controllo fallito
porta a PRODUCTION_BLOCKED: nessuna OTA production e nessun retry automatico.

### 4. Eliminazione candidate — Quebracho dopo chiusura di Andrea

Quebracho elimina Candidate solo dopo CHIUDI CANDIDATA o RIFIUTO CANDIDATA,
mai durante CANDIDATE_TESTING o CANDIDATE_APPROVED. L'ordine è: disabilitare
backend/job staging, archiviare manifest e risultati, eliminare endpoint,
eliminare branch, verificare assenza delle risorse.

Se il cleanup fallisce, stato CLEANUP_BLOCKED: non si cancella a mano senza
annotare branch ID, causa e nuovo tentativo.

## Matrice di stato

~~~text
DRAFT -> DEV_VERIFIED -> CANDIDATE_DEPLOYED -> CANDIDATE_TESTING
CANDIDATE_TESTING -> CANDIDATE_APPROVED       [Andrea: APPROVO CANDIDATA]
CANDIDATE_APPROVED -> PRODUCTION_DEPLOYING    [Andrea: AUTORIZZO PROMOZIONE PROD]
PRODUCTION_DEPLOYING -> PRODUCTION_READY -> OTA_ROLLOUT -> COMPLETED -> CLOSED
CANDIDATE_TESTING -> CANDIDATE_REJECTED       [Andrea: RIFIUTO CANDIDATA]
CANDIDATE_REJECTED -> CLOSED                  [Quebracho cleanup]
qualunque stato PROD -> PRODUCTION_BLOCKED    [preflight/deploy failure]
~~~

## Candidato corrente

BL-20260727-C01 resta db_validated_waiting_staging_backend: non è approvata,
non è pubblicata su EAS e non può entrare in promozione PROD. Solo Andrea può
sbloccarla dopo i test; il cleanup non è autorizzato finché non viene rifiutata
o chiusa esplicitamente.
