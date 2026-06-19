// Pallino flottante UNICO (Task #4456) — sostituisce i due vecchi widget
// (FloatingWidget arancione + AssistantFab viola) con un solo pallino robusto.
//
// Scelte chiave per la robustezza su Android reale (OTA 119 falliva drag+tap):
//   - Gesti SOLO con PanResponder di react-native (NIENTE react-native-gesture-handler).
//     RNGH causava il fallimento di drag/tap sui dispositivi reali.
//   - Posizione gestita con Animated.ValueXY; il PanResponder è creato una volta
//     sola e legge dimensioni/insets/handler da ref (mai da closure stantie).
//   - Tap vs drag distinto via draggedRef + TAP_THRESHOLD.
//   - Menu = overlay root con Pressable/TouchableOpacity semplici: essendo l'unico
//     componente flottante non c'è più conflitto di routing dei touch.
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  BackHandler,
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, usePathname, type Href } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { useColors } from "@/hooks/useColors";
import { useFloatingWidget } from "@/lib/floating-widget-context";
import { useNewMatchAlert } from "@/hooks/useNewMatchAlert";
import { useAssistantEnabled } from "@/hooks/useAssistantEnabled";
import AssistantChatSheet from "@/components/user/ai-assistant/AssistantChatSheet";

// ── costanti (esportate per i test di regressione) ───────────────────────────
export const BALL_SIZE = 56;
export const POSITION_KEY = "floating_widget_position";
/** Spostamento (px) oltre il quale un gesto è un drag, non un tap. */
export const TAP_THRESHOLD = 5;
/** Margine dal bordo dello schermo quando si clampa la posizione. */
export const EDGE_MARGIN = 12;
/** Insets web (status bar / home indicator) quando non ci sono safe-area native. */
export const WEB_INSET_TOP = 67;
export const WEB_INSET_BOTTOM = 34;

/** Rotte di navigazione degli item del menu (esportate per i test). */
export const MENU_ROUTES = {
  chat: "/(tabs)/chat",
  notifications: "/notifications",
  match: "/(tabs)/match",
  music: "/(tabs)/music",
} as const;

/** True se il gesto ha superato la soglia di drag su uno dei due assi. */
export function isDragGesture(dx: number, dy: number): boolean {
  return Math.abs(dx) > TAP_THRESHOLD || Math.abs(dy) > TAP_THRESHOLD;
}

/** Mantiene il pallino dentro i bordi visibili (rispetta status/tab bar + insets). */
export function clampPosition(
  x: number,
  y: number,
  screenW: number,
  screenH: number,
  insetTop: number,
  insetBottom: number,
): { x: number; y: number } {
  const minX = EDGE_MARGIN;
  const maxX = Math.max(minX, screenW - BALL_SIZE - EDGE_MARGIN);
  const minY = insetTop + EDGE_MARGIN;
  // 64 ≈ altezza tab bar: tiene il pallino sopra la barra inferiore.
  const maxY = Math.max(minY, screenH - BALL_SIZE - insetBottom - 64);
  return {
    x: Math.min(Math.max(x, minX), maxX),
    y: Math.min(Math.max(y, minY), maxY),
  };
}

type MenuItem = {
  key: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  badge: number;
  onPress: () => void;
};

export default function FloatingWidget() {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const router = useRouter();
  const pathname = usePathname();

  const { isVisible, unreadChat, unreadNotifications, refetchBadges } = useFloatingWidget();
  const { newMatchCount } = useNewMatchAlert();
  const { fabEnabled } = useAssistantEnabled();

  const isWeb = Platform.OS === "web";
  const insetTop = isWeb ? WEB_INSET_TOP : insets.top;
  const insetBottom = isWeb ? WEB_INSET_BOTTOM : insets.bottom;

  // ── stato ──────────────────────────────────────────────────────────────────
  const [positionLoaded, setPositionLoaded] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [anchor, setAnchor] = useState({ x: 0, y: 0 });
  const [menuSize, setMenuSize] = useState({ w: 200, h: 280 });

  // ── posizione animata + ref sincronizzati ───────────────────────────────────
  const defaultX = width - BALL_SIZE - EDGE_MARGIN;
  const defaultY = height - BALL_SIZE - insetBottom - 90;
  const pan = useRef(new Animated.ValueXY({ x: defaultX, y: defaultY })).current;
  const posRef = useRef({ x: defaultX, y: defaultY });
  const draggedRef = useRef(false);
  const dimsRef = useRef({ width, height });
  const insetRef = useRef({ top: insetTop, bottom: insetBottom });
  const handleTapRef = useRef<() => void>(() => {});

  useEffect(() => {
    dimsRef.current = { width, height };
    insetRef.current = { top: insetTop, bottom: insetBottom };
  }, [width, height, insetTop, insetBottom]);

  useEffect(() => {
    const id = pan.addListener((v) => {
      posRef.current = v;
    });
    return () => pan.removeListener(id);
  }, [pan]);

  const savePosition = useCallback((x: number, y: number) => {
    AsyncStorage.setItem(POSITION_KEY, JSON.stringify({ x, y })).catch(() => {});
  }, []);

  // ── carica posizione salvata ─────────────────────────────────────────────────
  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(POSITION_KEY)
      .then((val) => {
        if (!active) return;
        if (val) {
          try {
            const parsed = JSON.parse(val) as { x: number; y: number };
            const clamped = clampPosition(parsed.x, parsed.y, width, height, insetTop, insetBottom);
            pan.setValue(clamped);
            posRef.current = clamped;
          } catch {
            /* posizione corrotta: resta il default */
          }
        }
        setPositionLoaded(true);
      })
      .catch(() => {
        if (active) setPositionLoaded(true);
      });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── re-clamp quando cambiano dimensioni schermo / insets ─────────────────────
  useEffect(() => {
    if (!positionLoaded) return;
    const clamped = clampPosition(posRef.current.x, posRef.current.y, width, height, insetTop, insetBottom);
    if (clamped.x !== posRef.current.x || clamped.y !== posRef.current.y) {
      Animated.spring(pan, { toValue: clamped, useNativeDriver: false, friction: 8, tension: 80 }).start();
      posRef.current = clamped;
      savePosition(clamped.x, clamped.y);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [width, height, insetTop, insetBottom, positionLoaded]);

  // ── tap handler (toggle menu) ────────────────────────────────────────────────
  const handleTap = useCallback(() => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }
    setMenuOpen((open) => {
      if (open) return false;
      refetchBadges();
      setAnchor({ x: posRef.current.x, y: posRef.current.y });
      return true;
    });
  }, [refetchBadges]);

  useEffect(() => {
    handleTapRef.current = handleTap;
  }, [handleTap]);

  // ── PanResponder (creato una sola volta, legge da ref) ───────────────────────
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_e, g) => isDragGesture(g.dx, g.dy),
      onPanResponderGrant: () => {
        draggedRef.current = false;
        pan.setOffset({ x: posRef.current.x, y: posRef.current.y });
        pan.setValue({ x: 0, y: 0 });
      },
      onPanResponderMove: (_e, g) => {
        if (isDragGesture(g.dx, g.dy)) draggedRef.current = true;
        pan.setValue({ x: g.dx, y: g.dy });
      },
      onPanResponderRelease: () => {
        pan.flattenOffset();
        if (draggedRef.current) {
          const { width: w, height: h } = dimsRef.current;
          const { top, bottom } = insetRef.current;
          const clamped = clampPosition(posRef.current.x, posRef.current.y, w, h, top, bottom);
          Animated.spring(pan, { toValue: clamped, useNativeDriver: false, friction: 8, tension: 80 }).start();
          posRef.current = clamped;
          savePosition(clamped.x, clamped.y);
        } else {
          handleTapRef.current();
        }
      },
      onPanResponderTerminate: () => {
        pan.flattenOffset();
      },
    }),
  ).current;

  // ── chiudi menu al cambio rotta ──────────────────────────────────────────────
  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  // ── back Android chiude il menu ──────────────────────────────────────────────
  useEffect(() => {
    if (!menuOpen) return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      setMenuOpen(false);
      return true;
    });
    return () => sub.remove();
  }, [menuOpen]);

  // ── azioni menu ──────────────────────────────────────────────────────────────
  const navigate = useCallback(
    (route: Href) => {
      if (Platform.OS !== "web") {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      }
      setMenuOpen(false);
      router.push(route);
    },
    [router],
  );

  const openAssistant = useCallback(() => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }
    setMenuOpen(false);
    setAssistantOpen(true);
  }, []);

  const menuItems = useMemo<MenuItem[]>(() => {
    const items: MenuItem[] = [];
    if (fabEnabled) {
      items.push({ key: "ai", label: "Assistente AI", icon: "sparkles", color: colors.accent, badge: 0, onPress: openAssistant });
    }
    items.push({ key: "chat", label: "Chat", icon: "chatbubbles", color: colors.accent, badge: unreadChat, onPress: () => navigate(MENU_ROUTES.chat as Href) });
    items.push({ key: "notifications", label: "Notifiche", icon: "notifications", color: colors.accent, badge: unreadNotifications, onPress: () => navigate(MENU_ROUTES.notifications as Href) });
    items.push({ key: "match", label: "Nuovi Match", icon: "heart", color: colors.accentRed, badge: newMatchCount, onPress: () => navigate(MENU_ROUTES.match as Href) });
    items.push({ key: "music", label: "Player", icon: "musical-notes", color: colors.accent, badge: 0, onPress: () => navigate(MENU_ROUTES.music as Href) });
    return items;
  }, [fabEnabled, colors.accent, colors.accentRed, unreadChat, unreadNotifications, newMatchCount, openAssistant, navigate]);

  const totalBadge = unreadChat + unreadNotifications + newMatchCount;

  // ── posizione del menu (ancorata al pallino, clampata a schermo) ─────────────
  const menuPos = useMemo(() => {
    const w = menuSize.w;
    const h = menuSize.h;
    let left = anchor.x + BALL_SIZE / 2 - w / 2;
    left = Math.min(Math.max(left, EDGE_MARGIN), Math.max(EDGE_MARGIN, width - w - EDGE_MARGIN));
    let top = anchor.y - h - 10;
    if (top < insetTop + EDGE_MARGIN) top = anchor.y + BALL_SIZE + 10;
    top = Math.min(top, Math.max(insetTop + EDGE_MARGIN, height - h - insetBottom - EDGE_MARGIN));
    return { left, top };
  }, [anchor, menuSize, width, height, insetTop, insetBottom]);

  if (!isVisible || !positionLoaded) return null;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {menuOpen && (
        <>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setMenuOpen(false)}
            testID="floating-widget-backdrop"
          />
          <View
            style={[styles.menu, { left: menuPos.left, top: menuPos.top, backgroundColor: colors.surface, borderColor: colors.border }]}
            onLayout={(e) => {
              const { width: w, height: h } = e.nativeEvent.layout;
              if (Math.abs(w - menuSize.w) > 1 || Math.abs(h - menuSize.h) > 1) setMenuSize({ w, h });
            }}
          >
            {menuItems.map((item, idx) => (
              <React.Fragment key={item.key}>
                {idx > 0 && <View style={[styles.menuDivider, { backgroundColor: colors.border }]} />}
                <TouchableOpacity
                  style={styles.menuItem}
                  onPress={item.onPress}
                  activeOpacity={0.7}
                  testID={`floating-widget-item-${item.key}`}
                >
                  <Ionicons name={item.icon} size={20} color={item.color} />
                  <Text style={[styles.menuLabel, { color: colors.text }]} numberOfLines={1}>
                    {item.label}
                  </Text>
                  {item.badge > 0 && (
                    <View style={[styles.menuBadge, { backgroundColor: colors.accentRed }]}>
                      <Text style={styles.menuBadgeText}>{item.badge > 99 ? "99+" : item.badge}</Text>
                    </View>
                  )}
                </TouchableOpacity>
              </React.Fragment>
            ))}
          </View>
        </>
      )}

      <Animated.View
        style={[styles.ball, { backgroundColor: colors.accent, transform: pan.getTranslateTransform() }]}
        {...panResponder.panHandlers}
        testID="floating-widget-ball"
      >
        <Ionicons name="apps" size={26} color="#fff" />
        {totalBadge > 0 && (
          <View style={[styles.badge, { backgroundColor: colors.accentRed }]}>
            <Text style={styles.badgeText}>{totalBadge > 99 ? "99+" : totalBadge}</Text>
          </View>
        )}
      </Animated.View>

      <AssistantChatSheet visible={assistantOpen} onClose={() => setAssistantOpen(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  ball: {
    position: "absolute",
    left: 0,
    top: 0,
    width: BALL_SIZE,
    height: BALL_SIZE,
    borderRadius: BALL_SIZE / 2,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 20,
    zIndex: 10001,
  },
  badge: {
    position: "absolute",
    top: -2,
    right: -2,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
    borderWidth: 1.5,
    borderColor: "#fff",
  },
  badgeText: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "700" as const,
    lineHeight: 12,
  },
  menu: {
    position: "absolute",
    borderRadius: 12,
    borderWidth: 1,
    minWidth: 180,
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 30,
    zIndex: 10000,
    overflow: "hidden",
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  menuLabel: {
    flex: 1,
    fontSize: 14,
    fontWeight: "500" as const,
  },
  menuBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 5,
  },
  menuBadgeText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "700" as const,
  },
  menuDivider: {
    height: 1,
  },
});
