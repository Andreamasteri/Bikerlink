---
name: controllo-incrociato
description: Protocollo di verifica a doppio sistema indipendente per BikerLink. Leggere e applicare al termine di QUALSIASI task — backend, frontend, DB, script, OTA, split, hotfix. Definisce Sistema A (analisi statica) e Sistema B (verifica runtime), il ciclo completo A→B→fix→B→A, checklist per tipo di task, regole di escalation e firma di completamento.
---

# Controllo Incrociato Universale — BikerLink

## Regola obbligatoria

Ogni agente deve eseguire questo protocollo **al termine di qualsiasi task**, indipendentemente dal tipo. Non è facoltativo. Non è solo per gli split. La parola d'ordine è: **controllo incrociato**.

---

## I due sistemi indipendenti

### Sistema A — Analisi Statica

Opera esclusivamente su file, codice, configurazione, schema. **Non avvia processi, non chiama API, non legge porte.**

Controlla:
- TypeScript: errori di compilazione, import mancanti, tipi incompatibili
- Schema DB: coerenza tra migration, modelli Drizzle/Prisma e query nel codice
- Versioning: allineamento tra `app.json`, `build.gradle`, `strings.xml`, `publish-ota.sh` (vedi skill `bikerlink-versioning`)
- Dipendenze: package.json vs import usati nel codice, versioni pinned critiche (es. `react-native-maps@1.18.0`, `expo-crypto@15.0.x`)
- Configurazione: variabili d'ambiente referenziate nel codice vs quelle effettivamente dichiarate
- Conflitti di file: import circular, file duplicati, export mancanti

### Sistema B — Verifica Runtime

Opera esclusivamente su processi live, porte, risposte HTTP, log. **Non legge file statici per validare — verifica il comportamento effettivo.**

Controlla:
- Porte: backend risponde su 5000, Metro risponde su 8081
- Health API: `GET /api/health` restituisce `{ status: "ok" }`
- Workflow status: backend e frontend sono nello stato "running"
- Log di avvio: nessun errore fatale nei log recenti (usa `refresh_all_logs`)
- Comportamento app: le funzionalità toccate dal task rispondono correttamente
- DB runtime: le query toccate dal task non producono errori a runtime

---

## Ciclo completo obbligatorio

```
(1) Esegui Sistema A — annota TUTTI i findings, anche minimi
        ↓
(2) Esegui Sistema B — annota TUTTI i findings, anche minimi
        ↓
(3) Merge findings con priorità (BLOCCANTE → WARNING → INFO)
        ↓
(4) Applica correzioni per tutti i findings BLOCCANTI e WARNING
        ↓
(5) Ri-esegui Sistema B — conferma che il runtime è pulito
        ↓
(6) Ri-esegui Sistema A — esclude regressioni statiche introdotte dal fix
```

**I due sistemi nella prima passata sono indipendenti**: A non può usare risultati di B e viceversa. Solo dopo il merge al punto (3) i risultati vengono combinati.

---

## Checklist per tipo di task

### Backend Express

**Sistema A:**
- [ ] TypeScript compila senza errori (`npx tsc --noEmit` o `npm run server:build`)
- [ ] Import verificati — nessun modulo mancante nei file toccati
- [ ] Variabili d'ambiente usate nel codice sono dichiarate (non hardcoded)
- [ ] Nuove route registrate nel router principale
- [ ] Schema DB allineato con le query (nessuna colonna referenziata che non esiste)
- [ ] Versioning non toccato (oppure aggiornato secondo skill `bikerlink-versioning`)

**Sistema B:**
- [ ] `GET /api/health` → `{ status: "ok" }` (max 3 tentativi, 5s timeout ciascuno)
- [ ] Le nuove route rispondono con status code atteso
- [ ] Log backend: nessun `ERROR` o `FATAL` nei log recenti
- [ ] Porta 5000 raggiungibile
- [ ] DB: nessun errore di connessione nei log

---

### Frontend Expo

**Sistema A:**
- [ ] TypeScript compila senza errori
- [ ] Import verificati — nessun import da path che non esiste
- [ ] `app.json` non modificato (oppure aggiornato correttamente)
- [ ] Nessuna libreria incompatibile con Expo Go aggiunta
- [ ] Versioni pinned critiche rispettate (`react-native-maps@1.18.0`, ecc.)
- [ ] Platform checks (`Platform.OS`) presenti dove richiesto dalla skill expo
- [ ] Safe area e insets web gestiti su tutte le schermate toccate
- [ ] **React Navigation prop inline** (skill `rnav-memo-guard`): nessuna funzione arrow inline su `tabBar`, `tabBarIcon`, `headerLeft`, `headerRight`, `header` — verificare con `bash scripts/check-rnav-inline-props.sh`

**Sistema B:**
- [ ] Metro risponde su porta 8081
- [ ] Nessun errore di bundle nei log del frontend
- [ ] Le schermate toccate si caricano senza crash (screenshot o log)
- [ ] HMR: nessun errore di fast refresh nei log

---

### Schema DB (migration / Drizzle / Prisma)

**Sistema A:**
- [ ] File migration è sintatticamente valido (SQL o schema TS)
- [ ] Nomi colonne coerenti tra migration e modelli ORM
- [ ] Query nel codice server referenziano solo colonne che esistono nella migration
- [ ] Nessuna migration ha `DROP TABLE` o `DROP COLUMN` non intenzionale
- [ ] Indici e constraint definiti dove richiesti dalle query critiche

**Sistema B:**
- [ ] Migration applicata con successo (log del processo di migration)
- [ ] Query di test sulle tabelle toccate non producono errori
- [ ] Il backend si avvia correttamente dopo la migration
- [ ] `GET /api/health` risponde dopo la migration

---

### Script Bash

**Sistema A:**
- [ ] Script è eseguibile (`chmod +x` applicato)
- [ ] Nessun placeholder non sostituito (`NOME_APP`, `BACKEND_CMD`, ecc.)
- [ ] Variabili usate nel body sono dichiarate o esportate
- [ ] Nessun path assoluto hardcoded (usa `$WORKSPACE_PATH` o relativi)
- [ ] Trap SIGTERM/SIGINT presenti se lo script è long-running
- [ ] `set -e` o gestione esplicita degli errori critica

**Sistema B:**
- [ ] Script eseguibile senza errori in ambiente Replit
- [ ] Output atteso prodotto (es. file creati, porta libera, processo avviato)
- [ ] Nessun processo zombi o lock file orfano lasciato dopo l'esecuzione
- [ ] Se chiama porte: le porte sono raggiungibili dopo l'esecuzione

---

### OTA Publish

**Sistema A:**
- [ ] Skill `bikerlink-versioning` consultata — versioni allineate tra tutti i file
- [ ] `publish-ota.sh`: formula VERSION corretta (build, NEXT_OTA, ciclo)
- [ ] `runtimeVersion` in `app.json` e `strings.xml` coincidono
- [ ] Nessuna modifica nativa inclusa nell'OTA (OTA = solo JS)
- [ ] Token OTA presente nelle variabili d'ambiente

**Sistema B:**
- [ ] Script `publish-ota.sh` eseguito senza errori
- [ ] OTA publicata con ID e versione attesi
- [ ] Il canale di distribuzione corretto riceve l'aggiornamento
- [ ] Nessun errore nei log di publish

---

### Split multi-task

**Sistema A:**
- [ ] Tutti i file di interfaccia condivisi (tipi TypeScript, schema, endpoint) sono coerenti tra i task paralleli
- [ ] Nessun conflitto di nome tra variabili/funzioni introdotte dai task paralleli
- [ ] Import incrociati tra i task non creano circular dependency

**Sistema B:**
- [ ] Il sistema integrato (backend + frontend combinati) si avvia senza errori
- [ ] Il flusso end-to-end toccato dallo split funziona correttamente
- [ ] Nessuna regressione sulle funzionalità non toccate dallo split

---

### Hotfix

**Sistema A:**
- [ ] Il fix è minimale — nessuna modifica collaterale non necessaria
- [ ] TypeScript compila dopo il fix
- [ ] Il bug root cause è indirizzato, non solo il sintomo

**Sistema B:**
- [ ] Il comportamento che causava il bug non si ripresenta
- [ ] Le funzionalità adiacenti non sono regredite
- [ ] Log puliti dopo il fix

---

## Regole di escalation

### BLOCCANTE — fermarsi, non procedere, segnalare

| Condizione | Azione |
|---|---|
| TypeScript: errori di compilazione che impediscono il build | Blocco — fix obbligatorio prima di consegnare |
| Porta non raggiungibile dopo 3 tentativi (timeout 5s ciascuno) | Blocco — investigare log, non ignorare |
| Schema DB incoerente con il codice (colonna mancante, tipo sbagliato) | Blocco — fix migration o codice |
| `GET /api/health` non risponde dopo 3 tentativi | Blocco — backend non funzionante |
| Variabile d'ambiente critica mancante (es. token OTA, DB URL) | Blocco — non pubblicare/deployare |
| Migration con DROP non intenzionale su tabella con dati | Blocco — rollback immediato |
| Versioni di file non allineate dopo OTA/APK publish | Blocco — allineare prima di consegnare |

### WARNING — annotare nel finding, procedere con cautela

| Condizione | Azione |
|---|---|
| Deprecation notice TypeScript (non error) | Annotare, non bloccare |
| Log di errori non fatali (es. cache miss, retry riuscito) | Annotare, verificare che non si ripetano |
| Test di prewarm bundle falliti (Metro attivo, bundle non pre-warmato) | Annotare, non bloccare |
| Import non usato o variabile non usata | Annotare, cleanup opportunistico se nel file toccato |
| Porta secondaria non raggiungibile (non critica per il task) | Annotare, non bloccare |
| Performance degradata nei log (response time > 2s su API interne) | Annotare, non bloccare |

### INFO — solo logging interno, nessuna azione richiesta

| Condizione | Azione |
|---|---|
| Log di avvio verbosi ma senza errori | Ignorare |
| Rebuild eseguito per modifiche non correlate al task | Ignorare |
| Bundle pre-warm completato con tempi > attesi | Ignorare |

---

## Firma di completamento

Al termine del ciclo completo, l'agente deve produrre questo blocco strutturato e includerlo nel **commit message** o nel **task summary**:

```
=== CONTROLLO INCROCIATO ===

SISTEMA A — Findings statici:
- [BLOCCANTE/WARNING/INFO] <descrizione finding>
- (oppure: nessun finding)

SISTEMA B — Findings runtime:
- [BLOCCANTE/WARNING/INFO] <descrizione finding>
- (oppure: nessun finding)

CORREZIONI APPLICATE:
- <descrizione fix applicato> (era: BLOCCANTE/WARNING)
- (oppure: nessuna correzione necessaria)

SISTEMA B ri-verifica:
- Risultato: PULITO / PROBLEMI RESIDUI
- <dettaglio se ci sono problemi residui>

SISTEMA A ri-verifica:
- Risultato: PULITO / PROBLEMI RESIDUI
- <dettaglio se ci sono problemi residui>

ESITO FINALE: VERDE (consegna) / ROSSO (blocco — vedi findings)
============================
```

### Quando l'esito è ROSSO

Non marcare il task come completo. Segnalare i findings bloccanti nel messaggio di blocco e indicare esplicitamente quale condizione impedisce la consegna. Il task rimane aperto finché l'esito non diventa VERDE.

---

## Come ricavare la categoria del task dal contesto

Se non è esplicitamente noto il tipo di task, usare questa euristica:

| Segnali nel contesto | Categoria |
|---|---|
| File `server/`, `server_dist/`, Express, API route | Backend Express |
| File `app/`, `components/`, `hooks/`, Expo, React Native | Frontend Expo |
| File `*migration*`, `schema.ts`, `drizzle/`, `prisma/` | Schema DB |
| File `scripts/*.sh`, `*.sh` | Script Bash |
| `publish-ota.sh`, `runtimeVersion`, OTA, EAS Update | OTA Publish |
| Task paralleli con prefisso split / multi-task | Split multi-task |
| Fix urgente, revert, patch su bug in produzione | Hotfix |
| Nessun segnale chiaro | Applicare checklist Backend + Frontend (sovra-insieme sicuro) |
