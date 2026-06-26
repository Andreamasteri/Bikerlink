---
name: Latest stable versions policy
description: Regola operativa obbligatoria — usare sempre l'ultima versione stabile con audit pre-aggiornamento in 4 fasi; eccezioni hardcoded documentate con motivazione.
---

## Regola

Prima di ogni `npm install`, `expo install`, o aggiornamento di qualsiasi pacchetto/libreria/software, **recuperare attivamente la versione stabile corrente** — mai fidarsi delle conoscenze di training che sono datate di mesi.

**Why:** Proporre versioni obsolete causa regressioni, deprecazioni silenti, breaking API, incompatibilità native. L'utente ha richiesto esplicitamente che l'agente usi SEMPRE le ultime versioni stabili, sia per BikerLink (npm, Expo) che per il ThinkCentre (nginx, Node, Postgres, GraphHopper, Valhalla, Ollama, ecc.).

## Protocollo pre-aggiornamento (4 fasi OBBLIGATORIE)

### Fase 1 — Recupera la versione stabile corrente
- npm: `npm view <pacchetto> version` oppure `https://registry.npmjs.org/<pacchetto>/latest`
- GitHub: controlla i tag/releases ufficiali del repo
- Software ThinkCentre: release page ufficiale del progetto (es. nginx.org, nodejs.org, postgresql.org)
- **Non scrivere mai una versione da memoria senza averla verificata live**

### Fase 2 — Controlla GitHub Issues del pacchetto
Cerca issues aperte e chiuse relative a:
- Compatibilità con la versione di React Native / Expo SDK in uso nel progetto (attualmente SDK 56)
- Regressioni note nell'ultima release
- Issues etichettati `bug`, `regression`, `breaking` nell'ultimo mese
- Stringa di ricerca suggerita: `is:issue expo sdk 56 OR react-native 0.76 <nome-pacchetto>`

### Fase 3 — Controlla forum e community
- Expo Forums (forums.expo.dev) — thread recenti sul pacchetto
- Reddit r/reactnative — post negli ultimi 30 giorni
- Stack Overflow — domande recenti con la tag del pacchetto
- Discord ufficiale Expo / React Native community
- Se nessuna segnalazione negativa → versione sicura

### Fase 4 — Dichiara esplicitamente il risultato
Prima di procedere all'install, dichiarare:
- La versione stabile verificata
- Eventuali vincoli di compatibilità trovati
- Se si scende di versione rispetto alla stabile, **motivare esplicitamente** citando la fonte (issue #N, thread URL, ecc.)
- Solo dopo questo audit si può giustificare l'uso di una versione non-latest

## Eccezioni hardcoded

Questi pacchetti hanno una versione fissa per motivi verificati — NON aggiornare senza autorizzazione esplicita dell'utente:

| Pacchetto | Versione pinned | Motivazione |
|-----------|----------------|-------------|
| `react-native-keyboard-controller` | `^1.21.11` (min 1.21.9) | Kotlin 2.1.20 (Expo SDK 56 / compileSdk 36) richiede `onConfigurationChanged` non-nullable. Versioni < 1.21.9 → build Android EAS fallisce. È in `expo.install.exclude`. |
| `react-native-maps` | `1.18.0` esatto | Unica versione compatibile con Expo Go attualmente; altre versioni crashano l'app. NON aggiungere ai plugins in app.json. |
| `expo-crypto` | `~15.0.x` | expo-crypto v55+ crasha in Expo Go; usare la versione 15.0.x. |

## Dopo ogni install/aggiornamento

Eseguire **obbligatoriamente** la skill `package-update-audit`:
```bash
npx tsx scripts/audit-package-updates.ts
```
Vedere `.agents/skills/package-update-audit/SKILL.md` per i dettagli.

## Riferimento skill operativa

La checklist completa step-by-step è in `.agents/skills/latest-stable-versions/SKILL.md`.

**How to apply:**
- Ogni volta che si deve installare o aggiornare un pacchetto → eseguire il protocollo 4 fasi prima di scrivere il comando install
- Quando si scrive un numero di versione in qualsiasi file (package.json, app.json, Dockerfile, nginx config, ecc.) → verificarlo live prima
- Quando si cita "la versione attuale è X" in una risposta → verificarlo, non scriverlo da memoria
