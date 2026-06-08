import React, { useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { getApiUrl } from "@/lib/query-client";

interface GapField {
  field: string;
  label: string;
  description: string;
  filled: boolean;
  importance: "critical" | "high" | "medium" | "low";
}

interface ProfileGapsResponse {
  gaps: GapField[];
  missingCount: number;
  criticalMissing: number;
  userType: string;
}

interface ProfileGapsCardProps {
  userId: string;
  totalMatches: number;
  onEditUser?: () => void;
}

function importanceLabel(imp: string): string {
  switch (imp) {
    case "critical": return "critico";
    case "high": return "alto";
    case "medium": return "medio";
    default: return "basso";
  }
}

function importanceColor(imp: string): string {
  switch (imp) {
    case "critical": return Colors.error;
    case "high": return Colors.warning;
    case "medium": return Colors.accent;
    default: return Colors.textSecondary;
  }
}

export const ProfileGapsCard: React.FC<ProfileGapsCardProps> = ({ userId, totalMatches, onEditUser }) => {
  const [expanded, setExpanded] = useState(totalMatches === 0);

  const { data, isLoading, isError } = useQuery<ProfileGapsResponse>({
    queryKey: ["/api/admin/users", userId, "profile-gaps"],
    queryFn: async () => {
      const base = getApiUrl();
      const url = new URL(`/api/admin/users/${userId}/profile-gaps`, base);
      const res = await fetch(url.toString(), { credentials: "include" });
      if (!res.ok) throw new Error("Errore caricamento gaps");
      return res.json();
    },
    enabled: !!userId,
    staleTime: 30000,
  });

  if (isError) return null;

  const missingCount = data?.missingCount ?? 0;
  const criticalMissing = data?.criticalMissing ?? 0;
  const allFilled = missingCount === 0;

  return (
    <View style={styles.wrapper}>
      <TouchableOpacity style={styles.header} onPress={() => setExpanded((v) => !v)} activeOpacity={0.7}>
        <View style={styles.headerLeft}>
          <MaterialCommunityIcons
            name="account-check-outline"
            size={18}
            color={allFilled ? Colors.success : criticalMissing > 0 ? Colors.error : Colors.warning}
          />
          <Text style={styles.headerTitle}>
            {allFilled ? "Profilo completo" : "Profilo incompleto"}
          </Text>
        </View>
        <View style={styles.headerRight}>
          {isLoading ? (
            <ActivityIndicator size="small" color={Colors.accent} />
          ) : (
            <>
              {!allFilled && (
                <View style={[styles.missingBadge, criticalMissing > 0 ? styles.missingBadgeCritical : styles.missingBadgeWarn]}>
                  <Text style={[styles.missingBadgeText, criticalMissing > 0 ? styles.missingBadgeTextCritical : styles.missingBadgeTextWarn]}>
                    {missingCount} mancanti
                  </Text>
                </View>
              )}
              {allFilled && (
                <View style={styles.okBadge}>
                  <Text style={styles.okBadgeText}>Completo</Text>
                </View>
              )}
              {onEditUser && (
                <TouchableOpacity
                  style={styles.editBtn}
                  onPress={(e) => {
                    e.stopPropagation();
                    onEditUser();
                  }}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons name="pencil-outline" size={15} color={Colors.accent} />
                  <Text style={styles.editBtnText}>Modifica</Text>
                </TouchableOpacity>
              )}
              <Ionicons
                name={expanded ? "chevron-up" : "chevron-down"}
                size={16}
                color={Colors.textSecondary}
              />
            </>
          )}
        </View>
      </TouchableOpacity>

      {expanded && data && (
        <View style={styles.body}>
          {criticalMissing > 0 && (
            <View style={styles.alertBanner}>
              <Ionicons name="warning-outline" size={14} color={Colors.error} />
              <Text style={styles.alertBannerText}>
                {criticalMissing} campo{criticalMissing !== 1 ? " critici mancanti" : " critico mancante"} — il matching potrebbe non funzionare
              </Text>
            </View>
          )}

          {data.gaps.map((gap) => (
            <TouchableOpacity
              key={gap.field}
              style={styles.row}
              onPress={!gap.filled && onEditUser ? onEditUser : undefined}
              activeOpacity={!gap.filled && onEditUser ? 0.6 : 1}
            >
              <View style={styles.rowIcon}>
                <Ionicons
                  name={gap.filled ? "checkmark-circle" : "close-circle"}
                  size={18}
                  color={gap.filled ? Colors.success : Colors.error}
                />
              </View>
              <View style={styles.rowContent}>
                <View style={styles.rowTitleRow}>
                  <Text style={[styles.rowLabel, !gap.filled && { color: Colors.error }]}>
                    {gap.label}
                  </Text>
                  {!gap.filled && (
                    <View style={[styles.importancePill, { backgroundColor: importanceColor(gap.importance) + "22" }]}>
                      <Text style={[styles.importancePillText, { color: importanceColor(gap.importance) }]}>
                        {importanceLabel(gap.importance)}
                      </Text>
                    </View>
                  )}
                </View>
                <Text style={styles.rowDesc}>{gap.description}</Text>
              </View>
              {!gap.filled && onEditUser && (
                <Ionicons name="chevron-forward" size={14} color={Colors.textSecondary} style={styles.rowArrow} />
              )}
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    marginHorizontal: 16,
    marginBottom: 16,
    backgroundColor: Colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: "hidden",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  headerTitle: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
    color: Colors.text,
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  editBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: Colors.accent + "18",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  editBtnText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 11,
    color: Colors.accent,
  },
  missingBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  missingBadgeCritical: {
    backgroundColor: Colors.error + "22",
  },
  missingBadgeWarn: {
    backgroundColor: Colors.warning + "22",
  },
  missingBadgeText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 11,
  },
  missingBadgeTextCritical: {
    color: Colors.error,
  },
  missingBadgeTextWarn: {
    color: Colors.warning,
  },
  okBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    backgroundColor: Colors.success + "22",
  },
  okBadgeText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 11,
    color: Colors.success,
  },
  body: {
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingBottom: 8,
  },
  alertBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: Colors.error + "18",
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginBottom: 4,
  },
  alertBannerText: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: Colors.error,
    flex: 1,
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingHorizontal: 14,
    paddingVertical: 8,
    gap: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  rowIcon: {
    marginTop: 1,
  },
  rowContent: {
    flex: 1,
    gap: 2,
  },
  rowTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexWrap: "wrap",
  },
  rowLabel: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
    color: Colors.textSecondary,
  },
  importancePill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  importancePillText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 10,
  },
  rowDesc: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    color: Colors.textSecondary,
    opacity: 0.75,
  },
  rowArrow: {
    marginTop: 2,
    alignSelf: "center",
  },
});
