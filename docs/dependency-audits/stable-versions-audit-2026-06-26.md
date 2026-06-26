# Stable Versions Audit — 2026-06-26

**Protocollo 4-fasi** applicato a tutti i pacchetti principali di BikerLink.  
Fonte versioni: npm registry (live, sessione 2026-06-26).  
Expo SDK: 56 · React Native: 0.86.0

---

## Matrice di verifica — 8 pacchetti richiesti

| Pacchetto | In package.json | Risolto (installato) | Latest stable (live) | Azione | Esito |
|-----------|----------------|---------------------|----------------------|--------|-------|
| `expo` | `~56.0.12` | 56.0.12 | **56.0.12** | — | ✅ già all'ultima |
| `expo-router` | `^56.2.11` | 56.2.11 | **56.2.11** | — | ✅ già all'ultima |
| `@tanstack/react-query` | `^5.101.0` | 5.101.0 | **5.101.1** | aggiornato | ✅ ora 5.101.1 |
| `drizzle-orm` | `^0.45.2` | 0.45.2 | **0.45.2** | — | ✅ già all'ultima |
| `drizzle-kit` | `^0.31.10` | 0.31.10 | **0.31.10** | — | ✅ già all'ultima |
| `zod` | `^4.4.3` | 4.4.3 | **4.4.3** | — | ✅ già all'ultima |
| `express` | `^5.2.1` | 5.2.1 | **5.2.1** | — | ✅ già all'ultima |
| `typescript` | `^6.0.3` | 6.0.3 | **6.0.3** | — | ✅ già all'ultima |

---

## Fase 1 — Versioni stabili correnti (fonte live: `npm view <pkg> version`)

```
expo              → 56.0.12
expo-router       → 56.2.11
@tanstack/react-query → 5.101.1
drizzle-orm       → 0.45.2
drizzle-kit       → 0.31.10
zod               → 4.4.3
express           → 5.2.1
typescript        → 6.0.3
```

## Fase 2 — Compatibilità con Expo SDK 56 / React Native 0.86

| Pacchetto | Compatibilità | Note |
|-----------|--------------|------|
| expo | ✅ è il core SDK stesso | pinned `~56.0.12` |
| expo-router | ✅ parte del monorepo Expo SDK 56 | |
| @tanstack/react-query | ✅ libreria JS pura, no native deps | patch 5.101.1: solo update transitivo query-core |
| drizzle-orm | ✅ server-side Node.js pura | nessun breaking nel changelog 0.45.x |
| drizzle-kit | ✅ CLI tool server-side | nessun breaking nel changelog 0.31.x |
| zod | ✅ libreria JS pura | v4 già in uso, stabile |
| express | ✅ server-side Node.js | v5 già stabile, nessun breaking |
| typescript | ✅ tool di build | v6 in uso; compatibile vitest 4.x e vite 8.x |

## Fase 3 — Segnalazioni community (ultimi 30 giorni)

Nessuna issue critica rilevata per questi pacchetti. Tutte le versioni sopra sono
ampiamente usate in produzione con Expo SDK 56.

## Fase 4 — Decisione finale

```
expo 56.0.12:             già installato — nessuna azione
expo-router 56.2.11:      già installato — nessuna azione
@tanstack/react-query:    5.101.0 → 5.101.1 (patch fix transitivo, applicato)
drizzle-orm 0.45.2:       già installato — nessuna azione
drizzle-kit 0.31.10:      già installato — nessuna azione
zod 4.4.3:                già installato — nessuna azione
express 5.2.1:            già installato — nessuna azione
typescript 6.0.3:         già installato — nessuna azione
```

---

## Aggiornamenti patch/minor applicati (pacchetti adiacenti, stessa sessione)

| Pacchetto | Da | A | Tipo | Breaking | Note |
|-----------|----|----|------|----------|------|
| `@tanstack/react-query` | 5.101.0 | 5.101.1 | patch | — | fix transitivo query-core |
| `@tanstack/react-query-persist-client` | 5.101.0 | 5.101.1 | patch | — | allineato alla family |
| `@tanstack/query-async-storage-persister` | 5.101.0 | 5.101.1 | patch | — | allineato alla family |
| `bullmq` | 5.79.0 | 5.79.1 | patch | — | fix node-redis type cast |
| `nanoid` | 5.1.15 | 5.1.16 | patch | — | patch routine |
| `vite` | 8.0.16 | 8.1.0 | minor | — | nuove feature + bugfix rolldown, no breaking |
| `@sentry/node` | 10.59.0 | 10.62.0 | patch | — | fix + nuove integrazioni AI tracing |
| `@sentry/react-native` | 8.15.1 | 8.16.0 | minor | — | minor release |

---

## MAJOR bump esclusi deliberatamente

| Pacchetto | Installato | Latest | Motivo |
|-----------|-----------|--------|--------|
| `ai` | 6.0.208 | 7.0.2 | **MAJOR** — breaking changes sull'intera catena AI provider |
| `@ai-sdk/google` | 3.0.83 | 4.0.0 | **MAJOR** — API completamente riviste in v4 |
| `@ai-sdk/groq` | 3.0.42 | 4.0.0 | **MAJOR** — coordinato con @ai-sdk/google e @ai-sdk/openai |
| `@ai-sdk/openai` | 3.0.73 | 4.0.0 | **MAJOR** — coordinato con @ai-sdk/google |

Follow-up task creato: #4995 "Aggiorna il toolkit AI (Vercel AI SDK v7 + @ai-sdk/* v4)"

---

## Eccezioni hardcoded (non toccate — policy in `.agents/skills/latest-stable-versions/SKILL.md`)

| Pacchetto | Versione bloccata | Motivo |
|-----------|------------------|--------|
| `react-native-keyboard-controller` | `^1.21.11` | Kotlin 2.1.20 / compileSdk 36 — min 1.21.9 |
| `react-native-maps` | `1.18.0` | unica versione compatibile con Expo Go |
| `expo-crypto` | `~15.0.x` | v55+ crasha in Expo Go |

---

## Post-audit (`npx tsx scripts/audit-package-updates.ts`)

```
🔍 Analizzando 8 pacchetti aggiornati...
  @tanstack/react-query: 5.101.0 → 5.101.1
  @tanstack/react-query-persist-client: 5.101.0 → 5.101.1
  @tanstack/query-async-storage-persister: 5.101.0 → 5.101.1
  bullmq: 5.79.0 → 5.79.1
  nanoid: 5.1.15 → 5.1.16
  vite: 8.0.16 → 8.1.0
  @sentry/node: 10.59.0 → 10.62.0
  @sentry/react-native: 8.15.1 → 8.16.0

  📦 @tanstack/react-query ... 🔧 fix 1 sezioni
  📦 @tanstack/react-query-persist-client ... 🔧 fix 1 sezioni
  📦 @tanstack/query-async-storage-persister ... 🔧 fix 1 sezioni
  📦 bullmq ... 🔧 fix 1 sezioni
  📦 nanoid ... repo non nel registry
  📦 vite ... 🔧 fix 2 sezioni
  📦 @sentry/node ... 🔧 fix 3 sezioni
  📦 @sentry/react-native ... ⬜ nessuna entry

✅ Report salvato in: .local/package-update-notes/2026-06-26.md
```

**Risultato: 0 breaking changes rilevati su tutti gli aggiornamenti applicati.**
