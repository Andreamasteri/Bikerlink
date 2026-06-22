import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { useT } from "@/lib/language-context";
import { SensorDefinition } from "@/components/admin/sensors/sensor-screen";

interface SensorScreenHeaderProps {
  def: SensorDefinition;
}

function PlatformBadge({ platform }: { platform: "android" | "ios" | "cross" }) {
  const COLOR = platform === "android" ? "#3ddc84" : platform === "ios" ? "#007aff" : Colors.textSecondary;
  const LABEL = platform === "android" ? "Solo Android" : platform === "ios" ? "Solo iOS" : "Android · iOS";
  return (
    <View style={[ss.platformBadge, { backgroundColor: COLOR + "22" }]}>
      <Text style={[ss.platformBadgeText, { color: COLOR }]}>{LABEL}</Text>
    </View>
  );
}

export const SensorScreenHeader: React.FC<SensorScreenHeaderProps> = ({ def }) => {
  const t = useT();
  
  return (
    <>
      <View style={ss.headerCard}>
        <Ionicons name="hardware-chip-outline" size={24} color={Colors.accent} />
        <View style={{ flex: 1 }}>
          <Text style={ss.sensorName}>{def.name}</Text>
          <PlatformBadge platform={def.platform} />
        </View>
      </View>

      {def.platform !== "cross" && (
        <View style={ss.platformWarning}>
          <Ionicons name="warning-outline" size={16} color={Colors.warning} />
          <Text style={ss.platformWarningText}>
            {def.platform === "android"
              ? t("admin.sensorAvailAndroid")
              : t("admin.sensorAvailIos")}
          </Text>
        </View>
      )}
    </>
  );
};

const ss = StyleSheet.create({
  headerCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 14,
  },
  sensorName: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    color: Colors.text,
    marginBottom: 4,
  },
  platformBadge: {
    alignSelf: "flex-start",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 20,
  },
  platformBadgeText: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
  },
  platformWarning: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    backgroundColor: Colors.warning + "11",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.warning + "33",
    padding: 10,
  },
  platformWarningText: {
    flex: 1,
    fontSize: 12,
    color: Colors.warning,
    fontFamily: "Inter_400Regular",
    lineHeight: 17,
  },
});
