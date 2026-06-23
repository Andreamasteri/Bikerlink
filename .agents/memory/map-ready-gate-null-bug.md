---
name: MapReadyGate null = Stack smontata = not-found loop
description: Quando MapReadyGate (o qualsiasi gate nel root layout) restituisce null senza renderizzare i children, la Stack di Expo Router viene smontata. Expo Router naviga su +not-found e NON torna automaticamente alla route corretta quando la Stack rimonta.
---

## Regola

MapReadyGate (e qualsiasi gate nel root layout) NON deve mai restituire null o un loader senza includere i children nel render. La Stack di navigazione deve essere SEMPRE montata.

**Why:** Expo Router risolve le route in base allo stato di navigazione corrente. Se la Stack viene smontata (children non renderizzati), Expo Router non può renderizzare la route "/" e naviga a `+not-found`. Quando la Stack rimonta dopo il timeout, Expo Router resta sul route `+not-found` (che è una route valida) invece di tornare a "/". L'utente è bloccato permanentemente su not-found.

**How to apply:**
- Usa `pointerEvents="box-only"` su un overlay opaco posizionato sopra i children (StyleSheet.absoluteFill) invece di condizionare il render dei children
- Mantieni sempre `{children}` nel JSX anche quando stai "bloccando" la UI
- Applica lo stesso pattern a StartupGate se mai cambierà il suo comportamento

## Fix applicato

```tsx
// PRIMA (sbagliato): Stack smontata durante loading
if (user && isLoading && !forcePass) {
  return <View><ActivityIndicator /></View>; // ← children NON renderizzati
}
return <>{children}</>;

// DOPO (corretto): Stack sempre montata
return (
  <View style={styles.container}>
    {children}
    {showOverlay && (
      <View style={styles.overlay} pointerEvents="box-only">
        <ActivityIndicator />
      </View>
    )}
  </View>
);
```

## Safety net aggiuntivo

`app/+not-found.tsx` usa `useAuth()` per redirect automatico:
- Utente autenticato → `router.replace("/(tabs)")` immediato
- Utente non autenticato → `router.replace("/")` dopo 2 secondi

Questo rompe il loop anche se il gate si comporta male in futuro.
