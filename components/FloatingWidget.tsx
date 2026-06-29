import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  Platform,
  PanResponder,
  Animated,
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
  const { user, healthState, healthReason } = useAuth();
  const { fabEnabled } = useAssistantEnabled();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { width, height } = useWindowDimensions();

  const [menuOpen, setMenuOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);

  const defaultX = width - WIDGET_SIZE - 20;
  const defaultY = height * 0.45;

  // Posizione corrente del pallino come Animated.Value RN — il transform usa questi
  // valori. A differenza di Reanimated useSharedValue, Animated.Value con transform
  // aggiorna la hitbox touch nativa su Android (fix: pallino non cliccabile).
  const posXAnim = useRef(new Animated.Value(defaultX)).current;
  const posYAnim = useRef(new Animated.Value(defaultY)).current;
  // Ref paralleli per leggere il valore corrente in modo sincrono (Animated.Value
  // non ha un getter sincrono affidabile cross-platform).
  const posXRef = useRef(defaultX);
  const posYRef = useRef(defaultY);

  // Origine del drag corrente (salvata a onPanResponderGrant sul JS thread).
  const dragStartX = useRef(defaultX);
  const dragStartY = useRef(defaultY);

  // Ref aggiornati ad ogni render: il PanResponder è frozen al mount e non
  // riesce a leggere i valori più recenti dalla closure. Usando ref aggiornati
  // garantiamo che clampPos usi sempre le dimensioni e gli inset correnti.
  const widthRef = useRef(width);
  const heightRef = useRef(height);
  const insetsRef = useRef(insets);
  widthRef.current = width;
  heightRef.current = height;
  insetsRef.current = insets;

  // Flag che indica se un drag è in corso. Qualsiasi logica di re-clamp deve
  // controllare questo flag e saltare l'aggiornamento se il drag è attivo.
  const isDragging = useRef(false);

  // Re-clamp condizionale per rotazione schermo / resize.
  // Salta se isDragging è true e scrive solo se il widget è realmente fuori
  // dai nuovi limiti, così l'apertura di un pannello (che cambia insets ma
  // non sposta il pallino fuori schermo) non causa alcun "salto".
  useEffect(() => {
    if (isDragging.current) return;
    const minY = insets.top + 8;
    const maxYPad = insets.bottom + 8;
    const maxX = width - WIDGET_SIZE;
    const maxY = height - WIDGET_SIZE - maxYPad;
    const curX = posXRef.current;
    const curY = posYRef.current;
    const clampedX = Math.max(0, Math.min(curX, maxX));
    const clampedY = Math.max(minY, Math.min(curY, maxY));
    if (clampedX !== curX || clampedY !== curY) {
      posXAnim.setValue(clampedX); posXRef.current = clampedX;
      posYAnim.setValue(clampedY); posYRef.current = clampedY;
    }
  }, [width, height, insets.top, insets.bottom]); // eslint-disable-line react-hooks/exhaustive-deps

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
        posXAnim.setValue(clamped.x); posXRef.current = clamped.x;
        posYAnim.setValue(clamped.y); posYRef.current = clamped.y;
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
  // NOTA: il menu viene aperto direttamente da onPanResponderRelease senza
  // usare Modal — così il sistema touch è già rilasciato prima che la UI
  // del menu venga montata, eliminando il crash Android PanResponder↔Modal.
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => {
        isDragging.current = true;
        dragStartX.current = posXRef.current;
        dragStartY.current = posYRef.current;
      },
      onPanResponderMove: (_, _gs) => {
        // Legge sempre i ref aggiornati a ogni render, mai la closure stantia
        // catturata al momento della creazione del PanResponder.
        const w = widthRef.current;
        const h = heightRef.current;
        const ins = insetsRef.current;
        const clamped = clampPos(
          dragStartX.current + _gs.dx,
          dragStartY.current + _gs.dy,
          w, h,
          ins.top + 8, ins.bottom + 8,
        );
        posXAnim.setValue(clamped.x); posXRef.current = clamped.x;
        posYAnim.setValue(clamped.y); posYRef.current = clamped.y;
      },
      onPanResponderRelease: (_, _gs) => {
        isDragging.current = false;
        // Re-clamp al rilascio: copre il caso di rotazione schermo avvenuta
        // mentre il widget era fuori uso, senza mai intervenire mid-drag.
        const w = widthRef.current;
        const h = heightRef.current;
        const ins = insetsRef.current;
        const clamped = clampPos(
          posXRef.current, posYRef.current, w, h,
          ins.top + 8, ins.bottom + 8,
        );
        posXAnim.setValue(clamped.x); posXRef.current = clamped.x;
        posYAnim.setValue(clamped.y); posYRef.current = clamped.y;
        savePosition(clamped.x, clamped.y);
        if (!isDragGesture(_gs.dx, _gs.dy)) {
          toggleMenu();
        }
      },
      onPanResponderTerminate: () => {
        isDragging.current = false;
        savePosition(posXRef.current, posYRef.current);
      },
    })
  ).current;

  // Posizionamento via transform (translateX/translateY) con Animated.Value di RN:
  // su Android, Animated.Value con transform aggiorna la hitbox touch nativa in
  // lockstep con la posizione visiva — Reanimated useSharedValue non lo fa.

  // Stato salute backend (Bowie assorbe il vecchio HealthBanner): quando il
  // backend non è READY, il pallino mostra un badge colorato e, all'apertura del
  // pannello, un messaggio informativo in cima.
  const healthProblem = healthState !== "READY";
  const healthBroken = healthState === "BROKEN";
  const healthColor = healthBroken ? "#C62828" : "#ED6C02";
  const healthTitle = healthBroken
    ? "Servizio parzialmente non disponibile"
    : "Servizio rallentato";
  const healthMessage =
    healthReason && healthReason.trim().length > 0
      ? healthReason
      : healthBroken
        ? "Alcune sezioni dell'app potrebbero non rispondere temporaneamente."
        : "Alcune operazioni potrebbero richiedere più tempo del solito.";

  // Il widget non serve sulla web preview e non c'è un caso d'uso reale.
  if (!user || !enabled || suppressed || Platform.OS === "web") return null;

  return (
    <>
      <Animated.View
        testID="floating-widget"
        style={[
          styles.widget,
          { transform: [{ translateX: posXAnim }, { translateY: posYAnim }] },
          aiOpen && styles.widgetHidden,
        ]}
        pointerEvents={aiOpen ? "none" : "auto"}
      >
        <View {...panResponder.panHandlers} style={styles.widgetInner}>
          <MaterialCommunityIcons name="cat" size={20} color="#fff" />
          {healthProblem && (
            <View
              testID="floating-widget-health-badge"
              style={[styles.healthBadge, { backgroundColor: healthColor }]}
            />
          )}
        </View>
      </Animated.View>

      {menuOpen && (
        <Pressable style={styles.overlay} onPress={() => setMenuOpen(false)}>
          <Pressable style={styles.menu} onPress={() => {}}>
            {healthProblem && (
              <View
                testID="floating-widget-health-message"
                style={[styles.healthMessage, { borderLeftColor: healthColor }]}
              >
                <View style={styles.healthMessageHeader}>
                  <Ionicons
                    name={healthBroken ? "alert-circle" : "warning"}
                    size={16}
                    color={healthColor}
                  />
                  <Text style={[styles.healthMessageTitle, { color: healthColor }]}>
                    {healthTitle}
                  </Text>
                </View>
                <Text style={styles.healthMessageText} numberOfLines={3}>
                  {healthMessage}
                </Text>
              </View>
            )}

            <Text style={styles.menuTitle}>Navigazione & Bowie</Text>

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
                <Text style={styles.menuItemText}>Bowie</Text>
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
      )}

      {aiOpen && <AssistantChatSheet visible={aiOpen} onClose={() => setAiOpen(false)} />}
    </>
  );
}

const styles = StyleSheet.create({
  widget: {
    position: "absolute",
    // Ancorato all'origine: la posizione effettiva è data dal transform
    // (translateX/translateY) dell'Animated.Value. Senza left/top espliciti, su
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
  healthBadge: {
    position: "absolute",
    top: 2,
    right: 2,
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: "#fff",
  },
  healthMessage: {
    marginHorizontal: 8,
    marginTop: 10,
    marginBottom: 4,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderLeftWidth: 3,
    backgroundColor: Colors.background,
    gap: 4,
  },
  healthMessageHeader: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 6,
  },
  healthMessageTitle: {
    fontSize: 13,
    fontWeight: "600" as const,
    flex: 1,
  },
  healthMessageText: {
    fontSize: 12,
    color: Colors.textSecondary,
    lineHeight: 16,
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
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 9500,
    elevation: 16,
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
