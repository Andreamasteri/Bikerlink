/**
 * Test a livello di COMPONENTE del gate admin del pallino flottante (Task #4469).
 *
 * Monta davvero <FloatingWidget/> con react-test-renderer e varia useAuth
 * (admin vs non-admin) per verificare le due garanzie anti-regressione del
 * Task #4468:
 *   1. La voce di menu "AI Console" (testID floating-widget-item-ai-console)
 *      è renderizzata SOLO per gli admin.
 *   2. AdminConsoleSection → FabDrawer è MONTATO solo per gli admin
 *      (gate `{isAdmin && <AdminConsoleSection/>}`), così gli hook dell'AI
 *      Console non girano per i non-admin.
 *
 * Regressione target:
 *   - Rimuovere il gate `isAdmin &&` attorno ad AdminConsoleSection.
 *   - Mostrare la voce "AI Console" ai non-admin.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import * as TestRenderer from "react-test-renderer";

// ── mock native: componenti veri (per il render), non oggetti vuoti ───────────
vi.mock("react-native", () => {
  // inline (la factory di vi.mock è hoistata: niente riferimenti a top-level)
  const passthrough = (name: string) =>
    function MockHost(props: Record<string, unknown>) {
      return React.createElement(name, props, props.children as React.ReactNode);
    };
  class ValueXY {
    addListener() {
      return 1;
    }
    removeListener() {}
    setValue() {}
    setOffset() {}
    flattenOffset() {}
    getTranslateTransform() {
      return [];
    }
  }
  return {
    Platform: { OS: "ios" },
    StyleSheet: { absoluteFill: {}, create: (s: unknown) => s },
    Animated: {
      ValueXY,
      View: passthrough("Animated.View"),
      spring: () => ({ start: () => {} }),
    },
    // panHandlers.onResponderRelease invoca onPanResponderRelease del config
    // (dx/dy = 0 → non è drag → scatta il tap che apre il menu).
    PanResponder: {
      create: (config: { onPanResponderRelease: (e: unknown, g: unknown) => void }) => ({
        panHandlers: { onResponderRelease: () => config.onPanResponderRelease({}, { dx: 0, dy: 0 }) },
      }),
    },
    BackHandler: { addEventListener: () => ({ remove: () => {} }) },
    Pressable: passthrough("Pressable"),
    Text: passthrough("Text"),
    TouchableOpacity: passthrough("TouchableOpacity"),
    View: passthrough("View"),
    useWindowDimensions: () => ({ width: 390, height: 844 }),
  };
});
vi.mock("expo-haptics", () => ({ impactAsync: vi.fn().mockResolvedValue(undefined), ImpactFeedbackStyle: { Light: "light" } }));
vi.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: vi.fn(() => ({ top: 47, bottom: 34 })) }));
// Ionicons reso come host identificabile: così il test può verificare il `name`
// dell'icona effettivamente renderizzata nella voce di menu.
vi.mock("@expo/vector-icons", () => ({
  Ionicons: (props: Record<string, unknown>) => React.createElement("IconMock", props),
}));
vi.mock("expo-router", () => ({ useRouter: vi.fn(() => ({ push: vi.fn() })), usePathname: vi.fn(() => "/") }));
vi.mock("@react-native-async-storage/async-storage", () => ({ default: { getItem: vi.fn().mockResolvedValue(null), setItem: vi.fn().mockResolvedValue(undefined) } }));
vi.mock("@/hooks/useColors", () => ({
  useColors: vi.fn(() => ({ accent: "#f60", accentRed: "#e22", surface: "#fff", border: "#ccc", text: "#000" })),
}));
vi.mock("@/lib/floating-widget-context", () => ({
  useFloatingWidget: vi.fn(() => ({ isVisible: true, unreadChat: 0, unreadNotifications: 0, refetchBadges: vi.fn() })),
}));
vi.mock("@/hooks/useNewMatchAlert", () => ({ useNewMatchAlert: vi.fn(() => ({ newMatchCount: 0 })) }));
vi.mock("@/hooks/useAssistantEnabled", () => ({ useAssistantEnabled: vi.fn(() => ({ fabEnabled: false })) }));
vi.mock("@/components/user/ai-assistant/AssistantChatSheet", () => ({ default: () => null }));
// FabDrawer mockato come host identificabile: la sua presenza nell'albero =
// AdminConsoleSection montata.
vi.mock("@/components/admin/ai-console/FabDrawer", () => ({ default: () => React.createElement("FabDrawerMock", { testID: "fab-drawer" }) }));
vi.mock("@/hooks/admin/ai-console/useAiActionQueue", () => ({ useAiActionQueue: vi.fn(() => ({ data: { items: [] } })) }));
vi.mock("@/hooks/admin/ai-console/useAiAlerts", () => ({ useAiAlertsState: vi.fn(() => ({ unread: 0 })), useAiAlertsSubscriber: vi.fn() }));

import FloatingWidget from "@/components/FloatingWidget";
import { useAuth } from "@/lib/auth-context";

vi.mock("@/lib/auth-context", () => ({ useAuth: vi.fn() }));

type Role = "admin" | "user";

async function renderWithRole(role: Role) {
  vi.mocked(useAuth).mockReturnValue({ user: { role } } as ReturnType<typeof useAuth>);
  let renderer!: TestRenderer.ReactTestRenderer;
  await TestRenderer.act(async () => {
    renderer = TestRenderer.create(React.createElement(FloatingWidget));
  });
  return renderer;
}

function countByTestID(renderer: TestRenderer.ReactTestRenderer, testID: string): number {
  // Solo le istanze host (type stringa): ogni testID compare anche sul wrapper
  // composito (MockHost) che renderizza l'host con gli stessi props.
  return renderer.root.findAll(
    (n) => typeof n.type === "string" && (n.props as { testID?: string })?.testID === testID,
  ).length;
}

async function openMenu(renderer: TestRenderer.ReactTestRenderer) {
  const ball = renderer.root.findAll((n) => (n.props as { testID?: string })?.testID === "floating-widget-ball")[0];
  await TestRenderer.act(async () => {
    (ball.props as { onResponderRelease: () => void }).onResponderRelease();
  });
}

describe("FloatingWidget — gate admin (render reale)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("admin: la voce 'AI Console' è renderizzata nel menu", async () => {
    const renderer = await renderWithRole("admin");
    await openMenu(renderer);
    expect(countByTestID(renderer, "floating-widget-item-ai-console")).toBe(1);
  });

  it("non-admin: la voce 'AI Console' NON è renderizzata nel menu", async () => {
    const renderer = await renderWithRole("user");
    await openMenu(renderer);
    expect(countByTestID(renderer, "floating-widget-item-ai-console")).toBe(0);
    // le voci base restano (il pallino funziona comunque)
    expect(countByTestID(renderer, "floating-widget-item-chat")).toBe(1);
  });

  it("admin: AdminConsoleSection (FabDrawer) è montata", async () => {
    const renderer = await renderWithRole("admin");
    expect(countByTestID(renderer, "fab-drawer")).toBe(1);
  });

  it("non-admin: AdminConsoleSection (FabDrawer) NON è montata", async () => {
    const renderer = await renderWithRole("user");
    expect(countByTestID(renderer, "fab-drawer")).toBe(0);
  });

  it("admin: la voce 'AI Console' renderizza etichetta e icona corrette", async () => {
    const renderer = await renderWithRole("admin");
    await openMenu(renderer);
    // La TouchableOpacity host con il testID della voce
    const item = renderer.root.findAll(
      (n) =>
        typeof n.type === "string" &&
        (n.props as { testID?: string })?.testID === "floating-widget-item-ai-console",
    )[0];
    expect(item).toBeTruthy();
    // Etichetta: un nodo Text discendente con il testo "AI Console"
    const hasLabel = item.findAll(
      (n) => typeof n.type === "string" && (n.type as string) === "Text",
    ).some((n) => {
      const c = (n.props as { children?: unknown }).children;
      return c === "AI Console";
    });
    expect(hasLabel).toBe(true);
    // Icona: l'IconMock discendente con name="hardware-chip"
    const hasIcon = item.findAll(
      (n) =>
        typeof n.type === "string" &&
        (n.type as string) === "IconMock" &&
        (n.props as { name?: string }).name === "hardware-chip",
    ).length;
    expect(hasIcon).toBe(1);
  });
});
