import React, { useRef, useState, useEffect, useCallback } from "react";
import {
  Animated,
  PanResponder,
  View,
  Text,
  Pressable,
  StyleSheet,
  Dimensions,
  Modal,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import Colors from "@/constants/colors";
import { useFloatingWidget } from "@/lib/floating-widget-context";
import { useAssistantEnabled } from "@/hooks/useAssistantEnabled";
import { useAuth } from "@/lib/auth-context";
import AssistantChatSheet from "@/components/user/ai-assistant/AssistantChatSheet";

const WIDGET_SIZE = 54;
const TAP_THRESHOLD = 8; // pixel di movimento oltre cui il gesto è un drag
const POS_KEY = "floating_widget_position";

function clampPos(
  x: number,
  y: number,
  screenW: number,
  screenH: number,
  minY: number,
  maxYPad: number,
): { x: number; y: number } {
  return {
    x: Math.max(0, Math.min(x, screenW - WIDGET_SIZE)),
    y: Math.max(minY, Math.min(y, screenH - WIDGET_SIZE - maxYPad)),
  };
}

export default function FloatingWidget() {
  const { enabled, suppressed } = useFloatingWidget();
  const { user } = useAuth();
  const { fabEnabled } = useAssistantEnabled();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [menuOpen, setMenuOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);

  const dims = Dimensions.get("window");
  const defaultX = dims.width - WIDGET_SIZE - 20;
  const defaultY = dims.height * 0.45;

  const pan = useRef(new Animated.ValueXY({ x: defaultX, y: defaultY })).current;
  const panOffset = useRef({ x: defaultX, y: defaultY });
  const hasDragged = useRef(false);

  // Carica posizione persistita
  useEffect(() => {
    AsyncStorage.getItem(POS_KEY).then((raw) => {
      if (!raw) return;
      try {
        const parsed = JSON.parse(raw) as { x: number; y: number };
        const d = Dimensions.get("window");
        const clamped = clampPos(
          parsed.x, parsed.y, d.width, d.height,
          insets.top + 8, insets.bottom + 8,
        );
        pan.setValue(clamped);
        panOffset.current = clamped;
      } catch {
        // ignora
      }
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const savePosition = useCallback((x: number, y: number) => {
    AsyncStorage.setItem(POS_KEY, JSON.stringify({ x, y })).catch(() => {});
  }, []);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gs) =>
        Math.abs(gs.dx) > 2 || Math.abs(gs.dy) > 2,
      onPanResponderGrant: () => {
        hasDragged.current = false;
        pan.stopAnimation();
      },
      onPanResponderMove: (_, gs) => {
        if (Math.abs(gs.dx) > TAP_THRESHOLD || Math.abs(gs.dy) > TAP_THRESHOLD) {
          hasDragged.current = true;
        }
        pan.setValue({
          x: panOffset.current.x + gs.dx,
          y: panOffset.current.y + gs.dy,
        });
      },
      onPanResponderRelease: (_, gs) => {
        const newX = panOffset.current.x + gs.dx;
        const newY = panOffset.current.y + gs.dy;
        const d = Dimensions.get("window");
        const clamped = clampPos(newX, newY, d.width, d.height, 8, 8);
        pan.setValue(clamped);
        panOffset.current = clamped;
        savePosition(clamped.x, clamped.y);
        if (!hasDragged.current) {
          setMenuOpen((prev) => !prev);
        }
      },
    })
  ).current;

  if (!user || !enabled || suppressed) return null;

  return (
    <>
      <Animated.View
        style={[styles.widget, { left: pan.x, top: pan.y }]}
        {...panResponder.panHandlers}
      >
        <View style={styles.widgetInner}>
          <MaterialCommunityIcons name="compass-outline" size={26} color="#fff" />
        </View>
      </Animated.View>

      <Modal
        visible={menuOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setMenuOpen(false)}
      >
        <Pressable style={styles.overlay} onPress={() => setMenuOpen(false)}>
          <Pressable style={styles.menu} onPress={() => {}}>
            <Text style={styles.menuTitle}>Widget navigazione</Text>

            <Pressable
              style={styles.menuItem}
              onPress={() => {
                setMenuOpen(false);
                router.push("/route" as never);
              }}
            >
              <Ionicons name="navigate-outline" size={22} color={Colors.accent} />
              <Text style={styles.menuItemText}>Pianifica percorso</Text>
            </Pressable>

            <Pressable
              style={styles.menuItem}
              onPress={() => {
                setMenuOpen(false);
                router.push("/(tabs)" as never);
              }}
            >
              <Ionicons name="map-outline" size={22} color={Colors.accent} />
              <Text style={styles.menuItemText}>Torna alla mappa</Text>
            </Pressable>

            {fabEnabled && (
              <Pressable
                style={styles.menuItem}
                onPress={() => {
                  setMenuOpen(false);
                  setAiOpen(true);
                }}
              >
                <Ionicons name="sparkles-outline" size={22} color={Colors.accent} />
                <Text style={styles.menuItemText}>Assistente AI</Text>
              </Pressable>
            )}

            <Pressable
              style={[styles.menuItem, styles.menuItemClose]}
              onPress={() => setMenuOpen(false)}
            >
              <Ionicons name="close-outline" size={22} color={Colors.textSecondary} />
              <Text style={[styles.menuItemText, { color: Colors.textSecondary }]}>Chiudi</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      <AssistantChatSheet visible={aiOpen} onClose={() => setAiOpen(false)} />
    </>
  );
}

const styles = StyleSheet.create({
  widget: {
    position: "absolute",
    width: WIDGET_SIZE,
    height: WIDGET_SIZE,
    zIndex: 9000,
  },
  widgetInner: {
    width: WIDGET_SIZE,
    height: WIDGET_SIZE,
    borderRadius: WIDGET_SIZE / 2,
    backgroundColor: Colors.accent,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 12,
  },
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "center",
    alignItems: "center",
  },
  menu: {
    backgroundColor: Colors.surface,
    borderRadius: 20,
    paddingVertical: 8,
    width: 260,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  menuTitle: {
    fontSize: 12,
    fontWeight: "600" as const,
    color: Colors.textSecondary,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 10,
    textTransform: "uppercase" as const,
    letterSpacing: 0.6,
  },
  menuItem: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 12,
    marginHorizontal: 4,
  },
  menuItemClose: {
    marginTop: 4,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    borderRadius: 0,
    marginHorizontal: 0,
    borderBottomLeftRadius: 12,
    borderBottomRightRadius: 12,
  },
  menuItemText: {
    fontSize: 15,
    fontWeight: "500" as const,
    color: Colors.text,
  },
});
