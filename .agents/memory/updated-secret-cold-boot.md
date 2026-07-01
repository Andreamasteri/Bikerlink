---
name: Updated secret needs cold boot to propagate
description: Perché aggiornare il VALORE di un secret esistente non si riflette nel container finché non c'è un cold boot
---

Aggiornare il **valore** di un secret Replit **già esistente** NON si propaga al
container workspace già avviato: i processi (incluso `Start Backend` riavviato con
`restart_workflow`) continuano a leggere il vecchio valore da `process.env` e da
`/proc/<pid>/environ`. Invece un secret **nuovo** (chiave mai vista prima) entra
subito nell'env dei processi riavviati.

**Why:** l'injection dei secret nel container avviene a boot del Repl; il restart
di un workflow crea un processo figlio che eredita l'env del container (merge:
aggiunge le chiavi nuove, ma NON sovrascrive quelle già presenti). Solo un **cold
boot** del container (deploy / merge del task / riavvio del Repl) rilegge tutti i
valori aggiornati. Sintomo tipico: reimposti un secret esistente e ne aggiungi uno
nuovo insieme — dopo il restart del backend solo quello nuovo mostra il valore
aggiornato, l'esistente resta sul vecchio valore.

**How to apply:** quando cambi il valore di un secret esistente e devi VERIFICARLO
in dev subito, non basta `restart_workflow`. O attendi il cold boot (il merge del
task lo fa) oppure verifica che lo store sia corretto e documenta che l'effetto
runtime arriva al prossimo boot. `viewEnvVars` mostra solo l'esistenza, non il
valore; per leggere il valore live usa `/proc/<pid>/environ` del processo target
(mascherando i token). NON convertire il secret in env var shared per aggirare il
problema: crea un duplicato che poi vince sul secret in shell.
