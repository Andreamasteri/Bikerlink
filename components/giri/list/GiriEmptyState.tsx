import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";

export function GiriEmptyState({ filter, onPlan }: { filter: string; onPlan: () => void }) {
  const colors = useColors();
  const s = styles(colors);

  return (
    <View style={s.emptyState}>
      <MaterialCommunityIcons name="map-marker-path" size={60} color={colors.textSecondary} />
      <Text style={s.emptyTitle}>
        {filter === "mine" ? "Nessun giro pianificato" : "Nessun giro pubblico"}
      </Text>
      <Text style={s.emptyText}>
        {filter === "mine"
          ? "Premi \"Pianifica\" per creare il tuo primo giro in moto"
          : "Non ci sono ancora giri condivisi dalla community"}
      </Text>
      {filter === "mine" && (
        <View style={{ marginTop: 16 }}>
           {/* We use a simple Pressable here or just rely on the parent to provide the button if needed, 
               but to keep it consistent with the original code we'll include it. */}
          <View style={s.planBtnContainer}>
             <Text onPress={onPlan} style={s.planBtnText}>Pianifica ora</Text>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = (colors: ReturnType<typeof useColors>) =>
  StyleSheet.create({
    emptyState: {
      alignItems: "center",
      paddingTop: 60,
      paddingHorizontal: 32,
      gap: 12,
    },
    emptyTitle: {
      fontFamily: "Inter_600SemiBold",
      fontSize: 18,
      color: colors.text,
      textAlign: "center",
    },
    emptyText: {
      fontFamily: "Inter_400Regular",
      fontSize: 14,
      color: colors.textSecondary,
      textAlign: "center",
      lineHeight: 20,
    },
    planBtnContainer: {
        backgroundColor: colors.accent,
        paddingHorizontal: 14,
        paddingVertical: 9,
        borderRadius: 20,
    },
    planBtnText: {
      fontFamily: "Inter_600SemiBold",
      fontSize: 14,
      color: "#000",
    },
  });
