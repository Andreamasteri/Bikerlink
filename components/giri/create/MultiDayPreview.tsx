import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";

interface RouteResult {
  distanceKm: number;
  durationMinutes: number;
}

interface MultiDayPreviewProps {
  isMultiDay: boolean;
  daysCount: number;
  routeResult: RouteResult;
}

export const MultiDayPreview: React.FC<MultiDayPreviewProps> = ({
  isMultiDay,
  daysCount,
  routeResult,
}) => {
  if (!isMultiDay) return null;

  return (
    <View style={styles.multiDayPreview}>
      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any -- icon name from data */}
      <Ionicons name={"calendar-range" as any} size={16} color="#a78bfa" />
      <Text style={styles.multiDayPreviewText}>
        {daysCount} giorni · ~{Math.round(routeResult.distanceKm / daysCount)} km/giorno
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
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
});
