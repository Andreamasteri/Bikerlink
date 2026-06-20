import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  Modal,
  Platform,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  runOnJS,
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
// È marcata `"worklet"` così può essere chiamata sia sul thread JS (load/persist)
// sia dentro i callback gesto di RNGH che girano sul thread UI (drag in tempo
// reale). In ambiente test (senza il plugin reanimated) la direttiva è una
// semplice stringa no-op, quindi la funzione resta pura e testabile.
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
// (= drag) se lo spostamento su un asse supera la soglia TAP_THRESHOLD. Anche
// questa è `"worklet"` perché viene usata in `onEnd` di Gesture.Pan() (thread UI)
// per decidere se aprire il menu.
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

  // Posizione del pallino come shared values reanimated (thread UI): lo stesso
  // sistema usato internamente da Expo Router (RNGH + reanimated), quindi i gesti
  // non vengono surclassati dai gesture handler nativi come accadeva col vecchio
  // PanResponder JS. startX/startY memorizzano l'origine del gesto in onStart.
  const posX = useSharedValue(defaultX);
  const posY = useSharedValue(defaultY);
  const startX = useSharedValue(defaultX);
  const startY = useSharedValue(defaultY);

  // Carica posizione persistita (thread JS).
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

  // Gesture.Pan() di RNGH al posto del PanResponder. onStart fissa l'origine,
  // onUpdate aggiorna la posizione (clampata in tempo reale così il pallino non
  // esce mai dai bordi), onEnd persiste la posizione e — se lo spostamento è
  // sotto la soglia di tap — apre/chiude il menu. clampPos/isDragGesture girano
  // come worklet sul thread UI; setMenuOpen e AsyncStorage tornano sul thread JS
  // via runOnJS.
  const panGesture = Gesture.Pan()
    // minDistance(0): la Pan si attiva già al touch-down invece di richiedere uno
    // spostamento minimo. Senza questo un tap puro (dito giù+su, zero movimento)
    // non porterebbe mai il gesto allo stato ACTIVE → onStart/onEnd non
    // verrebbero chiamati e il tap non aprirebbe il menu. Con 0, onEnd scatta
    // sempre e la discriminazione tap/drag avviene sulla translation.
    .minDistance(0)
    .onStart(() => {
      "worklet";
      startX.value = posX.value;
      startY.value = posY.value;
    })
    .onUpdate((e) => {
      "worklet";
      const clamped = clampPos(
        startX.value + e.translationX,
        startY.value + e.translationY,
        width, height,
        insets.top + 8, insets.bottom + 8,
      );
      posX.value = clamped.x;
      posY.value = clamped.y;
    })
    .onEnd((e) => {
      "worklet";
      runOnJS(savePosition)(posX.value, posY.value);
      if (!isDragGesture(e.translationX, e.translationY)) {
        runOnJS(toggleMenu)();
      }
    });

  // Posizionamento via transform (translateX/translateY) invece di left/top: su
  // Android animare left/top sposta il pixel ma lascia l'hitbox del touch alla
  // posizione di layout originale (il pallino "si vede ma non si tocca"). Con il
  // transform l'area di tocco segue la posizione visiva.
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
        <GestureDetector gesture={panGesture}>
          <View style={styles.widgetInner}>
            <MaterialCommunityIcons name="compass-outline" size={19} color="#fff" />
          </View>
        </GestureDetector>
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
