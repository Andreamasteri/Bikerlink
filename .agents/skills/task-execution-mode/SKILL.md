---
name: task-execution-mode
description: Skill obbligatoria che impone l'inserimento del blocco "## ⚙️ Esecuzione Agente" come PRIMA sezione di ogni plan file in `.local/tasks/`. Dichiara a monte il peso del task (Light/Economy/Power) e se serve App Testing (ON/OFF). Da applicare SEMPRE quando si crea, propone, pianifica, modifica, riscrive o aggiorna un project task BikerLink. Trigger keyword IT/EN: crea task, nuovo task, proponi task, pianifica task, pianifica il lavoro, task atomico, project task, plan file, plan a task, create task, new task, propose task, plan task, atomic task, task planning, bulkCreateProjectTasks, updateProjectTask, scrivi plan, scrivere il task, modalità esecuzione, esecuzione agente, modello agente, light economy power, app testing, smoke test a monte, task agent, plan mode, planning mode.
---

# Esecuzione Agente — blocco obbligatorio nei plan file

## ⛔ REGOLA OBBLIGATORIA

**Ogni plan file in `.local/tasks/*.md`** deve avere come **prima sezione** (subito dopo il titolo `#`) il blocco `## ⚙️ Esecuzione Agente`. Senza eccezioni.

Si applica a:
- **Ogni nuovo task** creato via `bulkCreateProjectTasks`.
- **Ogni edit** di un plan file esistente in `.local/tasks/` (anche se è un piccolo aggiornamento).
- **Ogni task** creato in Plan mode dal main agent.
- **Ogni task** proposto al volo durante una conversazione che poi diventa plan file.

Se stai per scrivere o modificare un plan file e questo blocco manca o è incompleto → fermati, inseriscilo come prima sezione, poi prosegui.

---

## Formato esatto del blocco

```markdown
## ⚙️ Esecuzione Agente
- Modello: Light | Economy | Power
- App Testing: ON | OFF
- Motivo: <una frase che giustifichi entrambe le scelte>
```

- Esattamente questi tre bullet, in quest'ordine.
- Una sola scelta per riga (es. `Modello: Economy`, non `Modello: Economy/Power`).
- Il "Motivo" è una sola frase concreta — niente elenchi puntati interni, niente paragrafi.

Posizione nel file:
```markdown
# <titolo task>

## ⚙️ Esecuzione Agente
- Modello: ...
- App Testing: ...
- Motivo: ...

## What & Why
...
```

---

## Semantica dei tre modelli

| Modello | Quando usarlo | Esempi |
|---|---|---|
| **Light** | Modifica isolata in **un singolo file**, nessuna logica, nessun ragionamento. Cambio testo, costante, asset, copy, una riga di stile. | Cambiare la scritta in fondo al profilo (cfr. `.local/tasks/scritta-ananas-profilo.md`); aggiornare un colore hardcoded; rinominare un'etichetta. |
| **Economy** | Feature **contenuta**, 1–3 file, logica semplice senza refactor. Nuovo endpoint CRUD isolato, nuovo componente piccolo, fix lineare con causa nota. | Aggiungere un nuovo campo opzionale a un form; nuovo endpoint `GET /api/foo/:id` che legge una tabella esistente; aggiungere un toggle in settings. |
| **Power** | Refactor non banale, **multi-file (>3)**, debug di infrastruttura, ragionamento richiesto, dipendenze incrociate, gate ratchet da rispettare. | Sbloccare publish con refactor del pannello admin (cfr. `.local/tasks/2671-sblocca-publish.md`); migrazione schema DB con backfill; refactor del matching engine. |

Regola pratica: in caso di dubbio tra due livelli, **scegli quello più alto**. Sotto-stimare costa più di sovra-stimare.

---

## Semantica App Testing

| Valore | Quando usarlo |
|---|---|
| **ON** | Il task tocca **anche solo uno** degli elementi coperti da `auto-smoke-on-ui-change`: UI interattiva (`Pressable`, `onPress`, `<Button>`, gesture handler), navigazione (`router.push`, `<Link>`, `_layout.tsx`, `Stack.Screen`, `Tabs.Screen`, `NativeTabs`), modali / sheet / form submit, publish OTA, pannello admin (UI), qualsiasi schermata utente che cambia comportamento al tap. |
| **OFF** | Puro backend (route API senza UI client toccata), script standalone, documentazione, seed dati, modifiche di stile puro **senza** handler nuovi, costanti, tipi, commenti. |

In caso di dubbio: **ON**. Lo smoke costa poco, una regressione UI in produzione costa molto.

App Testing ON **non sostituisce** `auto-smoke-on-ui-change`: questa skill dichiara a monte *che servirà* lo smoke; `auto-smoke-on-ui-change` resta autorità sul *come e quando* eseguirlo a fine task.

---

## Esempi reali dai task storici

### Esempio Light + OFF — `scritta-ananas-profilo.md`
```markdown
## ⚙️ Esecuzione Agente
- Modello: Light
- App Testing: OFF
- Motivo: Modifica testuale isolata in un singolo file, nessuna logica.
```
Motivazione: un `<Text>` aggiunto in fondo a `profile.tsx`, niente handler, niente navigazione → Light, niente smoke.

### Esempio Power + ON — `2671-sblocca-publish.md`
```markdown
## ⚙️ Esecuzione Agente
- Modello: Power
- App Testing: ON
- Motivo: Refactor multi-file del pannello admin sotto ratchet 600 righe + sblocco publish OTA, richiede ragionamento e verifica runtime su UI admin.
```
Motivazione: estrazione componenti da `app/admin/index.tsx`, gate ratchet, OTA publish → Power; il pannello admin è UI interattiva → ON.

### Esempio Economy + OFF (riferimento generico)
```markdown
## ⚙️ Esecuzione Agente
- Modello: Economy
- App Testing: OFF
- Motivo: Nuovo endpoint `GET /api/clubs/:id/stats` che legge tabelle esistenti, nessuna UI client toccata.
```

### Esempio Economy + ON (riferimento generico)
```markdown
## ⚙️ Esecuzione Agente
- Modello: Economy
- App Testing: ON
- Motivo: Nuovo bottone "Invia SOS" con handler in `(tabs)/sos.tsx` e apertura modale di conferma.
```

---

## Relazione con `auto-smoke-on-ui-change`

- **Questa skill** = autorità sul *dichiarare a monte* (in fase di plan) se servirà smoke.
- **`auto-smoke-on-ui-change`** = autorità sul *lanciare lo smoke a valle* (a fine task, prima di firmare il completamento).

Le due skill sono complementari e non sovrapposte:
- Plan file con `App Testing: ON` → l'esecutore *deve* prevedere lo smoke a fine task.
- Plan file con `App Testing: OFF` → l'esecutore può saltare lo smoke, **salvo** che durante l'implementazione emergano modifiche che `auto-smoke-on-ui-change` classifica come interattive (in quel caso vince `auto-smoke-on-ui-change` e lo smoke va lanciato comunque, segnalando lo scostamento dal plan).

---

## Checklist rapida prima di firmare un plan file

- [ ] Il blocco `## ⚙️ Esecuzione Agente` è la **prima sezione** dopo il titolo `#`.
- [ ] I tre bullet `Modello`, `App Testing`, `Motivo` sono presenti, in quest'ordine, con un solo valore ciascuno.
- [ ] La scelta del **Modello** è coerente con il numero di file toccati e la complessità descritta in `## Steps`.
- [ ] La scelta di **App Testing** è coerente con i pattern di `auto-smoke-on-ui-change` (UI, navigazione, modali, admin panel, publish OTA).
- [ ] Il **Motivo** è una sola frase concreta che giustifica entrambe le scelte.
