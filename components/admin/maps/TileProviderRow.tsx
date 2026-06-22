import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { TileThumbnail } from "./TileThumbnail";

export type TileCategory = "base" | "topo" | "satellite" | "overlay";
export type TilePlatform = "mobile" | "web" | "both";
export type ProviderStatusValue = "active" | "quota_exceeded" | "unreachable";

export interface ProviderItem {
  id: string;
  label: string;
  description?: string;
  category: TileCategory;
  cost: "free" | "api-key";
  tierLimited?: boolean;
  maxZoom?: number;
  rendererCompat?: string[];
  keyRequired: boolean;
  keyAvailable: boolean;
  isActive: boolean;
  status?: ProviderStatusValue;
  platform: TilePlatform;
  archived: boolean;
  note?: string;
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
  const isOverlay = item.category === "overlay";
  const isDisabled = item.archived || isOverlay;

  return (
    <TouchableOpacity
      style={[styles.row, item.isActive && styles.rowActive, isDisabled && styles.rowArchived]}
      onPress={() => !isDisabled && onSelect(item.id)}
      activeOpacity={isDisabled ? 1 : 0.7}
      disabled={isPending || isDisabled}
    >
      <TileThumbnail
        providerId={item.id}
        category={item.category}
        label={item.label}
        keyRequired={item.keyRequired}
        keyAvailable={item.keyAvailable}
      />
      <View style={[styles.info, isDisabled && styles.infoArchived]}>
        <Text style={[styles.label, item.isActive && styles.labelActive, isDisabled && styles.labelArchived]}>
          {item.label}
        </Text>
        {!!item.description && (
          <Text style={[styles.description, isDisabled && styles.descriptionArchived]} numberOfLines={1}>
            {item.description}
          </Text>
        )}
        {!!item.note && (
          <Text style={styles.note} numberOfLines={1}>{item.note}</Text>
        )}
        <View style={styles.badges}>
          <View style={[styles.catBadge, { backgroundColor: catColor + (isDisabled ? "10" : "20") }]}>
            <Text style={[styles.catText, { color: isDisabled ? catColor + "70" : catColor }]}>{item.category}</Text>
          </View>
          {item.archived && (
            <View style={styles.archivedBadge}>
              <Ionicons name="archive-outline" size={10} color="#6b7280" />
              <Text style={styles.archivedText}>Archiviato</Text>
            </View>
          )}
          {isOverlay && !item.archived && (
            <View style={styles.overlayBadge}>
              <Ionicons name="layers-outline" size={10} color="#a855f7" />
              <Text style={styles.overlayText}>Solo overlay</Text>
            </View>
          )}
          {item.tierLimited && !isDisabled && (
            <View style={styles.tierBadge}>
              <Ionicons name="layers-outline" size={10} color="#6b7280" />
              <Text style={styles.tierText}>Tier a pagamento</Text>
            </View>
          )}
          {item.keyRequired && !isDisabled && (
            <View style={[styles.apiBadge, !item.keyAvailable && styles.apiBadgeMissing]}>
              <Ionicons
                name={item.keyAvailable ? "key-outline" : "warning-outline"}
                size={10}
                color={item.keyAvailable ? "#f59e0b" : "#ef4444"}
              />
              <Text style={[styles.apiText, !item.keyAvailable && styles.apiTextMissing]}>
                {item.keyAvailable ? "API Key richiesta" : "key missing"}
              </Text>
            </View>
          )}
          {item.keyRequired && isDisabled && (
            <View style={styles.apiBadgeGray}>
              <Ionicons name="key-outline" size={10} color="#6b7280" />
              <Text style={styles.apiBadgeGrayText}>API Key richiesta</Text>
            </View>
          )}
          {item.maxZoom !== undefined && !isDisabled && (
            <View style={styles.infoBadge}>
              <Text style={styles.infoBadgeText}>z{item.maxZoom}</Text>
            </View>
          )}
          {!isDisabled && multiRenderer ? (
            <View style={[styles.infoBadge, styles.infoBadgeGreen]}>
              <Text style={[styles.infoBadgeText, styles.infoBadgeTextGreen]}>multi-renderer</Text>
            </View>
          ) : !isDisabled && renderers.length === 1 ? (
            <View style={[styles.infoBadge, styles.infoBadgeGray]}>
              <Text style={[styles.infoBadgeText, styles.infoBadgeTextGray]}>solo {renderers[0]}</Text>
            </View>
          ) : null}
          {showStatusBadge && !isDisabled && (
            <View style={[styles.statusBadge, { backgroundColor: statusCfg.color + "20" }]}>
              <Ionicons name={statusCfg.icon} size={10} color={statusCfg.color} />
              <Text style={[styles.statusText, { color: statusCfg.color }]}>{statusCfg.label}</Text>
            </View>
          )}
        </View>
      </View>
      {item.isActive && !isDisabled && (
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
  rowArchived: { borderColor: Colors.border + "60", backgroundColor: Colors.background + "80", opacity: 0.6 },
  info: { flex: 1 },
  infoArchived: { opacity: 0.8 },
  label: { fontFamily: "Inter_500Medium", fontSize: 13, color: Colors.text, marginBottom: 2 },
  labelActive: { color: Colors.accent },
  labelArchived: { color: Colors.textSecondary },
  description: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    color: Colors.textSecondary,
    marginBottom: 4,
  },
  descriptionArchived: { color: Colors.textSecondary + "80" },
  note: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    color: "#f59e0b",
    marginBottom: 4,
    fontStyle: "italic",
  },
  badges: { flexDirection: "row", gap: 6, flexWrap: "wrap" },
  catBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  catText: { fontFamily: "Inter_500Medium", fontSize: 10 },
  apiBadge: {
    flexDirection: "row", alignItems: "center", gap: 3,
    paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4,
    backgroundColor: "#f59e0b20",
  },
  apiBadgeMissing: { backgroundColor: "#ef444420" },
  apiText: { fontFamily: "Inter_400Regular", fontSize: 10, color: "#f59e0b" },
  apiTextMissing: { color: "#ef4444" },
  apiBadgeGray: {
    flexDirection: "row", alignItems: "center", gap: 3,
    paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4,
    backgroundColor: "#6b728015",
  },
  apiBadgeGrayText: { fontFamily: "Inter_400Regular", fontSize: 10, color: "#6b7280" },
  archivedBadge: {
    flexDirection: "row", alignItems: "center", gap: 3,
    paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4,
    backgroundColor: "#6b728015",
  },
  archivedText: { fontFamily: "Inter_400Regular", fontSize: 10, color: "#6b7280" },
  overlayBadge: {
    flexDirection: "row", alignItems: "center", gap: 3,
    paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4,
    backgroundColor: "#a855f715",
    borderWidth: 1,
    borderColor: "#a855f730",
  },
  overlayText: { fontFamily: "Inter_400Regular", fontSize: 10, color: "#a855f7" },
  tierBadge: {
    flexDirection: "row", alignItems: "center", gap: 3,
    paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4,
    backgroundColor: "#6b728018",
    borderWidth: 1,
    borderColor: "#6b728030",
  },
  tierText: { fontFamily: "Inter_400Regular", fontSize: 10, color: "#6b7280" },
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
