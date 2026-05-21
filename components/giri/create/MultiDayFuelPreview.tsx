import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";

interface MultiDayFuelPreviewProps {
  isMultiDay: boolean;
  daysCount: number;
  distanceKm: number;
  selectedMotoId: string | null;
  fuelStopsNeeded: number;
}

export const MultiDayFuelPreview: React.FC<MultiDayFuelPreviewProps> = ({
  isMultiDay,
  daysCount,
  distanceKm,
  selectedMotoId,
  fuelStopsNeeded,
}) => {
  const colors = useColors();

  if (!isMultiDay && (!selectedMotoId || fuelStopsNeeded <= 0)) return null;

  return (
    <View style={styles.container}>
      {isMultiDay && (
        <View style={styles.multiDayPreview}>
          <MaterialCommunityIcons name="calendar-range" size={16} color="#a78bfa" />
          <Text style={styles.multiDayPreviewText}>
            {daysCount} giorni · ~{Math.round(distanceKm / daysCount)} km/giorno
          </Text>
        </View>
      )}

      {selectedMotoId && fuelStopsNeeded > 0 && (
        <View style={[styles.fuelPreview, { backgroundColor: colors.accent + "18" }]}>
          <MaterialCommunityIcons name="gas-station" size={16} color={colors.accent} />
          <Text style={[styles.fuelPreviewText, { color: colors.accent }]}>
            {fuelStopsNeeded} sosta/e carburante stimate
          </Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    gap: 8,
    marginTop: 8,
  },
  multiDayPreview: { 
    flexDirection: "row", 
    alignItems: "center", 
    gap: 8, 
    backgroundColor: "#7c3aed18", 
    borderRadius: 10, 
    padding: 10 
  },
  multiDayPreviewText: { 
    fontFamily: "Inter_500Medium", 
    fontSize: 13, 
    color: "#a78bfa", 
    flex: 1 
  },
  fuelPreview: { 
    flexDirection: "row", 
    alignItems: "center", 
    gap: 8, 
    borderRadius: 10, 
    padding: 10 
  },
  fuelPreviewText: { 
    fontFamily: "Inter_500Medium", 
    fontSize: 13, 
    flex: 1 
  },
});
