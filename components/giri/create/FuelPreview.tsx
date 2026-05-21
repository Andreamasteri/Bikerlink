import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";

interface FuelPreviewProps {
  selectedMotoId: string | null;
  fuelStopsNeeded: number;
}

export const FuelPreview: React.FC<FuelPreviewProps> = ({
  selectedMotoId,
  fuelStopsNeeded,
}) => {
  const colors = useColors();

  if (!selectedMotoId || fuelStopsNeeded <= 0) return null;

  return (
    <View style={[styles.fuelPreview, { backgroundColor: colors.accent + "18" }]}>
      <MaterialCommunityIcons name="gas-station" size={16} color={colors.accent} />
      <Text style={[styles.fuelPreviewText, { color: colors.accent }]}>
        {fuelStopsNeeded} sosta/e carburante stimate
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  fuelPreview: { 
    flexDirection: "row", 
    alignItems: "center", 
    gap: 8, 
    borderRadius: 10, 
    padding: 10,
    marginTop: 8,
  },
  fuelPreviewText: { 
    fontFamily: "Inter_500Medium", 
    fontSize: 13, 
    flex: 1 
  },
});
