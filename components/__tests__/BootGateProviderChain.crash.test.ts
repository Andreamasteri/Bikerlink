/**
 * Test d'integrazione per BootGateProviderChain (Task #4979).
 *
 * Componente sotto test: components/boot-gate/BootGateProviderChain.tsx
 *   — la catena di provider incrementale del bisect del boot.
 *
 * Regressione target (finding review):
 *   Un provider che CRASHA in render NON deve mai essere riportato come montato
 *   con successo. La catena distingue due segnali:
 *     - SUCCESSO → la <MountSentinel> innermost fa partire `onLevelMounted(level)`
 *       SOLO se tutti i provider fino a `level` montano senza lanciare.
 *     - CRASH    → l'ErrorBoundary cattura l'errore e lo inoltra via `onError`,
 *       mentre la sentinella NON monta (quindi niente falso "passed").
 *
 * Strategia:
 *   Si monta la catena reale via react-test-renderer mockando SOLO RootProviders
 *   (per iniettare un layer che lancia) e le dipendenze del boundary che non
 *   girano in env node (ErrorFallback UI, crash-logger, sentry). L'ErrorBoundary
 *   reale resta sotto test: è proprio lui a dover catturare il crash.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import * as React from "react";
import renderer from "react-test-renderer";

const mocks = vi.hoisted(() => ({
  onError: vi.fn(),
  onLevelMounted: vi.fn(),
}));

// ── Mock: RootProviders — 2 layer sani + 1 che lancia in render ───────────────
vi.mock("@/components/RootProviders", () => {
  const Passthrough = ({ children }: { children?: React.ReactNode }) =>
    React.createElement(React.Fragment, null, children ?? null);
  const Throwing = () => {
    throw new Error("provider boom");
  };
  return {
    PROVIDER_LAYERS: [
      { id: "healthy_a", Component: Passthrough },
      { id: "healthy_b", Component: Passthrough },
      { id: "crashing_c", Component: Throwing },
    ],
    composeProviders: (
      layers: { Component: React.ComponentType<{ children?: React.ReactNode }> }[],
      children: React.ReactNode,
    ): React.ReactNode =>
      layers.reduceRight<React.ReactNode>(
        (acc, layer) => React.createElement(layer.Component, null, acc),
        children,
      ),
  };
});

// ── Mock: dipendenze del boundary non eseguibili in node ──────────────────────
// Il fallback UI userebbe useColors/safe-area; lo neutralizziamo a null così il
// re-render post-crash non fa esplodere il test renderer.
vi.mock("@/components/ErrorFallback", () => ({
  ErrorFallback: () => null,
}));
vi.mock("@/lib/crash-logger", () => ({
  markJsError: () => Promise.resolve(),
}));
vi.mock("@/lib/sentry", () => ({
  captureException: () => undefined,
  initSentry: () => undefined,
}));

import { BootGateProviderChain } from "@/components/boot-gate/BootGateProviderChain";

function mount(level: number): renderer.ReactTestRenderer {
  let comp!: renderer.ReactTestRenderer;
  renderer.act(() => {
    comp = renderer.create(
      React.createElement(BootGateProviderChain, {
        level,
        resetKey: 0,
        onError: mocks.onError,
        onLevelMounted: mocks.onLevelMounted,
      }),
    );
  });
  return comp;
}

describe("BootGateProviderChain — attribuzione mount/crash", () => {
  beforeEach(() => {
    mocks.onError.mockReset();
    mocks.onLevelMounted.mockReset();
  });

  it("conferma il mount (onLevelMounted) quando i provider montano senza crash", () => {
    // level=2 → solo i due layer sani: la sentinella monta e segnala il livello.
    mount(2);
    expect(mocks.onLevelMounted).toHaveBeenCalledWith(2);
    expect(mocks.onError).not.toHaveBeenCalled();
  });

  it("NON segnala successo e inoltra l'errore quando un provider crasha in render", () => {
    // level=3 → include il layer che lancia: l'ErrorBoundary cattura via onError
    // e la sentinella NON monta → nessun falso onLevelMounted(3).
    mount(3);
    expect(mocks.onError).toHaveBeenCalledTimes(1);
    const firstArg = mocks.onError.mock.calls[0]?.[0] as Error | undefined;
    expect(firstArg?.message).toBe("provider boom");
    const confirmedLevel3 = mocks.onLevelMounted.mock.calls.some(
      (call) => call[0] === 3,
    );
    expect(confirmedLevel3).toBe(false);
  });
});
