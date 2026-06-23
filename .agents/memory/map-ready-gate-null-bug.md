---
name: MapReadyGate null = Stack smontata = not-found loop
description: Quando MapReadyGate (o qualsiasi gate nel root layout) restituisce null senza renderizzare i children, la Stack di Expo Router viene smontata. Expo Router naviga su +not-found e NON torna automaticamente alla route corretta quando la Stack rimonta.
---

## Regola

MapReadyGate (e qualsiasi gate nel root layout) NON deve mai restituire null o un loader senza includere i children nel render. La Stack di navigazione deve essere SEMPRE montata.

**Soluzione definitiva adottata (più pulita dell'overlay):** il gate è **pass-through immediato** — `return <>{children}</>`. map-context ha già default sicuri (tile di fallback) quindi l'app è usabile mentre le 3 query di config mappe si risolvono in background. NIENTE overlay bloccante, NIENTE forcePass/timeout che resetta a ogni cambio dependency. Si mantengono solo i beacon di monitoring (enter/loading/pass/timeout + map_ready_gate_unblock_reason). Il sintomo originale extra: dopo il grant del permesso posizione lo spinner full-screen restava bloccato perché il timeout di sicurezza si azzerava a ogni dependency change.

**Why:** Expo Router risolve le route in base allo stato di navigazione corrente. Se la Stack viene smontata (children non renderizzati), Expo Router non può renderizzare la route "/" e naviga a `+not-found`. Quando la Stack rimonta dopo il timeout, Expo Router resta sul route `+not-found` (che è una route valida) invece di tornare a "/". L'utente è bloccato permanentemente su not-found.

**Test gate:** components/__tests__/MapReadyGate.test.ts DEVE testare il contratto pass-through (children sempre montati, loaderRendered()===false anche durante loading); è nel gate bloccante post-merge `npx vitest run components/__tests__`. Se si rimette un overlay i test vanno aggiornati o il post-merge fallisce.

**How to apply:**
- Il gate NON deve condizionare il render dei children né introdurre un wrapper bloccante (overlay/View) sopra di essi: deve restare `return <>{children}</>`.
- Se servisse davvero un indicatore di caricamento, NON usarlo come gate (non smontare/coprire i children); preferisci uno stato degradato con i default sicuri di map-context.
- Applica lo stesso principio a StartupGate se mai cambierà il suo comportamento.

## Fix applicato (definitivo: pass-through)

```tsx
// SBAGLIATO (storia): Stack smontata o coperta durante loading
if (user && isLoading) {
  return <View><ActivityIndicator /></View>; // ← children NON renderizzati / bloccati
}

// CORRETTO: pass-through immediato, Stack sempre montata e interattiva
return <>{children}</>;
// (i beacon enter/loading/pass/timeout + map_ready_gate_unblock_reason
//  restano solo come monitoring e non cambiano mai il render)
```

## Safety net aggiuntivo

`app/+not-found.tsx` usa `useAuth()` per redirect automatico:
- Utente autenticato → `router.replace("/(tabs)")` immediato
- Utente non autenticato → `router.replace("/")` dopo 2 secondi

Questo rompe il loop anche se il gate si comporta male in futuro.
