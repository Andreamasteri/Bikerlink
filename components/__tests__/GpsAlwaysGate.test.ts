/**
 * Test di mount per GpsAlwaysGate.
 *
 * GpsAlwaysGate è il gate che blocca l'accesso alle tab in assenza del permesso
 * posizione "Sempre" (background). È un flusso critico per onboarding e tracking
 * in background.
 *
 * Logica del gate:
 *   !isAuthenticated                           → null (nessun gate)
 *   !backgroundPermissionChecked               → null (attesa iniziale)
 *   hasBackgroundPermission                    → null (permesso già ok)
 *   !dismissed                                 → <AlwaysPermissionNotice>
 *   dismissed && backgroundPermissionRevoked   → <BackgroundRevocationBanner>
 *   dismissed && !backgroundPermissionRevoked  → null
 *
 * Strategia: montaggio con react-test-renderer (React reale in Node).
 * Dipendenze native e di contesto tutte mockate.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import TestRenderer, { act } from "react-test-renderer";

// ── mock: react-native ────────────────────────────────────────────────────────
vi.mock("react-native", () => ({
  View: "View",
  Text: "Text",
  StyleSheet: { create: (s: Record<string, unknown>) => s },
  useEffect: React.useEffect,
}));

// ── mock: safe-area ───────────────────────────────────────────────────────────
vi.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

// ── mock: AlwaysPermissionNotice ──────────────────────────────────────────────
// Sostituito con un simbolo stringa per poterlo trovare via findAllByType.
vi.mock("@/components/AlwaysPermissionNotice", () => ({
  default: "AlwaysPermissionNotice",
}));

// ── mock: theme-context ───────────────────────────────────────────────────────
vi.mock("@/lib/theme-context", () => ({
  useTheme: () => ({ colors: { accent: "#E53935", text: "#fff" } }),
}));

// ── mock: background-location-task ───────────────────────────────────────────
vi.mock("@/lib/background-location-task", () => ({
  stopBackgroundLocationTask: vi.fn().mockResolvedValue(undefined),
}));

// ── mock: location-context (useLocationGate) — configurabile per test ─────────
const locationState = vi.hoisted(() => ({
  hasBackgroundPermission: false,
  backgroundPermissionChecked: true,
  backgroundPermissionRevoked: false,
}));

vi.mock("@/lib/location-context", () => ({
  useLocationGate: () => locationState,
}));

// ── import del componente (dopo i mock) ──────────────────────────────────────
import { GpsAlwaysGate } from "@/components/GpsAlwaysGate";

// ── helpers ───────────────────────────────────────────────────────────────────

let renderer: TestRenderer.ReactTestRenderer | null = null;

async function mount(props: { isAuthenticated: boolean }) {
  await act(async () => {
    renderer = TestRenderer.create(
      React.createElement(GpsAlwaysGate, props),
    );
  });
}

function noticeRendered(): boolean {
  return (
    renderer!.root.findAllByType(
      "AlwaysPermissionNotice" as unknown as React.ElementType,
    ).length > 0
  );
}

function bannerRendered(): boolean {
  // BackgroundRevocationBanner renderizza un View con Text al suo interno.
  // È abbastanza verificare che qualcosa sia stato renderizzato (non null).
  const root = renderer!.toJSON();
  return root !== null;
}

function nothingRendered(): boolean {
  return renderer!.toJSON() === null;
}

// ── setup / teardown ─────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  locationState.hasBackgroundPermission = false;
  locationState.backgroundPermissionChecked = true;
  locationState.backgroundPermissionRevoked = false;
  renderer = null;
});

afterEach(async () => {
  if (renderer) {
    await act(async () => {
      renderer!.unmount();
    });
  }
});

// ── test ──────────────────────────────────────────────────────────────────────

describe("GpsAlwaysGate — utente non autenticato", () => {
  it("non renderizza nulla quando isAuthenticated=false (gate inattivo)", async () => {
    locationState.backgroundPermissionChecked = true;
    locationState.hasBackgroundPermission = false;
    await mount({ isAuthenticated: false });
    expect(nothingRendered()).toBe(true);
  });

  it("non renderizza nulla anche se il permesso background manca e il controllo è completato", async () => {
    locationState.backgroundPermissionChecked = true;
    locationState.hasBackgroundPermission = false;
    locationState.backgroundPermissionRevoked = true;
    await mount({ isAuthenticated: false });
    expect(nothingRendered()).toBe(true);
  });
});

describe("GpsAlwaysGate — verifica permesso ancora in corso", () => {
  it("non renderizza nulla mentre backgroundPermissionChecked=false (attesa iniziale)", async () => {
    locationState.backgroundPermissionChecked = false;
    locationState.hasBackgroundPermission = false;
    await mount({ isAuthenticated: true });
    expect(nothingRendered()).toBe(true);
  });

  it("non mostra AlwaysPermissionNotice durante l'attesa iniziale", async () => {
    locationState.backgroundPermissionChecked = false;
    locationState.hasBackgroundPermission = false;
    await mount({ isAuthenticated: true });
    expect(noticeRendered()).toBe(false);
  });
});

describe("GpsAlwaysGate — permesso background già concesso", () => {
  it("non renderizza nulla quando hasBackgroundPermission=true", async () => {
    locationState.backgroundPermissionChecked = true;
    locationState.hasBackgroundPermission = true;
    await mount({ isAuthenticated: true });
    expect(nothingRendered()).toBe(true);
  });

  it("non mostra AlwaysPermissionNotice quando il permesso è già ok", async () => {
    locationState.backgroundPermissionChecked = true;
    locationState.hasBackgroundPermission = true;
    await mount({ isAuthenticated: true });
    expect(noticeRendered()).toBe(false);
  });
});

describe("GpsAlwaysGate — permesso background mancante (gate attivo)", () => {
  it("mostra AlwaysPermissionNotice quando autenticato, permesso controllato e mancante", async () => {
    locationState.backgroundPermissionChecked = true;
    locationState.hasBackgroundPermission = false;
    await mount({ isAuthenticated: true });
    expect(noticeRendered()).toBe(true);
  });

  it("passa onDismiss a AlwaysPermissionNotice", async () => {
    locationState.backgroundPermissionChecked = true;
    locationState.hasBackgroundPermission = false;
    await mount({ isAuthenticated: true });
    const notice = renderer!.root.findAllByType(
      "AlwaysPermissionNotice" as unknown as React.ElementType,
    )[0];
    expect(typeof notice.props.onDismiss).toBe("function");
  });

  it("dopo dismiss mostra BackgroundRevocationBanner se backgroundPermissionRevoked=true", async () => {
    locationState.backgroundPermissionChecked = true;
    locationState.hasBackgroundPermission = false;
    locationState.backgroundPermissionRevoked = true;
    await mount({ isAuthenticated: true });

    const notice = renderer!.root.findAllByType(
      "AlwaysPermissionNotice" as unknown as React.ElementType,
    )[0];

    await act(async () => {
      notice.props.onDismiss();
    });

    expect(noticeRendered()).toBe(false);
    expect(bannerRendered()).toBe(true);
  });

  it("dopo dismiss non renderizza nulla se backgroundPermissionRevoked=false", async () => {
    locationState.backgroundPermissionChecked = true;
    locationState.hasBackgroundPermission = false;
    locationState.backgroundPermissionRevoked = false;
    await mount({ isAuthenticated: true });

    const notice = renderer!.root.findAllByType(
      "AlwaysPermissionNotice" as unknown as React.ElementType,
    )[0];

    await act(async () => {
      notice.props.onDismiss();
    });

    expect(noticeRendered()).toBe(false);
    expect(nothingRendered()).toBe(true);
  });
});
