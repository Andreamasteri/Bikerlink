import React from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { useT } from "@/lib/language-context";

interface GarageHeaderProps {
  motorcyclesCount: number;
  onAddPress: () => void;
}

export const GarageHeader: React.FC<GarageHeaderProps> = ({ motorcyclesCount, onAddPress }) => {
  const t = useT();

  return (
    <View style={styles.header}>
      <View>
        <Text style={styles.title}>{t("garage.myGarage")}</Text>
        <Text style={styles.subtitle}>
          {motorcyclesCount === 0 
            ? t("garage.noMoto") 
            : `${motorcyclesCount} ${motorcyclesCount === 1 ? t("garage.motorcycle") : t("garage.motorcycles")}`}
        </Text>
      </View>
      <Pressable style={styles.addIconBtn} onPress={onAddPress}>
        <Ionicons name="add-circle" size={32} color={Colors.accent} />
      </Pressable>
    </View>
  );
};

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 10,
  },
  title: {
    fontSize: 28,
    fontFamily: "Inter_700Bold",
    color: Colors.text,
  },
  subtitle: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
    marginTop: 2,
  },
  addIconBtn: {
    padding: 4,
  },
});
