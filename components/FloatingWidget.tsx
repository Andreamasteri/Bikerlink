import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  Modal,
  Platform,
  PanResponder,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
} from "react-native-reanimated";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import Colors from "@/constants/colors";
import { useFloatingWidget } from "@/lib/floating-widget-context";
import { useAssistantEnabled } from "@/hooks/useAssistantEnabled";
import { useAuth } from "@/lib/auth-context";
import AssistantChatSheet from "@/components/user/ai-assistant/AssistantChatSheet";

export const WIDGET_SIZE = 40;
export const TAP_THRESHOLD = 8; // pixel di movimento oltre cui il gesto è un drag
const POS_KEY = "floating_widget_position";

// Funzione pura esportata per i test: mantiene il pallino dentro i bordi dello
// schermo rispettando il padding superiore (notch) e inferiore (home indicator).
// È marcata `"worklet"` così può essere richiamata anche da worklet reanimated
// (es. animazioni future). In ambiente test la direttiva è una semplice stringa
// no-op, quindi la funzione resta pura e testabile.
export function clampPos(
  x: number,
  y: number,
  screenW: number,
  screenH: number,
  minY: number,
  maxYPad: number,
): { x: number; y: number } {
  "worklet";
  return {
    x: Math.max(0, Math.min(x, screenW - WIDGET_SIZE)),
    y: Math.max(minY, Math.min(y, screenH - WIDGET_SIZE - maxYPad)),
  };
}

// Funzione pura esportata per i test: discrimina tap da drag. Restituisce true
// (= drag) se lo spostamento su un asse supera la soglia TAP_THRESHOLD.
export function isDragGesture(
  dx: number,
  dy: number,
  threshold: number = TAP_THRESHOLD,
): boolean {
  "worklet";
  return Math.abs(dx) > threshold || Math.abs(dy) > threshold;
}

export default function FloatingWidget() {
  const { enabled, suppressed } = useFloatingWidget();
  const { user } = useAuth();
  const { fabEnabled } = useAssistantEnabled();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { width, height } = useWindowDimensions();

  const [menuOpen, setMenuOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);

  const defaultX = width - WIDGET_SIZE - 20;
  const defaultY = height * 0.45;

  // Posizione corrente del pallino come shared values Reanimated — il transform
  // usa questi valori per posizionare il widget sullo schermo.
  const posX = useSharedValue(defaultX);
  const posY = useSharedValue(defaultY);

  // Origine del drag corrente (salvata a onPanResponderGrant sul JS thread).
  const dragStartX = useRef(defaultX);
  const dragStartY = useRef(defaultY);

  // Carica posizione persistita (AsyncStorage → JS thread).
  useEffect(() => {
    AsyncStorage.getItem(POS_KEY).then((raw) => {
      if (!raw) return;
      try {
        const parsed = JSON.parse(raw) as { x: number; y: number };
        const clamped = clampPos(
          parsed.x, parsed.y, width, height,
          insets.top + 8, insets.bottom + 8,
        );
        posX.value = clamped.x;
        posY.value = clamped.y;
      } catch {
        // ignora
      }
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const savePosition = useCallback((x: number, y: number) => {
    AsyncStorage.setItem(POS_KEY, JSON.stringify({ x, y })).catch(() => {});
  }, []);

  const toggleMenu = useCallback(() => {
    setMenuOpen((prev) => !prev);
  }, []);

  // PanResponder — gira completamente sul thread JS, nessun conflitto con i
  // gesture handler nativi di Expo Router (RNGH). onGrant registra l'origine,
  // onMove aggiorna la posizione in tempo reale (clampata ai bordi), onRelease
  // persiste e discrimina tap da drag tramite isDragGesture.
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        dragStartX.current = posX.value;
        dragStartY.current = posY.value;
      },
      onPanResponderMove: (_, _gs) => {
        const clamped = clampPos(
          dragStartX.current + _gs.dx,
          dragStartY.current + _gs.dy,
          width, height,
          insets.top + 8, insets.bottom + 8,
        );
        posX.value = clamped.x;
        posY.value = clamped.y;
      },
      onPanResponderRelease: (_, _gs) => {
        savePosition(posX.value, posY.value);
        if (!isDragGesture(_gs.dx, _gs.dy)) {
          toggleMenu();
        }
      },
      onPanResponderTerminate: (_) => {
        savePosition(posX.value, posY.value);
      },
    })
  ).current;

  // Posizionamento via transform (translateX/translateY) invece di left/top: su
  // Android animare left/top sposta il pixel ma lascia l'hitbox del touch alla
  // posizione di layout originale. Con il transform l'area di tocco segue la
  // posizione visiva.
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: posX.value }, { translateY: posY.value }],
  }));

  // Il widget non serve sulla web preview e non c'è un caso d'uso reale.
  if (!user || !enabled || suppressed || Platform.OS === "web") return null;

  return (
    <>
      <Animated.View
        style={[styles.widget, animatedStyle, aiOpen && styles.widgetHidden]}
        pointerEvents={aiOpen ? "none" : "auto"}
      >
        <View {...panResponder.panHandlers} style={styles.widgetInner}>
          <MaterialCommunityIcons name="compass-outline" size={19} color="#fff" />
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
                router.push("/(tabs)/tracking" as never);
              }}
            >
              <Ionicons name="speedometer-outline" size={22} color={Colors.accent} />
              <Text style={styles.menuItemText}>Telemetria live</Text>
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
    // Ancorato all'origine: la posizione effettiva è data dal transform
    // (translateX/translateY) dell'animatedStyle. Senza left/top espliciti, su
    // Android l'hitbox del touch resterebbe a una posizione di layout indeterminata.
    left: 0,
    top: 0,
    width: WIDGET_SIZE,
    height: WIDGET_SIZE,
    zIndex: 9000,
    // elevation sul container esterno: su Android l'elevation governa anche
    // l'hit-testing tra fratelli sovrapposti, non solo l'ombra. Garantisce che
    // il pallino abbia priorità di tocco sopra le viste fratello a schermo.
    elevation: 12,
  },
  widgetHidden: {
    opacity: 0,
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
