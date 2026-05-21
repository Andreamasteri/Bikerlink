import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import Colors from "@/constants/colors";

export function InfoBanner() {
  return (
    <View style={styles.infoBanner}>
      <MaterialCommunityIcons name="information-outline" size={20} color={Colors.accent} />
      <View style={styles.infoBannerText}>
        <Text style={styles.infoBannerTitle}>Per aggiornare l'app frontend:</Text>
        <Text style={styles.infoBannerBody}>
          1. Apri il workflow "Start Frontend" su Replit e riavvialo.{"\n"}
          2. Per una pubblicazione definitiva su App Store, usa il pulsante "Expo Launch" su Replit dopo aver riavviato il frontend.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  infoBanner: {
    flexDirection: "row", gap: 12,
    backgroundColor: Colors.accent + "15",
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.accent + "30",
  },
  infoBannerText: { flex: 1 },
  infoBannerTitle: { fontSize: 13, color: Colors.text, fontFamily: "Inter_600SemiBold", marginBottom: 4 },
  infoBannerBody: { fontSize: 12, color: Colors.textSecondary, fontFamily: "Inter_400Regular", lineHeight: 18 },
});
