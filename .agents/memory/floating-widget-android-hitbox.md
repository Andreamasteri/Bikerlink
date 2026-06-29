---
name: FloatingWidget Android hitbox — Reanimated vs RN Animated
description: Reanimated useSharedValue+useAnimatedStyle non aggiorna la hitbox touch su Android per widget con transform; fix = RN Animated.Value.
---

## La regola

Per componenti draggabili con `PanResponder` su Android, usare **React Native `Animated.Value`** (non Reanimated `useSharedValue`) per il posizionamento via `transform`.

## Why

Reanimated `useSharedValue` + `useAnimatedStyle` applicano il transform direttamente sul thread UI nativo (per performance), ma non aggiornano il sistema touch di React Native. La hitbox di hit-testing resta alla posizione di **layout** (es. `left:0, top:0`), non alla posizione visiva (es. bottom-right del widget).

Risultato: l'utente vede il pallino Bowie in basso a destra, ma il tap area è nell'angolo in alto a sinistra — il widget sembra non rispondere.

React Native `Animated.Value` con `transform` aggiorna invece la hitbox nativa in lockstep con la posizione visiva (documentato, comportamento garantito da RN su Android API 11+).

## How to apply

- `FloatingWidget.tsx`: usa `useRef(new Animated.Value(defaultX)).current` per posX/posY.
- Per leggere il valore corrente in modo sincrono: affianca un `useRef<number>` aggiornato ad ogni `setValue()`.
- Pattern: `posXAnim.setValue(v); posXRef.current = v;`
- Il resto del codice (PanResponder, clamping, AsyncStorage) rimane identico.
- **Non usare Reanimated per widget con PanResponder** — usare Reanimated solo per animazioni pure (spring, fade, ecc.) senza hitbox touch.
