/**
 * Test di mount per AlwaysPermissionNotice.
 *
 * Verifica che il box rosso ("Permesso da concedere a mano" + warning icon) e il
 * pulsante primario "Apri Impostazioni" compaiano SOLO quando
 * requestBackgroundPermission() ritorna "needsSettings", e che nella UI di default
 * (prima di qualsiasi richiesta) il box non sia visibile e il pulsante
 * "Richiedi permesso" sia presente.
 *
 * Strategia: montaggio con react-test-renderer (React reale, ambiente Node).
 * Tutte le dipendenze native e di contesto sono mockate.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import TestRenderer, { act } from "react-test-renderer";

// ── mock: react-native ────────────────────────────────────────────────────────
// I componenti vengono renderizzati come stringhe simboliche in modo che
// findAllByType() funzioni con identity precisa.
vi.mock("react-native", () => {
  let platformOS = "ios";
  return {
    View: "View",
    Text: "Text",
    TouchableOpacity: "TouchableOpacity",
    Modal: ({ children, visible }: { children: React.ReactNode; visible: boolean }) =>
      visible ? children : null,
    StyleSheet: { create: (s: Record<string, unknown>) => s },
    Linking: { openSettings: vi.fn() },
    Platform: {
      get OS() {
        return platformOS;
      },
      set OS(v: string) {
        platformOS = v;
      },
    },
  };
});

// ── mock: safe-area ───────────────────────────────────────────────────────────
vi.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

// ── mock: vector icons ────────────────────────────────────────────────────────
vi.mock("@expo/vector-icons", () => ({
  Ionicons: "Ionicons",
}));

// ── mock: useColors ───────────────────────────────────────────────────────────
vi.mock("@/hooks/useColors", () => ({
  useColors: () => ({
    background: "#000",
    surface: "#111",
    text: "#fff",
    textSecondary: "#aaa",
    accent: "#E53935",
    border: "#333",
  }),
}));

// ── mock: location context ────────────────────────────────────────────────────
const mockRequestBg = vi.hoisted(() => vi.fn());
vi.mock("@/lib/location-context", () => ({
  useLocationGate: () => ({ requestBackgroundPermission: mockRequestBg }),
}));

// ── import componente (dopo i mock) ──────────────────────────────────────────
import AlwaysPermissionNotice from "@/components/AlwaysPermissionNotice";

// ── helpers ───────────────────────────────────────────────────────────────────

/**
 * Serializza l'albero renderizzato in JSON e cerca il substring.
 * Funziona anche con testo annidato in fragment / Text innestati.
 */
function findTextWith(substr: string): boolean {
  return JSON.stringify(renderer?.toJSON() ?? "").includes(substr);
}

function findButtonWithText(root: TestRenderer.ReactTestInstance, label: string): TestRenderer.ReactTestInstance | null {
  const buttons = root.findAllByType("TouchableOpacity" as unknown as React.ElementType);
  for (const btn of buttons) {
    const texts = (btn as TestRenderer.ReactTestInstance).findAllByType("Text" as unknown as React.ElementType);
    const hasLabel = texts.some((t: TestRenderer.ReactTestInstance) => {
      const children = t.props.children;
      const flat = Array.isArray(children) ? children.flat(Infinity) : [children];
      return flat.some((c: unknown) => typeof c === "string" && c.includes(label));
    });
    if (hasLabel) return btn;
  }
  return null;
}

// ── setup / teardown ─────────────────────────────────────────────────────────

let renderer: TestRenderer.ReactTestRenderer | null = null;
const noop = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  renderer = null;
});

afterEach(async () => {
  if (renderer) {
    await act(async () => {
      renderer!.unmount();
    });
  }
});

async function mount() {
  await act(async () => {
    renderer = TestRenderer.create(
      React.createElement(AlwaysPermissionNotice, { onDismiss: noop }),
    );
  });
}

// ── test ──────────────────────────────────────────────────────────────────────

describe("AlwaysPermissionNotice — stato iniziale", () => {
  it("mostra il pulsante 'Richiedi permesso' prima di qualsiasi richiesta", async () => {
    await mount();
    expect(findButtonWithText(renderer!.root, "Richiedi permesso")).not.toBeNull();
  });

  it("NON mostra il box rosso prima di qualsiasi richiesta", async () => {
    await mount();
    // Il testo del box rosso compare solo in stato needsSettings.
    expect(findTextWith("Permesso da concedere")).toBe(false);
    expect(findTextWith("Android richiede")).toBe(false);
  });

  it("mostra sempre 'Apri Impostazioni' (pulsante secondario al primo avvio)", async () => {
    await mount();
    expect(findButtonWithText(renderer!.root, "Apri Impostazioni")).not.toBeNull();
  });
});

describe("AlwaysPermissionNotice — esito 'needsSettings'", () => {
  beforeEach(() => {
    mockRequestBg.mockResolvedValue("needsSettings");
  });

  it("mostra il box rosso dopo che requestBackgroundPermission ritorna 'needsSettings'", async () => {
    await mount();

    const btn = findButtonWithText(renderer!.root, "Richiedi permesso");
    expect(btn).not.toBeNull();

    await act(async () => {
      await btn!.props.onPress();
    });

    // Testo iOS per needsSettings
    expect(findTextWith("Permesso da concedere a mano")).toBe(true);
  });

  it("nasconde il pulsante 'Richiedi permesso' e promuove 'Apri Impostazioni' a primario", async () => {
    await mount();

    const btn = findButtonWithText(renderer!.root, "Richiedi permesso");
    await act(async () => {
      await btn!.props.onPress();
    });

    expect(findButtonWithText(renderer!.root, "Richiedi permesso")).toBeNull();
    expect(findButtonWithText(renderer!.root, "Apri Impostazioni")).not.toBeNull();
  });
});

describe("AlwaysPermissionNotice — esito 'denied'", () => {
  beforeEach(() => {
    mockRequestBg.mockResolvedValue("denied");
  });

  it("NON mostra il box rosso quando il permesso è negato ma si può riprovare", async () => {
    await mount();

    const btn = findButtonWithText(renderer!.root, "Richiedi permesso");
    await act(async () => {
      await btn!.props.onPress();
    });

    expect(findTextWith("Permesso da concedere")).toBe(false);
    expect(findTextWith("Android richiede")).toBe(false);
  });

  it("mantiene il pulsante 'Richiedi permesso' visibile (retry possibile)", async () => {
    await mount();

    const btn = findButtonWithText(renderer!.root, "Richiedi permesso");
    await act(async () => {
      await btn!.props.onPress();
    });

    expect(findButtonWithText(renderer!.root, "Richiedi permesso")).not.toBeNull();
  });
});

describe("AlwaysPermissionNotice — esito 'granted'", () => {
  beforeEach(() => {
    mockRequestBg.mockResolvedValue("granted");
  });

  it("NON mostra il box rosso quando il permesso viene concesso", async () => {
    await mount();

    const btn = findButtonWithText(renderer!.root, "Richiedi permesso");
    await act(async () => {
      await btn!.props.onPress();
    });

    expect(findTextWith("Permesso da concedere")).toBe(false);
  });
});
