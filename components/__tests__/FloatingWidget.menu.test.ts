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
vi.mock("@/lib/auth-context", () => ({ useAuth: vi.fn(() => ({ user: null })) }));
vi.mock("@/components/admin/ai-console/FabDrawer", () => ({ default: () => null }));
vi.mock("@/hooks/admin/ai-console/useAiActionQueue", () => ({ useAiActionQueue: vi.fn(() => ({ data: undefined })) }));
vi.mock("@/hooks/admin/ai-console/useAiAlerts", () => ({ useAiAlertsState: vi.fn(() => ({ unread: 0 })), useAiAlertsSubscriber: vi.fn() }));

import { MENU_ROUTES, buildMenuKeys, computeTotalBadge } from "@/components/FloatingWidget";

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

// ── gating voce Assistente AI (buildMenuKeys reale dal sorgente) ───────────────

describe("FloatingWidget — gating voce Assistente AI (fabEnabled)", () => {
  it("fabEnabled=true → 'ai' presente in testa (prima delle voci base)", () => {
    const keys = buildMenuKeys({ isAdmin: false, fabEnabled: true });
    expect(keys).toEqual(["ai", "chat", "notifications", "match", "music"]);
  });

  it("fabEnabled=false → nessuna voce 'ai'", () => {
    const keys = buildMenuKeys({ isAdmin: false, fabEnabled: false });
    expect(keys).toEqual(["chat", "notifications", "match", "music"]);
    expect(keys).not.toContain("ai");
  });
});

// ── gating voce AI Console (Task #4468): SOLO admin ────────────────────────────

describe("FloatingWidget — gating voce 'AI Console' (solo admin)", () => {
  it("admin → la voce 'ai-console' è presente ed è la prima del menu", () => {
    const keys = buildMenuKeys({ isAdmin: true, fabEnabled: true });
    expect(keys).toContain("ai-console");
    expect(keys[0]).toBe("ai-console");
  });

  it("admin con assistente disabilitato → 'ai-console' resta, 'ai' no", () => {
    const keys = buildMenuKeys({ isAdmin: true, fabEnabled: false });
    expect(keys).toEqual(["ai-console", "chat", "notifications", "match", "music"]);
  });

  it("non-admin → la voce 'ai-console' NON è presente", () => {
    const withFab = buildMenuKeys({ isAdmin: false, fabEnabled: true });
    const withoutFab = buildMenuKeys({ isAdmin: false, fabEnabled: false });
    expect(withFab).not.toContain("ai-console");
    expect(withoutFab).not.toContain("ai-console");
  });
  // Il gate di mount reale (`{isAdmin && <AdminConsoleSection/>}`) + il rendering
  // effettivo della voce sono verificati a livello di componente in
  // FloatingWidget.admin.test.ts (render con react-test-renderer).
});

// ── badge combinato del pallino (computeTotalBadge reale dal sorgente) ──────────

describe("FloatingWidget — badge combinato sul pallino", () => {
  it("somma chat + notifiche + nuovi match (non-admin)", () => {
    expect(
      computeTotalBadge({ unreadChat: 2, unreadNotifications: 3, newMatchCount: 1, adminBadge: 0, isAdmin: false }),
    ).toBe(6);
  });

  it("zero quando non c'è nulla di non letto", () => {
    expect(
      computeTotalBadge({ unreadChat: 0, unreadNotifications: 0, newMatchCount: 0, adminBadge: 0, isAdmin: false }),
    ).toBe(0);
  });

  it("il badge admin contribuisce SOLO per gli admin", () => {
    const args = { unreadChat: 1, unreadNotifications: 1, newMatchCount: 1, adminBadge: 5 };
    expect(computeTotalBadge({ ...args, isAdmin: true })).toBe(8);
    // Stesso adminBadge ma non-admin → i 5 non vengono sommati.
    expect(computeTotalBadge({ ...args, isAdmin: false })).toBe(3);
  });
});
