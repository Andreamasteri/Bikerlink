---
name: latest-stable-versions
description: Policy operativa obbligatoria per usare sempre le ultime versioni stabili di pacchetti e software. Contiene il protocollo pre-aggiornamento in 4 fasi, le eccezioni hardcoded con motivazione, e il riferimento al post-install audit. Leggere PRIMA di ogni npm install, expo install, o aggiornamento software sul ThinkCentre.
---

# Latest Stable Versions — Policy Operativa

## Regola fondamentale

**Usare SEMPRE l'ultima versione stabile.** Le conoscenze di training sono obsolete di mesi — non scrivere mai un numero di versione da memoria senza averlo verificato live.

Questa policy vale per:
- Pacchetti npm / Expo SDK (BikerLink app + server)
- Software ThinkCentre: nginx, Node.js, PostgreSQL, GraphHopper, Valhalla, Ollama, Nominatim, Whisper
- Qualsiasi altro tool, libreria o dipendenza

---

## Protocollo pre-aggiornamento (OBBLIGATORIO)

Esegui queste 4 fasi **prima** di ogni install/upgrade. Non saltare nessuna fase.

---

### FASE 1 — Recupera la versione stabile corrente

**npm packages:**
```bash
# Versione latest pubblicata
npm view <pacchetto> version

# Oppure via URL registry
curl https://registry.npmjs.org/<pacchetto>/latest | jq .version

# Per pacchetti Expo — controlla il monorepo expo/expo su GitHub tag sdk-XX
```

**Software ThinkCentre:**
- nginx → https://nginx.org/en/download.html (stable branch)
- Node.js → https://nodejs.org/en/download/ (LTS)
- PostgreSQL → https://www.postgresql.org/download/
- GraphHopper → https://github.com/graphhopper/graphhopper/releases
- Valhalla → https://github.com/valhalla/valhalla/releases
- Ollama → https://github.com/ollama/ollama/releases
- Nominatim → https://github.com/osm-is/Nominatim/releases

**Regola:** Se non hai recuperato la versione da una fonte live in questa sessione, non puoi citarla come "attuale". Cercala prima.

---

### FASE 2 — Controlla GitHub Issues del pacchetto

Vai al repo GitHub ufficiale del pacchetto e cerca:

1. **Issues aperte** con label `bug`, `regression`, `breaking` nell'ultimo mese
2. **Issues chiuse di recente** che menzionano regressioni introdotte nell'ultima release
3. **Compatibilità con le dipendenze del progetto** — cerca i numeri di versione effettivi dell'Expo SDK e di React Native installati (leggili da `app.json` e `package.json` prima di cercare):
   - Expo SDK corrente (es. `expo sdk <X>`)
   - React Native corrente (es. `react-native <X.Y>`)
   - Eventuali altre dipendenze critiche del progetto (drizzle, tanstack-query, ecc.)

**Query di ricerca suggerite su GitHub** (sostituisci con le versioni effettive di Expo SDK e React Native installate nel progetto — leggi `app.json` per `sdkVersion` e `package.json` per `react-native`):
```
is:issue is:open expo sdk <SDK-corrente> <nome-pacchetto>
is:issue label:bug created:>YYYY-01-01 regression
is:issue react-native <RN-corrente> <nome-pacchetto>
```

**Esito atteso:** nessuna issue critica aperta → versione sicura.
Se ci sono issue bloccanti → valuta la versione precedente stabile e documenta il motivo.

---

### FASE 3 — Controlla forum e community

Cerca segnalazioni negli ultimi 30 giorni su:

| Fonte | URL / ricerca |
|-------|--------------|
| Expo Forums | https://forums.expo.dev — cerca `<nome-pacchetto>` |
| Reddit r/reactnative | reddit.com/r/reactnative — cerca `<nome-pacchetto>` |
| Stack Overflow | stackoverflow.com — tag `react-native` + `<nome-pacchetto>` |
| Discord Expo | discord.gg/expo — canale #help |

**Cosa cercare:**
- "broken after update to X.Y.Z"
- "crash on iOS/Android with version X"
- "incompatible with expo sdk 56"
- Workaround noti e se sono già stati fixati in una patch

---

### FASE 4 — Dichiara il risultato e procedi

Prima di scrivere il comando install, dichiara esplicitamente:

```
Versione stabile verificata: X.Y.Z (fonte: npm registry / GitHub releases)
Issues critiche trovate: nessuna / sì → [descrizione e link]
Compatibilità SDK 56: confermata / da verificare → [dettaglio]
Decisione: installo X.Y.Z / scendo a X.Y.W perché [motivo con fonte]
```

**Se si scende di versione rispetto alla stabile:** citare obbligatoriamente l'issue/thread che motiva la scelta. Senza fonte non si può giustificare una versione non-latest.

---

## Eccezioni hardcoded

Questi pacchetti hanno una versione fissa per motivi già verificati e documentati. **NON aggiornare senza autorizzazione esplicita dell'utente.**

### `react-native-keyboard-controller` — pinned `^1.22.1` (min 1.21.9)
- **Perché:** Kotlin 2.1.20 (Expo SDK 56 / compileSdk 36) richiede che `onConfigurationChanged` abbia un parametro `Configuration` non-nullable. Versioni < 1.21.9 dichiaravano `Configuration?` → errore `'onConfigurationChanged' overrides nothing` → build Android EAS fallisce.
- **In `expo.install.exclude`:** expo doctor EAS segnalava mismatch tra la versione attesa e quella installata → build annullata. L'exclude risolve.
- **API JS invariata:** `KeyboardProvider`, `KeyboardAwareScrollView`, `KeyboardAvoidingView` — nessuna migrazione richiesta.
- **Non tornare mai sotto 1.21.9.**

### `react-native-maps` — pinned `1.18.0` esatto
- **Perché:** È l'unica versione compatibile con Expo Go attualmente. Altre versioni causano crash immediati dell'app.
- **Nota aggiuntiva:** NON aggiungere `react-native-maps` ai `plugins` in `app.json` — causa crash.

### `expo-crypto` — pinned `~15.0.x`
- **Perché:** expo-crypto v55+ crasha in Expo Go. Restare sulla linea 15.0.x.
- **Alternativa per UUID:** usare `Date.now().toString() + Math.random().toString(36).substr(2, 9)` oppure `expo-crypto` 15.0.x.

---

## Dopo ogni install/aggiornamento — POST-AUDIT OBBLIGATORIO

Dopo ogni modifica a versioni di pacchetti npm (patch, minor o major), eseguire **sempre**:

```bash
npx tsx scripts/audit-package-updates.ts
```

Leggi il report in `.local/package-update-notes/YYYY-MM-DD.md` prima di:
- Fare deploy o OTA publish
- Modificare codice che usa i pacchetti aggiornati
- Segnalare un bug che potrebbe essere causato dall'aggiornamento

Vedi la skill `package-update-audit` (`.agents/skills/package-update-audit/SKILL.md`) per dettagli sull'interpretazione del report.

---

## Checklist rapida (da usare ogni volta)

```
□ Ho cercato la versione stabile corrente da una fonte live (npm/GitHub)?
□ Ho controllato GitHub Issues del pacchetto per compatibilità con SDK 56?
□ Ho controllato forum/community per segnalazioni negli ultimi 30 giorni?
□ Ho dichiarato esplicitamente la versione scelta e il motivo?
□ Se scendo di versione, ho citato la fonte che lo giustifica?
□ Il pacchetto è nella lista eccezioni hardcoded? → Se sì, non toccare senza ok utente.
□ Dopo l'install, ho schedulato il run di audit-package-updates.ts?
```

---

## Riferimento memoria persistente

La policy è anche documentata in `.agents/memory/latest-stable-versions-policy.md`.
