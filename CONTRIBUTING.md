# Contributing a BikerLink

## Setup iniziale

Dopo aver clonato il repository, esegui:

```bash
bash scripts/setup-hooks.sh
```

Questo installa i git hooks di sicurezza e genera la baseline per la scansione dei segreti.

---

## Protezione da segreti e token

Il progetto usa **detect-secrets** come pre-commit hook per impedire che
API key, token OAuth, chiavi SSH, OCID, password e simili finiscano
accidentalmente nel repository.

### Come funziona

La protezione opera su **due livelli**:

**Livello 1 — pre-commit hook (locale)**

Ad ogni `git commit`, il hook:

1. Scansiona i file in staging alla ricerca di pattern riconducibili a segreti.
2. Confronta il risultato con la baseline approvata (`.secrets.baseline`).
3. Blocca il commit se vengono trovati nuovi segreti non in baseline.

**Livello 2 — CI / validation step (sempre attivo, anche senza hook locale)**

La stessa scansione gira automaticamente in CI tramite lo script condiviso
`scripts/ci-secrets-scan.sh`, così il gate è garantito anche quando il pre-commit
hook è stato aggirato con `--no-verify` o non è mai stato installato in locale:

- **GitHub Actions** — ad ogni `push` e `pull_request` verso `main`, il job
  **Secrets Scan** esegue `bash scripts/ci-secrets-scan.sh --all`, che lancia
  `detect-secrets-hook --baseline .secrets.baseline` su **tutti** i file tracciati.
  Il risultato è visibile nella sezione **Checks** di ogni PR.
- **Replit validation step** — la validation `secrets-scan` esegue
  `bash scripts/ci-secrets-scan.sh` (modalità rapida: solo i file modificati
  rispetto a `main`) e blocca il completamento/merge del task se trova segreti
  non presenti nella baseline.

In entrambi i casi il processo esce con codice 1 e la pipeline fallisce se vengono
trovati segreti non approvati. Per eseguire la scansione manualmente in locale:

```bash
bash scripts/ci-secrets-scan.sh         # solo file modificati (veloce)
bash scripts/ci-secrets-scan.sh --all   # tutti i file tracciati (completo)
```

### Falsi positivi

Se il hook blocca un commit per un valore che **non è un segreto reale**
(es. una stringa di test, un ID pubblico, un hash), hai due opzioni:

#### Opzione 1 — Aggiungi alla baseline (raccomandato)

```bash
# Rigenera la baseline includendo il nuovo file
detect-secrets scan > .secrets.baseline

# Apri l'audit interattivo e marca il falso positivo
detect-secrets audit .secrets.baseline
# → scegli 'n' (not a secret) quando richiesto

# Committa la baseline aggiornata insieme ai tuoi file
git add .secrets.baseline
git commit -m "chore: aggiorna baseline detect-secrets"
```

#### Opzione 2 — Bypass una-tantum (solo emergenze)

```bash
git commit --no-verify -m "..."
```

> **Usa `--no-verify` solo se sei assolutamente certo che non ci siano
> segreti reali.** Ogni utilizzo dovrebbe essere documentato nel messaggio
> di commit.

---

## Test di componente

I test automatici dei componenti si trovano in `components/__tests__/` e vengono
eseguiti dal gate **"Gate test gesture componenti"** in `scripts/post-merge.sh`.

### Aggiungere un nuovo test

1. Crea il file `components/__tests__/<nome>.test.ts` (o `.test.tsx`).
2. **Non modificare `post-merge.sh`** — il gate usa un glob (`*.test.ts`) che include
   automaticamente ogni nuovo file nella directory.
3. Verifica che il tuo file compaia nell'elenco **"File di test rilevati"** che il gate
   stampa all'avvio. Se non compare, controlla l'estensione e il percorso del file.

### Convenzioni

- Il nome del file deve descrivere il componente e il tipo di test:
  `FloatingWidget.gesture.test.ts`, `MapReadyGate.test.ts`, ecc.
- Usa `vitest` + `react-test-renderer` per i test che montano componenti.
- Ogni test file deve essere autonomo: nessuna dipendenza da ordine di esecuzione
  con gli altri file della directory.

### Esecuzione locale

```bash
npx vitest run components/__tests__
```

---

## Variabili d'ambiente e segreti

- **Non committare mai** file `.env`, `.env.local` o qualsiasi file
  contenente credenziali reali.
- Usa le **Replit Secrets** per le variabili d'ambiente in sviluppo.
- In produzione, usa le variabili d'ambiente del deployment Replit.
- La baseline `.secrets.baseline` è l'unico file ammesso a contenere
  riferimenti (offuscati) a pattern di segreti — è progettata per questo.

---

## Aggiornare detect-secrets

```bash
pip install --upgrade detect-secrets

# Dopo l'aggiornamento, rigenera la baseline
detect-secrets scan > .secrets.baseline
detect-secrets audit .secrets.baseline
```
