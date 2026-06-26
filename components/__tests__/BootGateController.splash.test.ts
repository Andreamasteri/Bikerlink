/**
 * Regressione splash BootGate (Task #4979).
 *
 * Componente sotto test: components/boot-gate/BootGateController.tsx
 *
 * Bug target (finding review #6): nel percorso BootGate lo splash nativo non veniva
 * mai nascosto. `SplashScreen.hideAsync()` vive solo in useAppBootstrap, montato da
 * NormalRootLayout — che NON è montato finché il bisect non è completo. Risultato:
 * lo splash restava sopra la UI del BootGate rendendola inaccessibile.
 *
 * Il controller ora chiama hideAsync() al mount: questo test lo verifica montando
 * davvero il componente (react-test-renderer) con le dipendenze native mockate.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import * as React from "react";
import renderer from "react-test-renderer";

const mocks = vi.hoisted(() => ({
  hideAsync: vi.fn(() => Promise.resolve()),
}));

vi.mock("react-native", () => ({
  View: ({ children }: { children?: React.ReactNode }) =>
    React.createElement(React.Fragment, null, children ?? null),
  StyleSheet: { create: (s: unknown) => s, absoluteFill: {} },
}));

vi.mock("expo-splash-screen", () => ({
  hideAsync: mocks.hideAsync,
}));

vi.mock("expo-updates", () => ({ runtimeVersion: "test" }));

vi.mock("@/lib/query-client", () => ({
  initSessionToken: () => Promise.resolve(),
}));

vi.mock("@/lib/boot-gate-ping", () => ({
  pingBootGate: () => Promise.resolve(),
}));

vi.mock("@/components/boot-gate/BootGateProviderChain", () => ({
  BootGateProviderChain: () => null,
}));

vi.mock("@/components/boot-gate/BootGateScreen", () => ({
  BootGateScreen: () => null,
}));

import { BootGateController } from "@/components/boot-gate/BootGateController";

describe("BootGateController — splash", () => {
  beforeEach(() => {
    mocks.hideAsync.mockClear();
  });

  it("nasconde lo splash nativo al mount", () => {
    renderer.act(() => {
      renderer.create(
        React.createElement(BootGateController, {
          reportClientError: () => undefined,
          renderApp: () => null,
        }),
      );
    });
    expect(mocks.hideAsync).toHaveBeenCalledTimes(1);
  });
});
