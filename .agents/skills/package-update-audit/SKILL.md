---
name: package-update-audit
description: Recupera changelog, bugfix e breaking changes dai repository GitHub ufficiali dopo ogni aggiornamento di pacchetti npm. Da usare OBBLIGATORIAMENTE dopo qualsiasi npm/expo install che modifica versioni (patch, minor, major). Istruzioni per run automatico e interpretazione del report.
---

# Package Update Audit Skill

## Quando usarla (OBBLIGATORIO)

Eseguire `scripts/audit-package-updates.ts` **ogni volta** che vengono aggiornate versioni di pacchetti npm, indipendentemente dal tipo di bump:

| Tipo bump | Rischio breaking | Priorità audit |
|-----------|-----------------|---------------|
| patch (0.0.x) | Basso | Obbligatorio — conferma fix applicati |
| minor (0.x.0) | Medio | Obbligatorio — nuove API, deprecazioni |
| major (x.0.0) | Alto | Obbligatorio — leggere BREAKING prima di merge |

Questo evita debug a vuoto causato da opzioni rinominate, parametri rimossi, comportamenti cambiati silenziosamente.

## Come eseguire

### Auto-detect (default — legge il diff HEAD~1..HEAD di package.json)
```bash
npx tsx scripts/audit-package-updates.ts
```

### Range di commit personalizzato
```bash
npx tsx scripts/audit-package-updates.ts --from HEAD~3 --to HEAD
```

### Lista manuale (utile se package.json non è ancora committato)
```bash
npx tsx scripts/audit-package-updates.ts --packages "expo@56.0.8>56.0.9,expo-router@56.2.8>56.2.9"
```

### Via workflow Replit
Avvia il workflow **"Audit Package Updates"** dal pannello workflow.

## Output

Il report viene salvato in `.local/package-update-notes/YYYY-MM-DD.md`.

**Leggi sempre il report prima di:**
- Fare deploy/OTA publish
- Modificare codice che usa i pacchetti aggiornati
- Segnalare un bug che potrebbe essere introdotto dall'aggiornamento

## Interpretazione del report

| Indicatore | Significato | Azione |
|-----------|------------|--------|
| `⚠️ BREAKING` | Breaking change confermato nel CHANGELOG | Leggi attentamente, aggiorna il codice se necessario |
| `🔧 fix` | Bugfix patch — probabilmente migliora stabilità | Nessuna azione immediata richiesta |
| `nessuna entry` | Versione non trovata nel CHANGELOG | Controlla GitHub Releases manualmente |
| `repo non nel registry` | Pacchetto senza mapping GitHub | Aggiungi il mapping in `getRepoInfo()` nel script |

## Exit codes

| Codice | Significato |
|--------|------------|
| 0 | OK — nessun breaking change |
| 1 | Errore fatale nello script |
| 2 | Warning — breaking changes rilevati (non blocca, ma richiede revisione) |

## Aggiungere un nuovo pacchetto al registry

Se compare `repo non nel registry`, aggiungere il mapping in `scripts/audit-package-updates.ts` nella funzione `getRepoInfo()`:

```typescript
if (pkgName === "nome-pacchetto") {
  return {
    owner: "github-org",
    repo: "github-repo",
    changelogPath: "CHANGELOG.md", // path nel repo
    ref: "main",                   // branch
  };
}
```

## Archivio note

I report sono cumulativi in `.local/package-update-notes/`. Consultarli quando:
- Si sospetta una regressione introdotta da un aggiornamento
- Si vuole sapere quali fix sono già inclusi
- Si fa troubleshooting di un comportamento inaspettato dopo un update

## Aggiornamento del registry

Il registry `getRepoInfo()` copre:
- Tutti i pacchetti `expo-*` (monorepo expo/expo)
- `react-native`, `react`
- `@tanstack/react-query` family
- `drizzle-orm`, `drizzle-kit`
- `express`, `zod`, `typescript`, `bullmq`
- `@ai-sdk/*` (Vercel AI SDK)
- `@react-native-community/*`
- `react-native-reanimated`
- `@sentry/node`, `@sentry/react-native`

Per altri pacchetti, aggiungi il caso in `getRepoInfo()` e committalo.
