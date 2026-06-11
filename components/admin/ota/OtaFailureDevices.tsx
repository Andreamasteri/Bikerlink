import React, { useState } from "react";
import { View, Text, TouchableOpacity, ActivityIndicator, StyleSheet } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useTheme } from "@/lib/theme-context";

interface FailureDevice {
  deviceModel: string | null;
  count: number;
}

interface Props {
  releaseId: string;
}

export default function OtaFailureDevices({ releaseId }: Props) {
  const { colors } = useTheme();
  const [expanded, setExpanded] = useState(false);

  const { data, isLoading } = useQuery<{ devices: FailureDevice[] }>({
    queryKey: [`/api/admin/ota/${releaseId}/failure-devices`],
    enabled: expanded,
  });

  return (
    <View style={[styles.box, { backgroundColor: colors.surfaceLight, borderColor: colors.error + "55" }]}>
      <TouchableOpacity onPress={() => setExpanded((v) => !v)} style={styles.header} activeOpacity={0.7}>
        <Text style={[styles.title, { color: colors.error }]}>⚠ Dispositivi con fallimento</Text>
        <Text style={[styles.chevron, { color: colors.textSecondary }]}>{expanded ? "▲" : "▼"}</Text>
      </TouchableOpacity>

      {expanded && (
        <View style={styles.body}>
          {isLoading && <ActivityIndicator size="small" color={colors.error} style={{ marginTop: 8 }} />}
          {!isLoading && data && data.devices.length === 0 && (
            <Text style={[styles.empty, { color: colors.textSecondary }]}>Nessun dato disponibile</Text>
          )}
          {!isLoading && data && data.devices.map((d, i) => (
            <View key={i} style={[styles.row, { borderBottomColor: colors.border }]}>
              <Text style={[styles.model, { color: colors.text }]}>
                {d.deviceModel ?? "Modello sconosciuto"}
              </Text>
              <View style={[styles.countBadge, { backgroundColor: colors.error + "22" }]}>
                <Text style={[styles.countText, { color: colors.error }]}>
                  {d.count} {d.count === 1 ? "fallimento" : "fallimenti"}
                </Text>
              </View>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    borderRadius: 6,
    borderWidth: 1,
    marginTop: 8,
    overflow: "hidden",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  title: { fontSize: 12, fontWeight: "700" as const },
  chevron: { fontSize: 11 },
  body: { paddingHorizontal: 10, paddingBottom: 8 },
  empty: { fontSize: 12, paddingVertical: 6 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 7,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  model: { fontSize: 13, flex: 1, marginRight: 8 },
  countBadge: { borderRadius: 4, paddingHorizontal: 7, paddingVertical: 3 },
  countText: { fontSize: 11, fontWeight: "700" as const },
});
