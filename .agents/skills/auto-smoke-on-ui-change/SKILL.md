---
name: auto-smoke-on-ui-change
description: Skill obbligatoria che impone l'esecuzione automatica dello smoke test BikerLink ogni volta che viene creato, modificato, rinominato, spostato o rimosso un elemento interattivo dell'app Expo (button, TouchableOpacity, Pressable, onPress, onLongPress, Link, router.push, router.replace, router.back, navigation, NativeTabs, Tabs, Stack.Screen, _layout.tsx, gesture handler, modal, sheet, form submit, href). Trigger keyword IT/EN: tasto, pulsante, bottone, trigger, gesture, navigazione, tab, scheda, modale, sheet, form, link, route, screen, layout, handler, onPress, onClick, navigate, push, replace, button, pressable, touchable. Da applicare SEMPRE a modifiche in `app/**` e `components/**` che toccano interattività o navigazione.
---

# Auto-Smoke su modifica UI — BikerLink

## ⛔ REGOLA OBBLIGATORIA

**DEVI** lanciare lo smoke test BikerLink **ogni volta** che, durante un task, hai **creato, modificato, rinominato, spostato o rimosso** un elemento interattivo o un punto di navigazione nell'app Expo. Non aspettare che l'utente lo chieda. Non saltare. Non rimandare.

Questa skill si applica **a livello agente** (non git, non CI): scatta nel momento esatto in cui stai per firmare il completamento di un task che ha toccato l'UI interattiva.

È complementare a `controllo-incrociato`: lo smoke è il blocco runtime obbligatorio del Sistema B quando le modifiche riguardano l'interattività dell'app.

---

## Pattern che attivano lo smoke (SEMPRE)

Lancia lo smoke se hai toccato **anche solo uno** di questi pattern in `app/**` o `components/**`:

### Elementi interattivi
- `<Pressable ...>`, `<TouchableOpacity ...>`, `<TouchableHighlight ...>`, `<TouchableWithoutFeedback ...>`
- `<Button ...>` (React Native o custom)
- Props handler: `onPress`, `onLongPress`, `onPressIn`, `onPressOut`, `onChange`, `onSubmit`, `onSubmitEditing`
- `PanResponder`, `Gesture`, `GestureDetector`, `react-native-gesture-handler`

### Navigazione
- `<Link ...>` da `expo-router`
- `router.push(...)`, `router.replace(...)`, `router.back(...)`, `router.navigate(...)`
- `useRouter`, `useNavigation`, `useLocalSearchParams` (se cambia la firma del param)
- `href` su componenti link
- File `_layout.tsx`, `<Stack.Screen ...>`, `<Tabs.Screen ...>`, `<NativeTabs ...>`
- Aggiunta / rimozione / rinomina / spostamento di file route in `app/**`

### Overlay e form
- `<Modal ...>`, `<BottomSheet ...>`, `presentationStyle: "formSheet"`
- `<TextInput onSubmitEditing={...}>`, `<Form onSubmit={...}>`
- Apertura / chiusura programmatica di modali e sheet

### Esempio concreto
Se modifichi `app/(tabs)/index.tsx` aggiungendo un `<Pressable onPress={...}>`, **devi** lanciare lo smoke **prima** di firmare il completamento del task. Niente eccezioni.

---

## Quando NON lanciare lo smoke (eccezioni esplicite)

Solo questi casi sono esentati:

- Modifiche di **stile puro**: colori, spacing, padding, font, ombre, border radius — **senza** aggiungere/rimuovere handler o route.
- Modifiche di **sola copy / testi** dentro componenti già esistenti (no nuovi `<Pressable>`, no nuovi link).
- Modifiche di **soli commenti**, JSDoc, o riformattazione.
- Modifiche a file fuori da `app/**` e `components/**` che non toccano UI (es. utility pure, costanti, tipi).

In ogni dubbio: **lancia lo smoke**. Il costo è basso, il rischio di regressione UI è alto.

---

## Procedura passo-passo

### 1. Esegui lo smoke test

Usa il workflow `Smoke Test` (definito nel task #2668):

```
restart_workflow({ name: "Smoke Test" })
```

In alternativa, se serve eseguirlo manualmente:

```bash
tsx scripts/smoke/run-smoke.ts
```

> **Se #2668 non è ancora merged** e lo script `scripts/smoke/run-smoke.ts` / il workflow `Smoke Test` non esistono nel branch corrente: applica il **fallback manuale** seguendo la checklist `docs/smoke-test.md`, e segnala nel report che lo script automatico non era disponibile.

### 2. Esegui la mini-checklist UI rapida

Per ogni flusso toccato dal task, verifica manualmente (screenshot o app preview):

- [ ] La schermata si carica senza crash
- [ ] Gli elementi interattivi toccati rispondono al tap
- [ ] La navigazione attivata dai nuovi/modificati handler porta alla schermata attesa
- [ ] Il back / chiusura modale funziona
- [ ] Nessun errore rosso nei log di Metro o nei log backend correlati

### 3. Produci il report PASS/FAIL

Includi nel messaggio finale all'utente (e nel commit message) questo blocco:

```
=== SMOKE TEST ===
Script: scripts/smoke/run-smoke.ts (workflow "Smoke Test")
Esito script: PASS / FAIL / N/D (script non disponibile, fallback manuale)
Flussi verificati:
- <flusso 1>: PASS / FAIL
- <flusso 2>: PASS / FAIL
Findings:
- [BLOCKER/WARNING/INFO] <descrizione>
- (oppure: nessun finding)
ESITO SMOKE: VERDE / ROSSO
==================
```

### 4. Blocca il completamento se ci sono BLOCKER

Se lo smoke produce anche **un solo finding BLOCKER**, **non chiamare `mark_task_complete`**. Applica il fix, ri-esegui lo smoke, e procedi solo quando l'esito è VERDE.

WARNING e INFO si annotano nel report ma non bloccano la consegna.

---

## What to report to the user

Nel messaggio finale al termine del task includi:

1. Un **riassunto in 1-2 righe** di cosa hai modificato a livello UI/interattività.
2. Il **blocco SMOKE TEST** formattato come sopra.
3. Se l'esito è ROSSO, indica esplicitamente **quale BLOCKER** impedisce la consegna e cosa serve per risolverlo.

Esempio:

```
Aggiunto pulsante "Invia SOS" in app/(tabs)/sos.tsx con handler che apre il modale di conferma.

=== SMOKE TEST ===
Script: scripts/smoke/run-smoke.ts (workflow "Smoke Test")
Esito script: PASS
Flussi verificati:
- Tab SOS → Pulsante Invia: PASS
- Modale conferma → Chiudi: PASS
Findings:
- nessun finding
ESITO SMOKE: VERDE
==================
```

---

## Cross-reference

- **Task #2668** — definisce lo script `scripts/smoke/run-smoke.ts` e il workflow `Smoke Test`. Questa skill ne è la controparte agente: #2668 fornisce lo strumento, questa skill ne impone l'uso.
- **Skill `controllo-incrociato`** — lo smoke test è parte integrante del Sistema B (verifica runtime) quando il task tocca UI interattiva. Eseguire lo smoke **non sostituisce** il ciclo A→B→fix→B→A, ma si integra al suo interno come step obbligatorio del Sistema B.
- **Skill `error-handling-protocol`** — se lo smoke produce un errore di runtime, applicare la procedura della scheda strutturata prima di tentare il fix.

---

## Riepilogo regola d'oro

> **Hai toccato un `onPress`, un `<Link>`, un `router.push`, un `_layout.tsx`, una `Stack.Screen`, un modale o un gesture handler in `app/**` o `components/**`?**
>
> **→ Lancia lo smoke. Sempre. Prima di firmare.**
