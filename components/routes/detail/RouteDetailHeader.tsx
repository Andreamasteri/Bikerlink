import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { getCurrentLocale } from "@/lib/i18n";

type Visibility = "public" | "friends" | "private";

interface RouteDetailHeaderProps {
  title: string;
  description: string | null;
  creatorNickname: string;
  createdAt: string;
  totalDistanceKm: number | null;
  visibility: Visibility;
  isPublic: boolean;
}

export default function RouteDetailHeader({
  title,
  description,
  creatorNickname,
  createdAt,
  totalDistanceKm,
  visibility,
  isPublic,
}: RouteDetailHeaderProps) {
  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString(getCurrentLocale(), {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  };

  const vis: Visibility = visibility ?? (isPublic ? "public" : "private");

  return (
    <View style={styles.header}>
      <View style={styles.titleRow}>
        <Text style={styles.title}>{title}</Text>
        {vis === "public" && (
          <View style={[styles.badge, { backgroundColor: Colors.success }]}>
            <MaterialCommunityIcons name="earth" size={12} color="#fff" />
            <Text style={styles.badgeText}>Pubblico</Text>
          </View>
        )}
        {vis === "friends" && (
          <View style={[styles.badge, { backgroundColor: "#7C83FD" }]}>
            <MaterialCommunityIcons name="account-group" size={12} color="#fff" />
            <Text style={styles.badgeText}>Amici</Text>
          </View>
        )}
        {vis === "private" && (
          <View style={[styles.badge, { backgroundColor: Colors.surfaceLight }]}>
            <MaterialCommunityIcons name="lock" size={12} color={Colors.textSecondary} />
            <Text style={[styles.badgeText, { color: Colors.textSecondary }]}>Privato</Text>
          </View>
        )}
      </View>

      {description ? (
        <Text style={styles.description}>{description}</Text>
      ) : null}

      <View style={styles.metaRow}>
        <View style={styles.metaItem}>
          <MaterialCommunityIcons name="account" size={16} color={Colors.textSecondary} />
          <Text style={styles.metaText}>{creatorNickname}</Text>
        </View>
        <View style={styles.metaItem}>
          <MaterialCommunityIcons name="calendar" size={16} color={Colors.textSecondary} />
          <Text style={styles.metaText}>{formatDate(createdAt)}</Text>
        </View>
        {(totalDistanceKm ?? 0) > 0 && (
          <View style={styles.metaItem}>
            <MaterialCommunityIcons name="road-variant" size={16} color={Colors.textSecondary} />
            <Text style={styles.metaText}>
              ~{(totalDistanceKm ?? 0).toFixed(1)} km
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flexWrap: "wrap",
  },
  title: {
    color: Colors.text,
    fontSize: 22,
    fontWeight: "700" as const,
    flex: 1,
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  badgeText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "600" as const,
  },
  description: {
    color: Colors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 10,
  },
  metaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 16,
    marginTop: 14,
  },
  metaItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  metaText: {
    color: Colors.textSecondary,
    fontSize: 13,
  },
});
