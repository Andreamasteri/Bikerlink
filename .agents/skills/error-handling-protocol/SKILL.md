---
name: error-handling-protocol
description: Protocollo obbligatorio per la gestione degli errori in BikerLink. Usare quando si incontra un errore di compilazione, runtime, typecheck, test, API, crash, warning bloccante, o fallimento silenzioso. Definisce la scheda strutturata da produrre e il flusso di comunicazione con l'utente prima di procedere alla risoluzione.
---

# Protocollo Gestione Errori — BikerLink

## Quando si applica

Questo protocollo è **sempre attivo** per:
- Errori di compilazione TypeScript / ESLint bloccante
- Errori runtime (crash app, eccezione non gestita)
- Fallimenti test / typecheck
- Errori API (4xx/5xx inaspettati)
- Crash backend o frontend
- Warning bloccanti (impediscono l'avanzamento del task)
- Fallimenti silenziosi (es. migrazione DB saltata senza eccezione, seed non eseguito)

**Non si applica a:**
- Errori di build EAS (APK) → seguono il protocollo in `replit.md § APK Build — Regola Obbligatoria`
- Errori OTA → seguono il protocollo in `replit.md § OTA`
- Warning non bloccanti (solo informativi) → riportare inline senza stop

---

## Procedura obbligatoria

### Step 1 — Produrre la scheda strutturata

Compilare **sempre** questa scheda quando si incontra un errore che rientra nelle categorie sopra:

```
🔴 TIPO DI ERRORE: <categoria leggibile>
📍 LOCALIZZAZIONE: <file + riga, oppure stack trace sintetico>
💬 SPIEGAZIONE: <cosa significa in termini concreti, senza gergo inutile>
🔎 CAUSA PROBABILE: <la ragione più plausibile>
```

### Step 2 — Chiedere all'utente

Dopo la scheda, porre questa domanda in modo conciso:

> **"Hai preferenze su come risolvere, o procedo in autonomia?"**

### Step 3 — Rispettare la risposta

| Risposta utente | Azione |
|---|---|
| Preferenza esplicita ("usa X", "non toccare Y", "prova prima Z") | Applicare la preferenza indicata |
| "Vai", "procedi", nessun vincolo | Procedere in full-auto come di consueto |

---

## Template scheda — esempi per categoria

### TypeScript type mismatch

```
🔴 TIPO DI ERRORE: TypeScript — tipo incompatibile
📍 LOCALIZZAZIONE: server/routes/auth.ts : riga 142
💬 SPIEGAZIONE: La funzione si aspetta un oggetto con il campo `userId` (stringa), ma riceve `undefined` perché la sessione potrebbe non essere ancora inizializzata.
🔎 CAUSA PROBABILE: Il middleware di autenticazione non è applicato prima di questa route, oppure il tipo della sessione non include `userId` nella definizione.
```

### DB migration failure

```
🔴 TIPO DI ERRORE: Database — migrazione fallita
📍 LOCALIZZAZIONE: server/index.ts : Phase 2 (drizzle migrate)
💬 SPIEGAZIONE: La migrazione non è stata eseguita — la colonna `max_tilt_deg` non esiste nella tabella `routes` in questo ambiente.
🔎 CAUSA PROBABILE: Il file di migrazione è stato aggiunto dopo l'ultimo deploy, oppure `drizzle-kit push` non è stato eseguito sull'ambiente di produzione.
```

### API 500

```
🔴 TIPO DI ERRORE: API — errore server 500
📍 LOCALIZZAZIONE: GET /api/users/me — stack: TypeError: Cannot read properties of null (reading 'id') at getUserProfile (server/routes/users.ts:88)
💬 SPIEGAZIONE: Il backend ha provato a leggere l'ID utente da un oggetto che è `null` — probabilmente l'utente non esiste nel DB o la sessione è scaduta.
🔎 CAUSA PROBABILE: Query DB restituisce `null` invece di lanciare un'eccezione; manca un controllo di esistenza prima dell'accesso alla proprietà.
```

### Crash runtime (React Native)

```
🔴 TIPO DI ERRORE: Crash runtime — React Native
📍 LOCALIZZAZIONE: app/(tabs)/tracking.tsx : riga 312 — TypeError: undefined is not an object (evaluating 'location.coords.latitude')
💬 SPIEGAZIONE: L'app ha provato ad accedere alle coordinate GPS prima che il permesso di posizione fosse concesso o prima che il primo fix GPS fosse disponibile.
🔎 CAUSA PROBABILE: La variabile `location` è `undefined` nei primi istanti dopo l'avvio del tracking; manca una guardia `if (location)` o un valore di default.
```

### ESLint bloccante

```
🔴 TIPO DI ERRORE: ESLint — errore bloccante (no-unused-vars / react-hooks/exhaustive-deps)
📍 LOCALIZZAZIONE: components/FavoriteStar.tsx : riga 47
💬 SPIEGAZIONE: La dipendenza `userId` è usata dentro `useEffect` ma non è dichiarata nell'array delle dipendenze. React potrebbe usare un valore stale (vecchio) in alcuni scenari.
🔎 CAUSA PROBABILE: Array dipendenze incompleto — aggiungere `userId` risolve il warning e la potenziale inconsistenza.
```

### Fallimento silenzioso (migrazione saltata)

```
🔴 TIPO DI ERRORE: Fallimento silenzioso — seed / migrazione non eseguita
📍 LOCALIZZAZIONE: server/index.ts : Phase 3 (seed utenti)
💬 SPIEGAZIONE: Lo script seed non ha lanciato eccezioni ma non ha creato gli utenti attesi. La tabella risulta vuota.
🔎 CAUSA PROBABILE: La condizione di idempotenza nel seed controlla un campo che è già presente (es. email già esistente da un seed precedente parziale), causando lo skip silenzioso di tutti i record.
```

---

## Note operative

- La scheda va prodotta **prima** di qualsiasi tentativo di fix — non a posteriori.
- Se l'errore ha più cause possibili, elencarle sotto `🔎 CAUSA PROBABILE` come lista numerata (max 3).
- Se la localizzazione non è disponibile (es. errore di rete senza stack), indicare `N/D` e descrivere il contesto nel campo SPIEGAZIONE.
- Il tono della domanda all'utente deve essere breve e diretto — non tecnico. Evitare di elencare opzioni di fix nella domanda stessa: aspettare la risposta dell'utente prima.
