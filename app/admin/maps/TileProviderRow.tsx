import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { TileThumbnail } from "./TileThumbnail";

export type TileCategory = "base" | "topo" | "satellite" | "overlay";
export type ProviderStatusValue = "active" | "quota_exceeded" | "unreachable";

export interface ProviderItem {
  id: string;
  label: string;
  category: TileCategory;
  cost: "free" | "api-key";
  keyRequired: boolean;
  keyAvailable: boolean;
  isActive: boolean;
  status?: ProviderStatusValue;
}

const CATEGORY_COLORS: Record<TileCategory, string> = {
  base: "#3b82f6",
  topo: "#22c55e",
  satellite: "#f97316",
  overlay: "#a855f7",
};

const STATUS_CONFIG: Record<ProviderStatusValue, { label: string; color: string; icon: "checkmark-circle-outline" | "alert-circle-outline" | "cloud-offline-outline" }> = {
  active: { label: "Attivo", color: "#22c55e", icon: "checkmark-circle-outline" },
  quota_exceeded: { label: "Quota esaurita", color: "#f59e0b", icon: "alert-circle-outline" },
  unreachable: { label: "Irraggiungibile", color: "#ef4444", icon: "cloud-offline-outline" },
};

interface Props {
  item: ProviderItem;
  onSelect: (id: string) => void;
  isPending: boolean;
}

export function TileProviderRow({ item, onSelect, isPending }: Props) {
  const catColor = CATEGORY_COLORS[item.category] ?? "#6b7280";
  const statusKey = (item.status ?? "active") as ProviderStatusValue;
  const statusCfg = STATUS_CONFIG[statusKey] ?? STATUS_CONFIG.active;
  const showStatusBadge = statusKey !== "active" || item.isActive;

  return (
    <TouchableOpacity
      style={[styles.row, item.isActive && styles.rowActive]}
      onPress={() => onSelect(item.id)}
      activeOpacity={0.7}
      disabled={isPending}
    >
      <TileThumbnail
        providerId={item.id}
        keyRequired={item.keyRequired}
        keyAvailable={item.keyAvailable}
      />
      <View style={styles.info}>
        <Text style={[styles.label, item.isActive && styles.labelActive]}>{item.label}</Text>
        <View style={styles.badges}>
          <View style={[styles.catBadge, { backgroundColor: catColor + "20" }]}>
            <Text style={[styles.catText, { color: catColor }]}>{item.category}</Text>
          </View>
          {item.keyRequired && (
            <View style={[styles.keyBadge, !item.keyAvailable && styles.keyBadgeMissing]}>
              <Ionicons
                name={item.keyAvailable ? "key-outline" : "warning-outline"}
                size={10}
                color={item.keyAvailable ? "#f59e0b" : "#ef4444"}
              />
              <Text style={[styles.keyText, !item.keyAvailable && styles.keyTextMissing]}>
                {item.keyAvailable ? "API key" : "key missing"}
              </Text>
            </View>
          )}
          {showStatusBadge && (
            <View style={[styles.statusBadge, { backgroundColor: statusCfg.color + "20" }]}>
              <Ionicons name={statusCfg.icon} size={10} color={statusCfg.color} />
              <Text style={[styles.statusText, { color: statusCfg.color }]}>{statusCfg.label}</Text>
            </View>
          )}
        </View>
      </View>
      {item.isActive && (
        <Ionicons name="checkmark-circle" size={20} color={Colors.accent} style={styles.check} />
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.background,
    marginBottom: 6,
  },
  rowActive: { borderColor: Colors.accent, backgroundColor: Colors.accent + "11" },
  info: { flex: 1 },
  label: { fontFamily: "Inter_500Medium", fontSize: 13, color: Colors.text, marginBottom: 4 },
  labelActive: { color: Colors.accent },
  badges: { flexDirection: "row", gap: 6, flexWrap: "wrap" },
  catBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  catText: { fontFamily: "Inter_500Medium", fontSize: 10 },
  keyBadge: {
    flexDirection: "row", alignItems: "center", gap: 3,
    paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4,
    backgroundColor: "#f59e0b20",
  },
  keyBadgeMissing: { backgroundColor: "#ef444420" },
  keyText: { fontFamily: "Inter_400Regular", fontSize: 10, color: "#f59e0b" },
  keyTextMissing: { color: "#ef4444" },
  check: { marginLeft: 4 },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  statusText: { fontFamily: "Inter_400Regular", fontSize: 10 },
});
