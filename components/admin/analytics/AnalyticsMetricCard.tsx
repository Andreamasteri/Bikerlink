import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import Colors from "@/constants/colors";

interface AnalyticsMetricCardProps {
  label: string;
  value: number;
  icon: keyof typeof MaterialIcons.glyphMap;
  color: string;
  isTappable: boolean;
  onPress?: () => void;
}

export const AnalyticsMetricCard: React.FC<AnalyticsMetricCardProps> = ({
  label,
  value,
  icon,
  color,
  isTappable,
  onPress,
}) => {
  const CardWrapper = isTappable ? TouchableOpacity : View;
  
  return (
    <CardWrapper
      style={styles.statCard}
      {...(isTappable ? { onPress, activeOpacity: 0.7 } : {})}
    >
      <View style={[styles.statIcon, { backgroundColor: color + "22" }]}>
        <MaterialIcons name={icon} size={24} color={color} />
      </View>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
      {isTappable && (
        <MaterialIcons 
          name="chevron-right" 
          size={16} 
          color={Colors.textSecondary} 
          style={styles.chevron} 
        />
      )}
    </CardWrapper>
  );
};

const styles = StyleSheet.create({
  statCard: {
    width: "47%",
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  statIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  statValue: {
    fontFamily: "Inter_700Bold",
    fontSize: 28,
    color: Colors.text,
  },
  statLabel: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 4,
  },
  chevron: {
    position: "absolute",
    top: 16,
    right: 12,
  },
});
