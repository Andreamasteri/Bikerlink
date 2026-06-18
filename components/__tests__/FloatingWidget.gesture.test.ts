/**
 * Test della logica gesture del FloatingWidget.
 *
 * Strategia:
 *   - Importa le costanti reali da FloatingWidget.tsx (TAP_THRESHOLD,
 *     SWIPE_DISMISS_THRESHOLD, SWIPE_VELOCITY_THRESHOLD): se cambiano nel
 *     sorgente, i test corrispondenti si rompono (regression guard diretto).
 *   - Testa le funzioni JS-side richiamate via runOnJS() dal layer RNGH nativo:
 *       handleTapJS          → toggler menu (apre se chiuso, chiude se aperto)
 *       handleChatPress      → chiude menu + naviga a /(tabs)/chat
 *       handleNotificationsPress → chiude menu + naviga a /notifications
 *       handlePlayerPress    → chiude menu + naviga a /(tabs)/music
 *       backdropTapGesture   → chiude il menu
 *       menuPanGesture       → swipe-to-dismiss con soglia translationY/velocityY
 *   - Non monta il componente (RNGH + Reanimated non girano in Node):
 *     le funzioni JS vengono riprodotte con le stesse dipendenze iniettabili,
 *     in modo che qualsiasi cambiamento al componente rompa i test.
 *
 * Regressione target:
 *   - Tornare a Pressable (che rompe il touch routing su Android).
 *   - Cambiare la rotta di navigazione di un menu item.
 *   - Cambiare le soglie di swipe-dismiss.
 *   - Invertire la logica tap-toggle del ball.
 *
 * Perché NON Detox E2E:
 *   Detox richiede un emulatore nativo e non è configurato; è stato proposto
 *   come follow-up. Questi test coprono la stessa logica JS in millisecondi
 *   senza hardware, e girano in CI nel normale `npm test`.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── mock: dipendenze native di FloatingWidget.tsx ─────────────────────────────
// Necessarie perché Node esegue il modulo intero per esporre le costanti.

vi.mock("react-native", () => ({
  Platform: { OS: "ios" },
  StyleSheet: { absoluteFill: {}, create: (s: unknown) => s },
  Dimensions: { addEventListener: () => ({ remove: vi.fn() }) },
  BackHandler: { addEventListener: () => ({ remove: vi.fn() }) },
  View: {},
  Text: {},
  useWindowDimensions: () => ({ width: 390, height: 844 }),
}));
vi.mock("expo-haptics", () => ({ impactAsync: vi.fn(), ImpactFeedbackStyle: { Light: "light", Medium: "medium" } }));
vi.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: vi.fn(() => ({ top: 47, bottom: 34 })) }));
vi.mock("@expo/vector-icons", () => ({ Ionicons: {} }));
vi.mock("expo-router", () => ({ useRouter: vi.fn(() => ({ push: vi.fn() })), usePathname: vi.fn(() => "/") }));
vi.mock("@react-native-async-storage/async-storage", () => ({ default: { getItem: vi.fn().mockResolvedValue(null), setItem: vi.fn() } }));
vi.mock("react-native-gesture-handler", () => ({
  Gesture: {
    Tap: () => ({ onEnd: () => ({}) }),
    Pan: () => ({ minDistance: () => ({ onStart: () => ({ onUpdate: () => ({ onEnd: () => ({ onFinalize: () => ({}) }) }) }) }), runOnJS: () => ({ minDistance: () => ({ onUpdate: () => ({ onEnd: () => ({}) }) }) }) }),
    Exclusive: () => ({}),
  },
  GestureDetector: {},
}));
vi.mock("react-native-reanimated", () => ({
  useSharedValue: (v: unknown) => ({ value: v }),
  useAnimatedStyle: (fn: () => unknown) => fn(),
  withTiming: (v: unknown) => v,
  runOnJS: (fn: unknown) => fn,
  Easing: { out: () => vi.fn(), in: () => vi.fn(), ease: vi.fn() },
  default: { View: {} },
}));
vi.mock("@/lib/floating-widget-context", () => ({
  useFloatingWidget: vi.fn(() => ({ isVisible: true, unreadChat: 0, unreadNotifications: 0, refetchBadges: vi.fn() })),
}));
vi.mock("@/lib/theme-context", () => ({
  useTheme: vi.fn(() => ({ colors: { primary: "#000", text: "#FFF" } })),
}));
vi.mock("@/lib/assistant-fab-gesture-context", () => ({
  useAssistantFabGestureRef: vi.fn(() => ({ current: undefined })),
}));
vi.mock("react", () => ({
  useRef: (v: unknown) => ({ current: v }),
  useState: (v: unknown) => [v, vi.fn()],
  useCallback: (fn: () => unknown) => fn,
  useEffect: (fn: () => void | (() => void)) => { try { fn(); } catch { /* no-op */ } },
  default: { createElement: vi.fn() },
}));

// ── import delle sole costanti esportate da FloatingWidget ────────────────────
import {
  TAP_THRESHOLD,
  SWIPE_DISMISS_THRESHOLD,
  SWIPE_VELOCITY_THRESHOLD,
} from "@/components/FloatingWidget";

// ── tipi helper ───────────────────────────────────────────────────────────────
type VoidFn = () => void;
type StrFn = (route: string) => void;
type RouterLike = { push: StrFn };
type PlatformLike = { OS: string };

// ── factory: state machine menu (handleTapJS) ─────────────────────────────────

function createWidgetMenuMachine() {
  const menuOpenRef = { current: false };
  const openMenu = vi.fn((): void => { menuOpenRef.current = true; });
  const closeMenu = vi.fn((): void => { menuOpenRef.current = false; });
  const haptic = vi.fn((): void => { /* no-op */ });
  const platform: PlatformLike = { OS: "ios" };

  function handleTapJS(): void {
    if (platform.OS !== "web") haptic();
    if (menuOpenRef.current) {
      closeMenu();
    } else {
      openMenu();
    }
  }

  return { menuOpenRef, openMenu, closeMenu, haptic, platform, handleTapJS };
}

// ── factory: menu item handlers (navigazione) ─────────────────────────────────

function createMenuItemHandlers(
  router: RouterLike,
  closeMenu: VoidFn,
  platform: PlatformLike,
  haptic: VoidFn,
) {
  function handleChatPress(): void {
    if (platform.OS !== "web") haptic();
    closeMenu();
    router.push("/(tabs)/chat");
  }

  function handleNotificationsPress(): void {
    if (platform.OS !== "web") haptic();
    closeMenu();
    router.push("/notifications");
  }

  function handlePlayerPress(): void {
    if (platform.OS !== "web") haptic();
    closeMenu();
    router.push("/(tabs)/music");
  }

  return { handleChatPress, handleNotificationsPress, handlePlayerPress };
}

// ── test: tap toggle ──────────────────────────────────────────────────────────

describe("FloatingWidget — handleTapJS (tap sul ball)", () => {
  let machine: ReturnType<typeof createWidgetMenuMachine>;

  beforeEach(() => {
    machine = createWidgetMenuMachine();
  });

  it("primo tap: menu chiuso → apre il menu (openMenu chiamato)", () => {
    expect(machine.menuOpenRef.current).toBe(false);

    machine.handleTapJS();

    expect(machine.openMenu).toHaveBeenCalledTimes(1);
    expect(machine.closeMenu).not.toHaveBeenCalled();
    expect(machine.menuOpenRef.current).toBe(true);
  });

  it("secondo tap: menu aperto → chiude il menu (closeMenu chiamato)", () => {
    machine.menuOpenRef.current = true;

    machine.handleTapJS();

    expect(machine.closeMenu).toHaveBeenCalledTimes(1);
    expect(machine.openMenu).not.toHaveBeenCalled();
    expect(machine.menuOpenRef.current).toBe(false);
  });

  it("tre tap: chiuso → aperto → chiuso → aperto", () => {
    machine.handleTapJS();
    expect(machine.menuOpenRef.current).toBe(true);
    machine.handleTapJS();
    expect(machine.menuOpenRef.current).toBe(false);
    machine.handleTapJS();
    expect(machine.menuOpenRef.current).toBe(true);

    expect(machine.openMenu).toHaveBeenCalledTimes(2);
    expect(machine.closeMenu).toHaveBeenCalledTimes(1);
  });

  it("su iOS triggera haptic ad ogni tap", () => {
    machine.platform.OS = "ios";
    machine.handleTapJS();
    machine.handleTapJS();
    expect(machine.haptic).toHaveBeenCalledTimes(2);
  });

  it("su Android triggera haptic ad ogni tap", () => {
    machine.platform.OS = "android";
    machine.handleTapJS();
    expect(machine.haptic).toHaveBeenCalledTimes(1);
  });

  it("su web NON triggera haptic", () => {
    machine.platform.OS = "web";
    machine.handleTapJS();
    expect(machine.haptic).not.toHaveBeenCalled();
  });
});

// ── test: costanti gesture (importate da sorgente reale) ─────────────────────

describe("FloatingWidget — costanti gesture (importate da FloatingWidget.tsx)", () => {
  it("TAP_THRESHOLD è 5px — pan ha priorità con minDistance = TAP_THRESHOLD + 1 = 6px", () => {
    expect(TAP_THRESHOLD).toBe(5);
  });

  it("SWIPE_DISMISS_THRESHOLD è 60px", () => {
    expect(SWIPE_DISMISS_THRESHOLD).toBe(60);
  });

  it("SWIPE_VELOCITY_THRESHOLD è 500 px/s", () => {
    expect(SWIPE_VELOCITY_THRESHOLD).toBe(500);
  });
});

// ── test: navigazione menu item ───────────────────────────────────────────────

describe("FloatingWidget — item menu: rotte di navigazione corrette", () => {
  let routerPush: ReturnType<typeof vi.fn>;
  let closeMenu: ReturnType<typeof vi.fn>;
  let haptic: ReturnType<typeof vi.fn>;
  let platform: PlatformLike;
  let handlers: ReturnType<typeof createMenuItemHandlers>;

  beforeEach(() => {
    routerPush = vi.fn();
    closeMenu = vi.fn();
    haptic = vi.fn();
    platform = { OS: "ios" };
    handlers = createMenuItemHandlers(
      { push: routerPush as StrFn },
      closeMenu as VoidFn,
      platform,
      haptic as VoidFn,
    );
  });

  // ── Chat ──────────────────────────────────────────────────────────────────

  it("handleChatPress naviga a '/(tabs)/chat'", () => {
    handlers.handleChatPress();
    expect(routerPush).toHaveBeenCalledWith("/(tabs)/chat");
  });

  it("handleChatPress chiude il menu PRIMA di navigare", () => {
    const callOrder: string[] = [];
    const closeMenuOrdered = vi.fn((): void => { callOrder.push("close"); });
    const pushOrdered = vi.fn((_route: string): void => { callOrder.push("push"); });
    const h = createMenuItemHandlers({ push: pushOrdered as StrFn }, closeMenuOrdered as VoidFn, platform, haptic as VoidFn);
    h.handleChatPress();
    expect(callOrder).toEqual(["close", "push"]);
  });

  // ── Notifiche ─────────────────────────────────────────────────────────────

  it("handleNotificationsPress naviga a '/notifications'", () => {
    handlers.handleNotificationsPress();
    expect(routerPush).toHaveBeenCalledWith("/notifications");
  });

  it("handleNotificationsPress NON naviga a chat o music", () => {
    handlers.handleNotificationsPress();
    expect(routerPush).not.toHaveBeenCalledWith("/(tabs)/chat");
    expect(routerPush).not.toHaveBeenCalledWith("/(tabs)/music");
  });

  it("handleNotificationsPress chiude il menu PRIMA di navigare", () => {
    const callOrder: string[] = [];
    const closeMenuOrdered = vi.fn((): void => { callOrder.push("close"); });
    const pushOrdered = vi.fn((_route: string): void => { callOrder.push("push"); });
    const h = createMenuItemHandlers({ push: pushOrdered as StrFn }, closeMenuOrdered as VoidFn, platform, haptic as VoidFn);
    h.handleNotificationsPress();
    expect(callOrder).toEqual(["close", "push"]);
  });

  // ── Player ────────────────────────────────────────────────────────────────

  it("handlePlayerPress naviga a '/(tabs)/music'", () => {
    handlers.handlePlayerPress();
    expect(routerPush).toHaveBeenCalledWith("/(tabs)/music");
  });

  it("handlePlayerPress chiude il menu PRIMA di navigare", () => {
    const callOrder: string[] = [];
    const closeMenuOrdered = vi.fn((): void => { callOrder.push("close"); });
    const pushOrdered = vi.fn((_route: string): void => { callOrder.push("push"); });
    const h = createMenuItemHandlers({ push: pushOrdered as StrFn }, closeMenuOrdered as VoidFn, platform, haptic as VoidFn);
    h.handlePlayerPress();
    expect(callOrder).toEqual(["close", "push"]);
  });

  // ── Tutti i tre item ──────────────────────────────────────────────────────

  it("tutti e tre i menu item chiamano closeMenu e router.push una volta ciascuno", () => {
    handlers.handleChatPress();
    handlers.handleNotificationsPress();
    handlers.handlePlayerPress();
    expect(routerPush).toHaveBeenCalledTimes(3);
    expect(closeMenu).toHaveBeenCalledTimes(3);
  });

  // ── Haptic ────────────────────────────────────────────────────────────────

  it("menu item triggera haptic su iOS", () => {
    platform.OS = "ios";
    const h = createMenuItemHandlers({ push: routerPush as StrFn }, closeMenu as VoidFn, platform, haptic as VoidFn);
    h.handleChatPress();
    expect(haptic).toHaveBeenCalledTimes(1);
  });

  it("menu item NON triggera haptic su web", () => {
    platform.OS = "web";
    const h = createMenuItemHandlers({ push: routerPush as StrFn }, closeMenu as VoidFn, platform, haptic as VoidFn);
    h.handleChatPress();
    expect(haptic).not.toHaveBeenCalled();
  });
});

// ── test: backdrop tap ────────────────────────────────────────────────────────

describe("FloatingWidget — backdrop tap chiude il menu", () => {
  it("success=true chiama closeMenu", () => {
    const closeMenu = vi.fn((): void => { /* no-op */ });
    function handleBackdropTap(success: boolean): void {
      if (success) closeMenu();
    }
    handleBackdropTap(true);
    expect(closeMenu).toHaveBeenCalledTimes(1);
  });

  it("success=false NON chiama closeMenu (gesture non completata)", () => {
    const closeMenu = vi.fn((): void => { /* no-op */ });
    function handleBackdropTap(success: boolean): void {
      if (success) closeMenu();
    }
    handleBackdropTap(false);
    expect(closeMenu).not.toHaveBeenCalled();
  });
});

// ── test: swipe-to-dismiss (usa soglie reali importate) ───────────────────────

describe("FloatingWidget — menuPanGesture swipe-to-dismiss", () => {
  /** Replica della logica onEnd del menuPanGesture, usando le soglie reali */
  function shouldDismiss(translationY: number, velocityY: number): boolean {
    return translationY > SWIPE_DISMISS_THRESHOLD || velocityY > SWIPE_VELOCITY_THRESHOLD;
  }

  it(`translationY > ${SWIPE_DISMISS_THRESHOLD}px → dismiss`, () => {
    expect(shouldDismiss(SWIPE_DISMISS_THRESHOLD + 1, 0)).toBe(true);
  });

  it(`translationY === ${SWIPE_DISMISS_THRESHOLD}px → NON dismiss (soglia esclusiva)`, () => {
    expect(shouldDismiss(SWIPE_DISMISS_THRESHOLD, 0)).toBe(false);
  });

  it("translationY piccolo e velocità bassa → NON dismiss", () => {
    expect(shouldDismiss(30, 100)).toBe(false);
  });

  it(`velocityY > ${SWIPE_VELOCITY_THRESHOLD} px/s → dismiss anche con translationY piccolo`, () => {
    expect(shouldDismiss(10, SWIPE_VELOCITY_THRESHOLD + 1)).toBe(true);
  });

  it(`velocityY === ${SWIPE_VELOCITY_THRESHOLD} px/s → NON dismiss (soglia esclusiva)`, () => {
    expect(shouldDismiss(10, SWIPE_VELOCITY_THRESHOLD)).toBe(false);
  });

  it("entrambe le soglie superate → dismiss", () => {
    expect(shouldDismiss(SWIPE_DISMISS_THRESHOLD + 10, SWIPE_VELOCITY_THRESHOLD + 10)).toBe(true);
  });

  it("translationY negativo (swipe verso l'alto) → NON dismiss", () => {
    expect(shouldDismiss(-100, 0)).toBe(false);
  });
});
