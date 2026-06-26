// Task #4979 — catena di provider incrementale per il bisect del boot.
//
// Monta SOLO i primi `level` provider di PROVIDER_LAYERS (stessa identica lista e
// ordine usati da RootProviders). Aggiungendo un layer più interno alla volta, gli
// elementi esterni mantengono identità stabile e NON vengono rimontati: solo il
// nuovo provider innermost monta → un eventuale crash è attribuibile esattamente a
// quel provider.
//
// VERIDICITÀ DEL BISECT (fix review): un provider che crasha in render NON deve
// essere riportato come "passed". Due segnali distinti garantiscono l'attribuzione:
//
//  1. SUCCESSO → <MountSentinel> è l'elemento PIÙ INTERNO della catena: il suo
//     effetto `onLevelMounted(level)` parte SOLO se tutti i provider fino a `level`
//     sono montati senza lanciare. Se un provider lancia in render, la sentinella
//     non monta mai e l'effetto non parte → niente falso "passed".
//
//  2. CRASH → l'ErrorBoundary cattura l'errore di render del nuovo provider e lo
//     inoltra al controller via `onError`, che marca lo step corrente come
//     "stopped". La `key={resetKey}` ri-monta un boundary pulito ad ogni
//     "Ricomincia", così un crash precedente non resta bloccato in stato error.
//
// I children restano impliciti (solo la sentinella) durante lo stepping: i provider
// girano comunque i loro effetti di init, mentre la UI visibile è la BootGateScreen
// provider-free montata come fratello sopra questa catena.
import React, { useEffect } from "react";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { PROVIDER_LAYERS, composeProviders } from "@/components/RootProviders";

interface BootGateProviderChainProps {
  level: number;
  resetKey: number;
  onError: (error: Error, componentStack: string) => void;
  onLevelMounted: (level: number) => void;
}

// Sentinella di mount: montata come figlio innermost della catena composta. Il suo
// effetto parte solo a mount riuscito di TUTTI i provider che la avvolgono.
function MountSentinel({
  level,
  onMounted,
}: {
  level: number;
  onMounted: (l: number) => void;
}) {
  useEffect(() => {
    onMounted(level);
  }, [level, onMounted]);
  return null;
}

export function BootGateProviderChain({
  level,
  resetKey,
  onError,
  onLevelMounted,
}: BootGateProviderChainProps) {
  const n = Math.max(0, Math.min(level, PROVIDER_LAYERS.length));
  const layers = PROVIDER_LAYERS.slice(0, n);
  return (
    <ErrorBoundary key={resetKey} onError={onError}>
      {composeProviders(
        layers,
        <MountSentinel level={level} onMounted={onLevelMounted} />,
      )}
    </ErrorBoundary>
  );
}
