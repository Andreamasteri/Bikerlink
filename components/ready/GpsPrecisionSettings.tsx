import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";

export function GpsPrecisionSettings({
  colors,
  gpsPrecisionExpanded,
  setGpsPrecisionExpanded,
  gpsOptions,
  gpsPrecision,
  setGpsPrecision,
  privacyMutation,
}: {
  colors: any;
  gpsPrecisionExpanded: boolean;
  setGpsPrecisionExpanded: React.Dispatch<React.SetStateAction<boolean>>;
  gpsOptions: { key: string; label: string; desc: string; icon: string }[];
  gpsPrecision: string;
  setGpsPrecision: (v: string) => void;
  privacyMutation: any;
}) {
  return (
    <View style={[styles.settingCard, { backgroundColor: colors.surface, marginTop: 80 }]}>
      <Pressable style={styles.accordionHeader} onPress={() => setGpsPrecisionExpanded(v => !v)}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Ionicons name="navigate-outline" size={18} color={Colors.accent} />
          <View style={{ flex: 1, paddingRight: 8 }}>
            <Text style={styles.accordionTitle}>Precisione GPS Tracking</Text>
            <Text style={styles.privacyRowDesc} numberOfLines={1}>
              {gpsOptions.find((o) => o.key === gpsPrecision)?.label ?? gpsPrecision}
            </Text>
          </View>
        </View>
        <Ionicons name={gpsPrecisionExpanded ? "chevron-up" : "chevron-down"} size={16} color={Colors.textSecondary} />
      </Pressable>
      {gpsPrecisionExpanded && (
        <View style={[styles.accordionContent, { paddingBottom: 8 }]}>
          {gpsOptions.map((opt) => {
            const isSelected = gpsPrecision === opt.key;
            return (
              <Pressable
                key={opt.key}
                style={[
                  styles.gpsOption,
                  {
                    borderColor: isSelected ? Colors.accent : Colors.border,
                    backgroundColor: isSelected ? Colors.accent + "14" : colors.background,
                  },
                ]}
                onPress={() => {
                  setGpsPrecision(opt.key);
                  privacyMutation.mutate({ gpsPrecision: opt.key });
                  setGpsPrecisionExpanded(false);
                }}
              >
                <Ionicons
                  name={opt.icon as any}
                  size={20}
                  color={isSelected ? Colors.accent : Colors.textSecondary}
                  style={{ marginRight: 12, flexShrink: 0 }}
                />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.gpsOptionLabel, { color: isSelected ? Colors.accent : Colors.text }]}>
                    {opt.label}
                  </Text>
                  <Text style={[styles.gpsOptionDesc, { color: Colors.textSecondary }]}>
                    {opt.desc}
                  </Text>
                </View>
                {isSelected && (
                  <Ionicons name="checkmark-circle" size={20} color={Colors.accent} style={{ marginLeft: 8, flexShrink: 0 }} />
                )}
              </Pressable>
            );
          })}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  settingCard: {
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 4,
  },
  accordionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 8,
  },
  accordionTitle: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    color: Colors.text,
  },
  privacyRowDesc: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
    marginTop: 2,
  },
  accordionContent: {
    marginTop: 4,
    gap: 8,
    paddingBottom: 4,
  },
  gpsOption: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
  },
  gpsOptionLabel: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    marginBottom: 2,
  },
  gpsOptionDesc: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    lineHeight: 16,
  },
});
