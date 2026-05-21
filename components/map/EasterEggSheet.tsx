import React from "react";
import { Modal, Pressable, View, Text, ActivityIndicator, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { useT } from "@/lib/language-context";

type EasterEgg = {
  id: string;
  name: string;
  description?: string;
  points?: number;
  collected?: boolean;
};

type Props = {
  egg: EasterEgg | null;
  onClose: () => void;
  onCollect: (id: string) => void;
  collecting: boolean;
};

export default function EasterEggSheet({ egg, onClose, onCollect, collecting }: Props) {
  const t = useT();
  return (
    <Modal visible={!!egg} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <Ionicons name="gift" size={48} color="#FFD700" style={{ alignSelf: "center" }} />
          <Text style={styles.title}>{egg?.name}</Text>
          {egg?.description && <Text style={styles.description}>{egg.description}</Text>}
          {!!egg?.points && <Text style={styles.points}>{egg.points} punti</Text>}
          {egg?.collected ? (
            <View style={styles.collectedBadge}>
              <Ionicons name="checkmark-circle" size={20} color={Colors.success} />
              <Text style={[styles.points, { color: Colors.success }]}>{t("map.alreadyCollected")}</Text>
            </View>
          ) : (
            <Pressable
              style={styles.collectBtn}
              onPress={() => egg && onCollect(egg.id)}
              disabled={collecting}
            >
              {collecting ? (
                <ActivityIndicator color={Colors.background} />
              ) : (
                <Text style={styles.collectBtnText}>Raccogli!</Text>
              )}
            </Pressable>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: Colors.surface,
    marginHorizontal: 32,
    borderRadius: 20,
    padding: 24,
    alignSelf: "center",
    width: "85%",
    maxWidth: 340,
    position: "absolute",
    top: "30%",
  },
  title: { fontSize: 20, fontFamily: "Inter_700Bold", color: Colors.text, textAlign: "center", marginTop: 12 },
  description: { fontSize: 14, fontFamily: "Inter_400Regular", color: Colors.textSecondary, textAlign: "center", marginTop: 8 },
  points: { fontSize: 16, fontFamily: "Inter_600SemiBold", color: Colors.accent, textAlign: "center", marginTop: 8 },
  collectedBadge: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, marginTop: 12 },
  collectBtn: {
    backgroundColor: "#FFD700",
    padding: 14,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 16,
  },
  collectBtnText: { fontSize: 16, fontFamily: "Inter_700Bold", color: Colors.background },
});
