import React from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { MaterialCommunityIcons, Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { useT } from "@/lib/language-context";

interface MotoCardProps {
  item: any;
  onPress: () => void;
  onDelete: () => void;
  marketplaceEnabled: boolean;
  getMotoDisplayName: (item: any) => string;
  getMotoTypeLabel: (v: string) => string;
  getStyleLabel: (v: string) => string;
}

export const MotoCard: React.FC<MotoCardProps> = ({
  item,
  onPress,
  onDelete,
  marketplaceEnabled,
  getMotoDisplayName,
  getMotoTypeLabel,
  getStyleLabel,
}) => {
  const t = useT();
  const displayName = getMotoDisplayName(item);

  return (
    <Pressable style={styles.card} onPress={onPress}>
      <View style={styles.cardHeader}>
        <MaterialCommunityIcons name="motorbike" size={28} color={Colors.accent} />
        <View style={styles.cardInfo}>
          <Text style={styles.motoName}>{displayName}</Text>
          <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap" }}>
            {item.isDefault && (
              <View style={styles.defaultBadge}>
                <Text style={styles.defaultBadgeText}>{t("garage.defaultBadge")}</Text>
              </View>
            )}
            {marketplaceEnabled && item.isForSale && (
              <View style={[styles.defaultBadge, { backgroundColor: "#FF980020" }]}>
                <Ionicons name="pricetag" size={10} color="#FF9800" />
                <Text style={[styles.defaultBadgeText, { color: "#FF9800" }]}> {t("garage.forSaleBadge")}</Text>
              </View>
            )}
          </View>
        </View>
        <Pressable onPress={onDelete} hitSlop={10}>
          <Ionicons name="trash-outline" size={20} color={Colors.accentRed} />
        </Pressable>
      </View>
      <View style={styles.cardDetails}>
        <View style={styles.detailChip}>
          <Ionicons name="speedometer-outline" size={14} color={Colors.textSecondary} />
          <Text style={styles.detailText}>{getMotoTypeLabel(item.motorcycleType)}</Text>
        </View>
        <View style={styles.detailChip}>
          <Ionicons name="flash-outline" size={14} color={Colors.textSecondary} />
          <Text style={styles.detailText}>{getStyleLabel(item.ridingStyle)}</Text>
        </View>
      </View>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: 12 },
  cardInfo: { flex: 1 },
  motoName: { fontSize: 18, fontFamily: "Inter_600SemiBold", color: Colors.text },
  defaultBadge: { backgroundColor: Colors.accent + "20", paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8, alignSelf: "flex-start", marginTop: 2 },
  defaultBadgeText: { fontSize: 11, fontFamily: "Inter_500Medium", color: Colors.accent },
  cardDetails: { flexDirection: "row", gap: 12, marginTop: 12 },
  detailChip: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: Colors.surfaceLight, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  detailText: { fontSize: 13, fontFamily: "Inter_400Regular", color: Colors.textSecondary },
});
