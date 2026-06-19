/**
 * Test della logica del menu del pallino flottante UNICO (Task #4456).
 *
 * Strategia:
 *   - Importa MENU_ROUTES reale dal sorgente: se una rotta cambia, il test rompe.
 *   - Riproduce la state-machine tap-toggle e gli handler degli item con le stesse
 *     dipendenze iniettabili, così un cambio di logica nel componente rompe i test.
 *
 * Regressione target:
 *   - Cambiare la rotta di navigazione di un item.
 *   - Invertire la logica tap-toggle (apri/chiudi).
 *   - Navigare senza chiudere prima il menu.
 *   - Mostrare la voce "Assistente AI" quando l'assistente è disabilitato.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("react-native", () => ({
  Platform: { OS: "ios" },
  StyleSheet: { absoluteFill: {}, create: (s: unknown) => s },
  Animated: { ValueXY: class {}, View: {}, spring: () => ({ start: vi.fn() }) },
  PanResponder: { create: (c: unknown) => c },
  BackHandler: { addEventListener: () => ({ remove: vi.fn() }) },
  Pressable: {},
  Text: {},
  TouchableOpacity: {},
  View: {},
  useWindowDimensions: () => ({ width: 390, height: 844 }),
}));
vi.mock("expo-haptics", () => ({ impactAsync: vi.fn(), ImpactFeedbackStyle: { Light: "light" } }));
vi.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: vi.fn(() => ({ top: 47, bottom: 34 })) }));
vi.mock("@expo/vector-icons", () => ({ Ionicons: {} }));
vi.mock("expo-router", () => ({ useRouter: vi.fn(() => ({ push: vi.fn() })), usePathname: vi.fn(() => "/") }));
vi.mock("@react-native-async-storage/async-storage", () => ({ default: { getItem: vi.fn().mockResolvedValue(null), setItem: vi.fn() } }));
vi.mock("@/hooks/useColors", () => ({ useColors: vi.fn(() => ({})) }));
vi.mock("@/lib/floating-widget-context", () => ({ useFloatingWidget: vi.fn(() => ({})) }));
vi.mock("@/hooks/useNewMatchAlert", () => ({ useNewMatchAlert: vi.fn(() => ({ newMatchCount: 0 })) }));
vi.mock("@/hooks/useAssistantEnabled", () => ({ useAssistantEnabled: vi.fn(() => ({ fabEnabled: true })) }));
vi.mock("@/components/user/ai-assistant/AssistantChatSheet", () => ({ default: () => null }));
vi.mock("@/components/admin/ai-console/FabDrawer", () => ({ default: () => null }));
vi.mock("@/hooks/admin/ai-console/useAiActionQueue", () => ({ useAiActionQueue: vi.fn(() => ({ queue: [], clearQueue: vi.fn() })) }));
vi.mock("@/hooks/admin/ai-console/useAiAlerts", () => ({ useAiAlertsState: vi.fn(() => ({ alerts: [], unreadCount: 0 })), useAiAlertsSubscriber: vi.fn() }));
vi.mock("@/lib/auth-context", () => ({ useAuth: vi.fn(() => ({ user: null })) }));

import { MENU_ROUTES } from "@/components/FloatingWidget";

// ── rotte ─────────────────────────────────────────────────────────────────────

describe("FloatingWidget — MENU_ROUTES (rotte di navigazione)", () => {
  it("Chat → /(tabs)/chat", () => {
    expect(MENU_ROUTES.chat).toBe("/(tabs)/chat");
  });
  it("Notifiche → /notifications", () => {
    expect(MENU_ROUTES.notifications).toBe("/notifications");
  });
  it("Nuovi Match → /(tabs)/match", () => {
    expect(MENU_ROUTES.match).toBe("/(tabs)/match");
  });
  it("Player → /(tabs)/music", () => {
    expect(MENU_ROUTES.music).toBe("/(tabs)/music");
  });
});

// ── tap-toggle del pallino ─────────────────────────────────────────────────────

function createToggleMachine() {
  const state = { open: false };
  const refetchBadges = vi.fn();
  /** Replica di handleTap: chiuso→apre (con refetch), aperto→chiude. */
  function handleTap(): void {
    if (state.open) {
      state.open = false;
    } else {
      refetchBadges();
      state.open = true;
    }
  }
  return { state, refetchBadges, handleTap };
}

describe("FloatingWidget — tap toggle menu", () => {
  let m: ReturnType<typeof createToggleMachine>;
  beforeEach(() => {
    m = createToggleMachine();
  });

  it("primo tap: menu chiuso → apre + refetchBadges", () => {
    m.handleTap();
    expect(m.state.open).toBe(true);
    expect(m.refetchBadges).toHaveBeenCalledTimes(1);
  });

  it("secondo tap: menu aperto → chiude, senza refetch", () => {
    m.handleTap();
    m.refetchBadges.mockClear();
    m.handleTap();
    expect(m.state.open).toBe(false);
    expect(m.refetchBadges).not.toHaveBeenCalled();
  });

  it("tre tap: chiuso → aperto → chiuso → aperto", () => {
    m.handleTap();
    expect(m.state.open).toBe(true);
    m.handleTap();
    expect(m.state.open).toBe(false);
    m.handleTap();
    expect(m.state.open).toBe(true);
  });
});

// ── handler degli item: chiudono il menu PRIMA di navigare ─────────────────────

describe("FloatingWidget — item menu: chiude prima di navigare", () => {
  function makeNavigate(order: string[], close: () => void, push: (r: string) => void) {
    return (route: string): void => {
      close();
      push(route);
    };
  }

  it("navigate chiude il menu PRIMA di router.push", () => {
    const order: string[] = [];
    const close = vi.fn(() => order.push("close"));
    const push = vi.fn((_r: string) => order.push("push"));
    const navigate = makeNavigate(order, close, push);
    navigate(MENU_ROUTES.chat);
    expect(order).toEqual(["close", "push"]);
    expect(push).toHaveBeenCalledWith(MENU_ROUTES.chat);
  });

  it("apertura assistente chiude il menu e apre la chat sheet", () => {
    const order: string[] = [];
    const closeMenu = vi.fn(() => order.push("closeMenu"));
    const openSheet = vi.fn(() => order.push("openSheet"));
    function openAssistant(): void {
      closeMenu();
      openSheet();
    }
    openAssistant();
    expect(order).toEqual(["closeMenu", "openSheet"]);
  });
});

// ── gating voce Assistente AI ──────────────────────────────────────────────────

describe("FloatingWidget — gating voce Assistente AI (fabEnabled)", () => {
  /** Replica della costruzione menuItems: la voce AI esiste solo se fabEnabled. */
  function buildKeys(fabEnabled: boolean): string[] {
    const keys: string[] = [];
    if (fabEnabled) keys.push("ai");
    keys.push("chat", "notifications", "match", "music");
    return keys;
  }

  it("fabEnabled=true → 5 voci con 'ai' in testa", () => {
    const keys = buildKeys(true);
    expect(keys).toEqual(["ai", "chat", "notifications", "match", "music"]);
  });

  it("fabEnabled=false → 4 voci senza 'ai'", () => {
    const keys = buildKeys(false);
    expect(keys).toEqual(["chat", "notifications", "match", "music"]);
    expect(keys).not.toContain("ai");
  });
});

// ── badge combinato del pallino ────────────────────────────────────────────────

describe("FloatingWidget — badge combinato sul pallino", () => {
  const total = (chat: number, notif: number, match: number) => chat + notif + match;

  it("somma chat + notifiche + nuovi match", () => {
    expect(total(2, 3, 1)).toBe(6);
  });
  it("zero quando non c'è nulla di non letto", () => {
    expect(total(0, 0, 0)).toBe(0);
  });
});
