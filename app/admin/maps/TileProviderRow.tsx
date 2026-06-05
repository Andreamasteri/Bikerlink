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
  description?: string;
  category: TileCategory;
  cost: "free" | "api-key";
  maxZoom?: number;
  rendererCompat?: string[];
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

  const renderers = item.rendererCompat ?? [];
  const multiRenderer = renderers.length > 1;

  return (
    <TouchableOpacity
      style={[styles.row, item.isActive && styles.rowActive]}
      onPress={() => onSelect(item.id)}
      activeOpacity={0.7}
      disabled={isPending}
    >
      <TileThumbnail
        providerId={item.id}
        category={item.category}
        label={item.label}
        keyRequired={item.keyRequired}
        keyAvailable={item.keyAvailable}
      />
      <View style={styles.info}>
        <Text style={[styles.label, item.isActive && styles.labelActive]}>{item.label}</Text>
        {!!item.description && (
          <Text style={styles.description} numberOfLines={1}>{item.description}</Text>
        )}
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
          {item.maxZoom !== undefined && (
            <View style={styles.infoBadge}>
              <Text style={styles.infoBadgeText}>z{item.maxZoom}</Text>
            </View>
          )}
          {multiRenderer ? (
            <View style={[styles.infoBadge, styles.infoBadgeGreen]}>
              <Text style={[styles.infoBadgeText, styles.infoBadgeTextGreen]}>multi-renderer</Text>
            </View>
          ) : renderers.length === 1 ? (
            <View style={[styles.infoBadge, styles.infoBadgeGray]}>
              <Text style={[styles.infoBadgeText, styles.infoBadgeTextGray]}>solo {renderers[0]}</Text>
            </View>
          ) : null}
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
  label: { fontFamily: "Inter_500Medium", fontSize: 13, color: Colors.text, marginBottom: 2 },
  labelActive: { color: Colors.accent },
  description: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    color: Colors.textSecondary,
    marginBottom: 4,
  },
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
  infoBadge: {
    paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4,
    backgroundColor: "#6b728018",
  },
  infoBadgeGreen: { backgroundColor: "#22c55e18" },
  infoBadgeGray: { backgroundColor: "#6b728018" },
  infoBadgeText: { fontFamily: "Inter_400Regular", fontSize: 10, color: "#6b7280" },
  infoBadgeTextGreen: { color: "#22c55e" },
  infoBadgeTextGray: { color: "#6b7280" },
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
