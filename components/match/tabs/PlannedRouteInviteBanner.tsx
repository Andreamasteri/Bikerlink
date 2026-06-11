import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import { useT } from "@/lib/language-context";

interface PlannedRouteInviteBannerProps {
  count: number;
  onPress: () => void;
  onDismiss: () => void;
}

export function PlannedRouteInviteBanner({ count, onPress, onDismiss }: PlannedRouteInviteBannerProps) {
  const colors = useColors();
  const t = useT();

  if (count <= 0) return null;

  return (
    <TouchableOpacity
      style={[styles.banner, { backgroundColor: colors.accent + "18", borderColor: colors.accent + "40" }]}
      onPress={onPress}
      activeOpacity={0.8}
    >
      <View style={[styles.iconWrap, { backgroundColor: colors.accent + "25" }]}>
        <Ionicons name="map" size={18} color={colors.accent} />
      </View>

      <View style={styles.textBlock}>
        <Text style={[styles.title, { color: colors.text }]}>
          {t("match.giriBannerTitle")}
        </Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          {count === 1
            ? t("match.giriBannerSubtitleOne")
            : t("match.giriBannerSubtitleMany").replace("{n}", String(count))}
        </Text>
      </View>

      <View style={styles.rightRow}>
        <View style={[styles.countBadge, { backgroundColor: colors.accent }]}>
          <Text style={styles.countText}>{count}</Text>
        </View>
        <TouchableOpacity
          onPress={(e) => { e.stopPropagation(); onDismiss(); }}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="close" size={16} color={colors.textSecondary} />
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginHorizontal: 12,
    marginBottom: 6,
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  textBlock: {
    flex: 1,
    gap: 1,
  },
  title: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  subtitle: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    lineHeight: 16,
  },
  rightRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexShrink: 0,
  },
  countBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  countText: {
    fontSize: 11,
    fontFamily: "Inter_700Bold",
    color: "#fff",
  },
});
