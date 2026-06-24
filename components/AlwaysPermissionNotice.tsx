import React, { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Linking,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import { useLocationGate } from "@/lib/location-context";

interface Props {
  onDismiss: () => void;
}

export default function AlwaysPermissionNotice({ onDismiss }: Props) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { requestBackgroundPermission } = useLocationGate();
  const [needsSettings, setNeedsSettings] = useState(false);
  const [requesting, setRequesting] = useState(false);

  const isIos = Platform.OS === "ios";

  const handleOpenSettings = () => {
    Linking.openSettings();
  };

  const handleRequest = async () => {
    if (requesting) return;
    setRequesting(true);
    try {
      const result = await requestBackgroundPermission();
      if (result === "needsSettings") {
        // Il sistema impone le Impostazioni (Android 11+ / canAskAgain false).
        setNeedsSettings(true);
      }
      // "granted" → la schermata si chiude da sola (GpsAlwaysGate).
      // "denied" → il dialog è ancora possibile: lasciamo il pulsante per ritentare.
    } finally {
      setRequesting(false);
    }
  };

  return (
    <Modal visible transparent animationType="fade" statusBarTranslucent>
      <View style={[styles.overlay, { backgroundColor: colors.background }]}>
        <View
          style={[
            styles.content,
            {
              paddingTop: insets.top + 32,
              paddingBottom: insets.bottom + 24,
            },
          ]}
        >
          <View style={[styles.iconBg, { backgroundColor: colors.surface }]}>
            <Ionicons name="location" size={52} color={colors.accent} />
          </View>

          <Text style={[styles.title, { color: colors.text }]}>
            Posizione "Sempre"
          </Text>

          <Text style={[styles.body, { color: colors.textSecondary }]}>
            BikerLink usa la posizione in background per:{"\n\n"}
            <Text style={{ color: colors.text }}>{"• "}</Text>
            {"Registrare percorsi senza interruzioni\n"}
            <Text style={{ color: colors.text }}>{"• "}</Text>
            {"Inviare la posizione SOS in emergenza\n"}
            <Text style={{ color: colors.text }}>{"• "}</Text>
            {"Mantenerti visibile nella community\n\n"}
            {needsSettings ? (
              <>
                {isIos
                  ? "Apri le Impostazioni e imposta il permesso di posizione su "
                  : "Apri le Impostazioni di sistema e imposta il permesso di posizione su "}
                <Text style={[styles.bold, { color: colors.text }]}>
                  {isIos ? '"Sempre"' : '"Consenti sempre"'}
                </Text>
                .
              </>
            ) : (
              <>
                Tocca{" "}
                <Text style={[styles.bold, { color: colors.text }]}>
                  Richiedi permesso
                </Text>{" "}
                e scegli{" "}
                <Text style={[styles.bold, { color: colors.text }]}>
                  "Consenti sempre"
                </Text>
                .
              </>
            )}
          </Text>

          {needsSettings && (
            <View style={[styles.deniedBox, { backgroundColor: "#FF444418", borderColor: "#FF444433" }]}>
              <Ionicons name="warning-outline" size={16} color="#FF4444" />
              <Text style={[styles.deniedText, { color: "#FF4444" }]}>
                {isIos ? (
                  <>
                    Permesso da concedere a mano. Vai in{" "}
                    <Text style={{ fontFamily: "Inter_600SemiBold" }}>
                      Impostazioni → BikerLink → Posizione → Sempre
                    </Text>
                    .
                  </>
                ) : (
                  <>
                    Android richiede di abilitare "Sempre" dalle Impostazioni. Vai in{" "}
                    <Text style={{ fontFamily: "Inter_600SemiBold" }}>
                      Impostazioni → Posizione → Consenti sempre
                    </Text>
                    .
                  </>
                )}
              </Text>
            </View>
          )}

          {!needsSettings && (
            <TouchableOpacity
              style={[styles.primaryBtn, { backgroundColor: colors.accent, opacity: requesting ? 0.6 : 1 }]}
              onPress={handleRequest}
              disabled={requesting}
              activeOpacity={0.85}
            >
              <Ionicons
                name="location-outline"
                size={18}
                color={colors.background}
                style={styles.btnIcon}
              />
              <Text style={[styles.primaryBtnText, { color: colors.background }]}>
                {requesting ? "Richiesta in corso…" : "Richiedi permesso"}
              </Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={
              needsSettings
                ? [styles.primaryBtn, { backgroundColor: colors.accent }]
                : [styles.secondaryBtn, { backgroundColor: colors.surface, borderColor: colors.border }]
            }
            onPress={handleOpenSettings}
            activeOpacity={0.85}
          >
            <Ionicons
              name="settings-outline"
              size={18}
              color={needsSettings ? colors.background : colors.accent}
              style={styles.btnIcon}
            />
            <Text
              style={
                needsSettings
                  ? [styles.primaryBtnText, { color: colors.background }]
                  : [styles.secondaryBtnText, { color: colors.accent }]
              }
            >
              Apri Impostazioni
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.dismissBtn}
            onPress={onDismiss}
            activeOpacity={0.7}
          >
            <Text style={[styles.dismissText, { color: colors.textSecondary }]}>
              Non ora
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  content: {
    flex: 1,
    width: "100%",
    paddingHorizontal: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  iconBg: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 28,
  },
  title: {
    fontFamily: "Inter_700Bold",
    fontSize: 26,
    textAlign: "center",
    marginBottom: 20,
    letterSpacing: 0.3,
  },
  body: {
    fontFamily: "Inter_400Regular",
    fontSize: 15,
    lineHeight: 24,
    textAlign: "left",
    marginBottom: 36,
    width: "100%",
  },
  bold: {
    fontFamily: "Inter_600SemiBold",
  },
  primaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    height: 52,
    width: "100%",
    marginBottom: 12,
  },
  primaryBtnText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 16,
  },
  secondaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    height: 52,
    width: "100%",
    borderWidth: 1,
    marginBottom: 24,
  },
  secondaryBtnText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 16,
  },
  btnIcon: {
    marginRight: 8,
  },
  dismissBtn: {
    paddingVertical: 8,
    paddingHorizontal: 24,
  },
  dismissText: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
  },
  deniedBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    borderRadius: 10,
    borderWidth: 1,
    padding: 12,
    width: "100%",
    marginBottom: 16,
  },
  deniedText: {
    flex: 1,
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    lineHeight: 19,
  },
});
