import React from "react";
import { View, Text, StyleSheet, Image } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { useT } from "@/lib/language-context";

interface ClubHeaderProps {
  name: string;
  logoUrl?: string | null;
  brandName?: string | null;
  modelName?: string | null;
  clubType: string;
  isApproved: boolean;
  memberCount: number;
  activityScore: number;
  createdAt: string;
  region?: string | null;
  country?: string | null;
}

function countryFlag(code: string | null) {
  if (!code || code.length !== 2) return "";
  const base = 0x1F1E6;
  return (
    String.fromCodePoint(base + code.toUpperCase().charCodeAt(0) - 65) +
    String.fromCodePoint(base + code.toUpperCase().charCodeAt(1) - 65)
  );
}

export const ClubHeader: React.FC<ClubHeaderProps> = ({
  name,
  logoUrl,
  brandName,
  modelName,
  clubType,
  isApproved,
  memberCount,
  activityScore,
  createdAt,
  region,
  country,
}) => {
  const t = useT();
  const brandOrModel = [brandName, modelName].filter(Boolean).join(" ");
  const clubTypeLabel =
    clubType === "brand" ? "Marca" :
    clubType === "model" ? "Modello" : "Custom";
  
  const locationLabel = [
    region,
    country ? countryFlag(country) + " " + country.toUpperCase() : null
  ].filter(Boolean).join(" · ");

  return (
    <View>
      <View style={styles.heroCard}>
        <View style={styles.heroIconWrap}>
          {logoUrl ? (
            <Image 
              source={{ uri: logoUrl }} 
              style={{ width: 56, height: 56, borderRadius: 12 }} 
              resizeMode="contain" 
            />
          ) : (
            <Ionicons name="shield" size={40} color={Colors.accent} />
          )}
        </View>
        <Text style={styles.heroName}>{name}</Text>
        {brandOrModel ? <Text style={styles.heroSub}>{brandOrModel}</Text> : null}
        {locationLabel ? (
          <Text style={[styles.heroSub, { fontSize: 13, marginTop: 2 }]}>
            {locationLabel}
          </Text>
        ) : null}
        <View style={styles.heroBadges}>
          <View style={[styles.badge, { backgroundColor: Colors.accent + "22" }]}>
            <Text style={[styles.badgeText, { color: Colors.accent }]}>{clubTypeLabel}</Text>
          </View>
          {isApproved && (
            <View style={[styles.badge, { backgroundColor: Colors.success + "22" }]}>
              <Text style={[styles.badgeText, { color: Colors.success }]}>Approvato</Text>
            </View>
          )}
        </View>
      </View>

      <View style={styles.statsRow}>
        <View style={styles.statItem}>
          <Ionicons name="people" size={20} color={Colors.accent} />
          <Text style={styles.statValue}>{memberCount}</Text>
          <Text style={styles.statLabel}>Membri</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Ionicons name="flame" size={20} color="#F59E0B" />
          <Text style={styles.statValue}>{activityScore}</Text>
          <Text style={styles.statLabel}>{t("motoclub.activity")}</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Ionicons name="calendar-outline" size={20} color={Colors.textSecondary} />
          <Text style={styles.statValue}>
            {new Date(createdAt).toLocaleDateString("it-IT", { month: "short", year: "numeric" })}
          </Text>
          <Text style={styles.statLabel}>Creato</Text>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  heroCard: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 20,
    alignItems: "center",
    borderWidth: 1,
    borderColor: Colors.border,
    marginTop: 14,
    marginBottom: 12,
  },
  heroIconWrap: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: Colors.accent + "18",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  heroName: {
    fontFamily: "Inter_700Bold",
    fontSize: 22,
    color: Colors.text,
    textAlign: "center",
  },
  heroSub: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    color: Colors.textSecondary,
    marginTop: 4,
    textAlign: "center",
  },
  heroBadges: { flexDirection: "row", gap: 8, marginTop: 12 },
  badge: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20 },
  badgeText: { fontFamily: "Inter_600SemiBold", fontSize: 12 },
  statsRow: {
    flexDirection: "row",
    marginBottom: 16,
    backgroundColor: Colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: "hidden",
  },
  statItem: { flex: 1, alignItems: "center", paddingVertical: 16, gap: 4 },
  statDivider: { width: 1, backgroundColor: Colors.border },
  statValue: { fontFamily: "Inter_700Bold", fontSize: 16, color: Colors.text },
  statLabel: { fontFamily: "Inter_400Regular", fontSize: 11, color: Colors.textSecondary },
});
