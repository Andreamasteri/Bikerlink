import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { useT } from "@/lib/language-context";

type Props = {
  motorcycles: any[];
};

export default function UserGarage({ motorcycles }: Props) {
  const t = useT();

  if (!motorcycles || motorcycles.length === 0) return null;

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{t("home.garage")}</Text>
      {motorcycles.map((m: any) => (
        <View key={m.id} style={styles.infoCard}>
          <Ionicons name="bicycle" size={18} color={Colors.accent} />
          <Text style={styles.infoCardText}>
            {m.brand} {m.model}{m.motorcycleType ? ` · ${m.motorcycleType}` : ""}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginBottom: 12 },
  sectionTitle: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: Colors.accent, marginBottom: 8 },
  infoCard: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: Colors.background, padding: 10, borderRadius: 8, marginBottom: 6,
  },
  infoCardText: { fontSize: 14, fontFamily: "Inter_500Medium", color: Colors.text },
});
