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

### Test fixture e credenziali placeholder

Quando aggiungi file di test (o qualsiasi file non di produzione) che contengono
**credenziali fittizie** — ad esempio:

```ts
// Esempi tipici che attivano il gate:
const TEST_API_KEY = "sk-test-abc123def456";          // pragma: allowlist secret
const DB_URL = "postgres://test:test@localhost/testdb"; // pragma: allowlist secret
const CF_TOKEN = "0123456789abcdef0123456789abcdef";   // pragma: allowlist secret
```

…il gate **bloccherà** il commit perché non riesce a distinguere placeholder da
segreti reali senza context.

#### Scelta rapida: pragma inline (preferito per i test)

Aggiungi `# pragma: allowlist secret` **sulla stessa riga** del valore rilevato:

```ts
const TEST_API_KEY = "sk-test-abc123def456"; // pragma: allowlist secret
const DB_URL = "postgres://test:test@localhost/testdb"; // pragma: allowlist secret
```

Il commento funziona in qualsiasi linguaggio che usi `#` o `//` come commento
singola riga. Dopo averlo aggiunto, il gate lo salta senza toccare la baseline.

> **Regola pratica:** preferisci il pragma per i valori nelle test suite — è
> auto-documentante ("questo è intenzionalmente finto") e non richiede di
> rigenerare e committare la baseline ogni volta.

### Falsi positivi (fuori dai test)

Se il gate blocca un commit per un valore che **non è un segreto reale** e
il pragma inline non è pratico, hai due opzioni:

#### Opzione 1 — Rigenera la baseline (raccomandato per file non-test)

```bash
# Rigenera la baseline includendo tutti i file tracciati
detect-secrets scan --no-verify > .secrets.baseline

# Apri l'audit interattivo e marca ogni falso positivo
detect-secrets audit .secrets.baseline
# → scegli 'n' (not a secret) per i valori che sai essere fittizi

# Committa la baseline aggiornata insieme ai tuoi file
git add .secrets.baseline
git commit -m "chore: aggiorna baseline detect-secrets"
```

> **Nota:** usa sempre `--no-verify` nella scansione — senza questo flag
> `detect-secrets` tenta di verificare i segreti online e può bloccarsi o
> restituire risultati inaffidabili.

#### Opzione 2 — Bypass una-tantum (solo emergenze)

```bash
git commit --no-verify -m "..."
```

> **Usa `--no-verify` solo se sei assolutamente certo che non ci siano
> segreti reali.** Ogni utilizzo dovrebbe essere documentato nel messaggio
> di commit.

#### Perché il gate è fallito in passato

In precedenza il gate ha bloccato CI con ~28 falsi positivi perché file di test
aggiunti in un unico batch contenevano URL postgres di test, token CF mock e
chiavi API placeholder **senza pragma né aggiornamento della baseline**. Il risultato
è che ogni file diventava un bloccante in CI. Per evitare che si ripeta:

1. **Prima di committare un nuovo file di test**, esegui localmente:
   ```bash
   bash scripts/ci-secrets-scan.sh
   ```
2. Se escono rilevamenti, aggiungi `# pragma: allowlist secret` sulle righe
   incriminate **oppure** rigenera la baseline con `--no-verify`.
3. Committa la baseline aggiornata nello stesso PR del file di test.

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

### Render test obbligatori per le card admin ThinkCentre

Ogni componente sotto `components/admin/` che interroga un endpoint
`/api/admin/thinkcentre-*` (tramite `fetch` o `useQuery`) **deve** avere un
file `components/__tests__/<NomeComponente>.render.test.ts`.

**Perché:** Task #437 ha dimostrato che un cambio di shape del payload del
ThinkCentre agent (nested vs flat) causava un `TypeError` a runtime senza
nessun segnale automatico. Il render test cattura questo tipo di regressione
prima che l'APK venga distribuito.

**Struttura minima richiesta per ogni test:**

1. Payload flat/online valido — il componente monta ed espande senza eccezioni.
2. Payload offline — il banner offline è visibile, nessuna sezione dati appare.
3. Payload malformed (es. `online: true` ma campo chiave mancante) — nessun
   `TypeError`, il componente degrada gracefully.

Usa `components/__tests__/ThinkCentreEfficiencyCard.render.test.ts` come
riferimento per la struttura di mock (react-native, @expo/vector-icons,
@tanstack/react-query, @/constants/colors, @/lib/query-client).

**Gate automatico:** il check `scripts/check-tc-admin-card-tests.sh` verifica
che ogni nuovo componente TC abbia il test corrispondente. Gira in CI e in
`scripts/post-merge.sh`. Se un file usa `/api/admin/thinkcentre-*` solo per
`invalidateQueries` senza mai montare un componente dipendente dal payload,
aggiungi il commento `// check-tc-admin-card-tests: invalidate-only` nel file
per escluderlo dal gate.

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
detect-secrets scan --no-verify > .secrets.baseline
detect-secrets audit .secrets.baseline
git add .secrets.baseline
```
