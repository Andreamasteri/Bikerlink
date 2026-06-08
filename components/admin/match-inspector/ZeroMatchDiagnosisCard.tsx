import React, { useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { getApiUrl } from "@/lib/query-client";

interface DiagnosisCause {
  id: string;
  severity: "critical" | "warn" | "info";
  title: string;
  description: string;
  action: string;
}

interface DiagnosisResponse {
  causes: DiagnosisCause[];
  engineGateOn: boolean;
  hasLocation: boolean;
  isAvailable: boolean;
  compatibleNearby: number;
}

interface ZeroMatchDiagnosisCardProps {
  userId: string;
}

function severityColor(severity: DiagnosisCause["severity"]): string {
  switch (severity) {
    case "critical": return Colors.error;
    case "warn": return Colors.warning;
    default: return Colors.accent;
  }
}

function severityIcon(severity: DiagnosisCause["severity"]): keyof typeof Ionicons.glyphMap {
  switch (severity) {
    case "critical": return "close-circle";
    case "warn": return "warning";
    default: return "information-circle";
  }
}

function severityLabel(severity: DiagnosisCause["severity"]): string {
  switch (severity) {
    case "critical": return "Critico";
    case "warn": return "Attenzione";
    default: return "Info";
  }
}

export const ZeroMatchDiagnosisCard: React.FC<ZeroMatchDiagnosisCardProps> = ({ userId }) => {
  const [expanded, setExpanded] = useState(true);

  const { data, isLoading, isError } = useQuery<DiagnosisResponse>({
    queryKey: ["/api/admin/users", userId, "zero-match-diagnosis"],
    queryFn: async () => {
      const base = getApiUrl();
      const url = new URL(`/api/admin/users/${userId}/zero-match-diagnosis`, base);
      const res = await fetch(url.toString(), { credentials: "include" });
      if (!res.ok) throw new Error("Errore caricamento diagnosi");
      return res.json();
    },
    enabled: !!userId,
    staleTime: 30000,
  });

  if (isError) return null;

  const causes = data?.causes ?? [];
  const criticalCount = causes.filter((c) => c.severity === "critical").length;
  const warnCount = causes.filter((c) => c.severity === "warn").length;

  const headerColor =
    criticalCount > 0 ? Colors.error :
    warnCount > 0 ? Colors.warning :
    Colors.accent;

  return (
    <View style={styles.wrapper}>
      <TouchableOpacity
        style={styles.header}
        onPress={() => setExpanded((v) => !v)}
        activeOpacity={0.7}
      >
        <View style={styles.headerLeft}>
          <MaterialCommunityIcons
            name="magnify-scan"
            size={18}
            color={headerColor}
          />
          <Text style={styles.headerTitle}>Possibili cause dei 0 match</Text>
        </View>
        <View style={styles.headerRight}>
          {isLoading ? (
            <ActivityIndicator size="small" color={Colors.accent} />
          ) : (
            <>
              {criticalCount > 0 && (
                <View style={styles.criticalBadge}>
                  <Text style={styles.criticalBadgeText}>{criticalCount} critico/i</Text>
                </View>
              )}
              {criticalCount === 0 && warnCount > 0 && (
                <View style={styles.warnBadge}>
                  <Text style={styles.warnBadgeText}>{warnCount} warn</Text>
                </View>
              )}
              {causes.length === 0 && !isLoading && (
                <View style={styles.okBadge}>
                  <Text style={styles.okBadgeText}>Nessun problema noto</Text>
                </View>
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

      {expanded && (
        <View style={styles.body}>
          {isLoading ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator size="small" color={Colors.accent} />
              <Text style={styles.loadingText}>Analisi in corso…</Text>
            </View>
          ) : causes.length === 0 ? (
            <View style={styles.emptyRow}>
              <Ionicons name="checkmark-circle" size={18} color={Colors.success} />
              <Text style={styles.emptyText}>
                Nessun problema rilevato automaticamente. Prova a forzare un ricalcolo.
              </Text>
            </View>
          ) : (
            causes.map((cause, idx) => {
              const color = severityColor(cause.severity);
              return (
                <View
                  key={cause.id}
                  style={[
                    styles.causeRow,
                    idx < causes.length - 1 && styles.causeRowBorder,
                  ]}
                >
                  <View style={styles.causeIconCol}>
                    <Ionicons name={severityIcon(cause.severity)} size={20} color={color} />
                  </View>
                  <View style={styles.causeContent}>
                    <View style={styles.causeTitleRow}>
                      <Text style={[styles.causeTitle, { color }]} numberOfLines={2}>
                        {cause.title}
                      </Text>
                      <View style={[styles.severityPill, { backgroundColor: color + "22" }]}>
                        <Text style={[styles.severityPillText, { color }]}>
                          {severityLabel(cause.severity)}
                        </Text>
                      </View>
                    </View>
                    <Text style={styles.causeDesc}>{cause.description}</Text>
                    <View style={styles.actionRow}>
                      <Ionicons name="arrow-forward-circle-outline" size={13} color={Colors.accent} />
                      <Text style={styles.actionText}>{cause.action}</Text>
                    </View>
                  </View>
                </View>
              );
            })
          )}
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
    flex: 1,
  },
  headerTitle: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
    color: Colors.text,
    flexShrink: 1,
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  criticalBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    backgroundColor: Colors.error + "22",
  },
  criticalBadgeText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 11,
    color: Colors.error,
  },
  warnBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    backgroundColor: Colors.warning + "22",
  },
  warnBadgeText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 11,
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
  },
  loadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 16,
  },
  loadingText: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: Colors.textSecondary,
  },
  emptyRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    padding: 14,
  },
  emptyText: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: Colors.textSecondary,
    flex: 1,
  },
  causeRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 10,
  },
  causeRowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  causeIconCol: {
    marginTop: 1,
  },
  causeContent: {
    flex: 1,
    gap: 4,
  },
  causeTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexWrap: "wrap",
  },
  causeTitle: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
    flexShrink: 1,
  },
  severityPill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  severityPillText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 10,
  },
  causeDesc: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: Colors.textSecondary,
    lineHeight: 17,
  },
  actionRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 4,
    marginTop: 2,
  },
  actionText: {
    fontFamily: "Inter_500Medium",
    fontSize: 11,
    color: Colors.accent,
    flex: 1,
    lineHeight: 16,
  },
});
