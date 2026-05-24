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

Ad ogni `git commit`, il hook:

1. Scansiona i file in staging alla ricerca di pattern riconducibili a segreti.
2. Confronta il risultato con la baseline approvata (`.secrets.baseline`).
3. Blocca il commit se vengono trovati nuovi segreti non in baseline.

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
