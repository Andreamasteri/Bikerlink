import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { useQuery } from "@tanstack/react-query";
import { MaterialCommunityIcons, Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/colors";

interface MatchCount {
  id: number;
  key: string;
  label: string;
  count: number;
  status: "OK" | "WARN";
}

interface SchemaCheck {
  status: string;
  message: string;
  previousSnapshotAt?: string;
  diff?: {
    addedTables: string[];
    removedTables: string[];
    modifiedTables: string[];
  } | null;
}

interface PrefsCheck {
  status: string;
  message: string;
  missingFromDb: string[];
  unknownInDb: string[];
}

interface DistanceCheck {
  status: string;
  message: string;
  sampleCount: number;
  distancesKm: number[];
}

interface AdminGateCheck {
  status: string;
  key: string;
  value: string | null;
  message: string;
}

interface MatchHealthResponse {
  overallStatus: "OK" | "WARN" | "ERROR";
  checkedAt: string;
  summary: {
    totalMatchTypes: number;
    typesWithZeroResults: number;
    schemaStatus: string;
    prefsStatus: string;
    distanceStatus: string;
    adminGateStatus: string;
  };
  checks: {
    schema: SchemaCheck;
    matchCounts: MatchCount[];
    preferences: PrefsCheck;
    distanceSample: DistanceCheck;
    adminGate: AdminGateCheck;
  };
}

function statusColor(status: string): string {
  if (status === "OK") return Colors.success;
  if (status === "WARN") return Colors.warning;
  return Colors.error;
}

function StatusBadge({ status }: { status: string }) {
  return (
    <View style={[styles.badge, { backgroundColor: statusColor(status) + "22", borderColor: statusColor(status) }]}>
      <Text style={[styles.badgeText, { color: statusColor(status) }]}>{status}</Text>
    </View>
  );
}

function SectionCard({
  title,
  status,
  children,
}: {
  title: string;
  status: string;
  children: React.ReactNode;
}) {
  const [expanded, setExpanded] = useState(true);
  return (
    <View style={styles.sectionCard}>
      <TouchableOpacity style={styles.sectionHeader} onPress={() => setExpanded((v) => !v)} activeOpacity={0.7}>
        <Text style={styles.sectionTitle}>{title}</Text>
        <View style={styles.sectionHeaderRight}>
          <StatusBadge status={status} />
          <Ionicons
            name={expanded ? "chevron-up" : "chevron-down"}
            size={18}
            color={Colors.textSecondary}
            style={{ marginLeft: 8 }}
          />
        </View>
      </TouchableOpacity>
      {expanded && <View style={styles.sectionBody}>{children}</View>}
    </View>
  );
}

export default function MatchHealthScreen() {
  const insets = useSafeAreaInsets();
  const [refreshKey, setRefreshKey] = useState(0);

  const { data, isLoading, isFetching, error, refetch } = useQuery<MatchHealthResponse>({
    queryKey: ["/api/admin/match-health", refreshKey],
    staleTime: 0,
    retry: false,
  });

  const handleRunCheck = () => {
    setRefreshKey((k) => k + 1);
    refetch();
  };

  const formatDate = (iso: string) => {
    try {
      const d = new Date(iso);
      return d.toLocaleString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
    } catch {
      return iso;
    }
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 20 }]}
    >
      {/* Header card with overall status */}
      <View style={styles.overallCard}>
        <View style={styles.overallLeft}>
          <MaterialCommunityIcons name="heart-pulse" size={32} color={data ? statusColor(data.overallStatus) : Colors.textSecondary} />
          <View style={{ marginLeft: 14 }}>
            <Text style={styles.overallLabel}>Match Engine Health</Text>
            {data ? (
              <Text style={[styles.overallStatus, { color: statusColor(data.overallStatus) }]}>
                {data.overallStatus}
              </Text>
            ) : isLoading || isFetching ? (
              <Text style={styles.overallStatusMuted}>Controllo in corso…</Text>
            ) : error ? (
              <Text style={[styles.overallStatus, { color: Colors.error }]}>ERRORE</Text>
            ) : (
              <Text style={styles.overallStatusMuted}>—</Text>
            )}
          </View>
        </View>
        <TouchableOpacity
          style={[styles.runButton, (isLoading || isFetching) && styles.runButtonDisabled]}
          onPress={handleRunCheck}
          activeOpacity={0.7}
          disabled={isLoading || isFetching}
        >
          {isLoading || isFetching ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <>
              <MaterialCommunityIcons name="refresh" size={16} color="#fff" />
              <Text style={styles.runButtonText}>Run Check</Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      {data && (
        <Text style={styles.checkedAt}>
          Ultimo controllo: {formatDate(data.checkedAt)}
        </Text>
      )}

      {error && !data && (
        <View style={styles.errorBox}>
          <Ionicons name="alert-circle" size={20} color={Colors.error} />
          <Text style={styles.errorText}>
            Impossibile eseguire il controllo. Controlla che il backend sia raggiungibile.
          </Text>
        </View>
      )}

      {data && (
        <>
          {/* Summary row */}
          <View style={styles.summaryRow}>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryValue}>{data.summary.totalMatchTypes}</Text>
              <Text style={styles.summaryKey}>Tipi totali</Text>
            </View>
            <View style={styles.summaryDivider} />
            <View style={styles.summaryItem}>
              <Text style={[styles.summaryValue, data.summary.typesWithZeroResults > 0 ? { color: Colors.warning } : {}]}>
                {data.summary.typesWithZeroResults}
              </Text>
              <Text style={styles.summaryKey}>A zero</Text>
            </View>
            <View style={styles.summaryDivider} />
            <View style={styles.summaryItem}>
              <Text style={[styles.summaryValue, { color: statusColor(data.summary.schemaStatus) }]}>
                {data.summary.schemaStatus}
              </Text>
              <Text style={styles.summaryKey}>Schema</Text>
            </View>
            <View style={styles.summaryDivider} />
            <View style={styles.summaryItem}>
              <Text style={[styles.summaryValue, { color: statusColor(data.summary.adminGateStatus) }]}>
                {data.summary.adminGateStatus}
              </Text>
              <Text style={styles.summaryKey}>Gate</Text>
            </View>
          </View>

          {/* Match Counts */}
          <SectionCard title="17 Tipi di Match" status={data.checks.matchCounts.some(m => m.status === "WARN") ? "WARN" : "OK"}>
            {data.checks.matchCounts.map((mc) => (
              <View key={mc.key} style={styles.matchRow}>
                <View style={styles.matchRowLeft}>
                  {mc.status === "WARN" ? (
                    <MaterialCommunityIcons name="alert" size={14} color={Colors.warning} style={{ marginRight: 6 }} />
                  ) : (
                    <MaterialCommunityIcons name="check-circle" size={14} color={Colors.success} style={{ marginRight: 6 }} />
                  )}
                  <Text style={styles.matchLabel} numberOfLines={1}>
                    <Text style={styles.matchId}>{mc.id}. </Text>
                    {mc.label}
                  </Text>
                </View>
                <Text style={[styles.matchCount, mc.count === 0 ? { color: Colors.warning } : { color: Colors.success }]}>
                  {mc.count.toLocaleString("it-IT")}
                </Text>
              </View>
            ))}
          </SectionCard>

          {/* Schema */}
          <SectionCard title="Schema DB" status={data.checks.schema.status}>
            <Text style={styles.infoText}>{data.checks.schema.message}</Text>
            {data.checks.schema.previousSnapshotAt && (
              <Text style={styles.infoMuted}>Snapshot precedente: {formatDate(data.checks.schema.previousSnapshotAt)}</Text>
            )}
            {data.checks.schema.diff && (
              <View style={styles.diffBox}>
                {data.checks.schema.diff.addedTables.length > 0 && (
                  <View style={styles.diffRow}>
                    <Text style={[styles.diffLabel, { color: Colors.success }]}>+ Aggiunte</Text>
                    <Text style={styles.diffValue}>{data.checks.schema.diff.addedTables.join(", ")}</Text>
                  </View>
                )}
                {data.checks.schema.diff.removedTables.length > 0 && (
                  <View style={styles.diffRow}>
                    <Text style={[styles.diffLabel, { color: Colors.error }]}>− Rimosse</Text>
                    <Text style={styles.diffValue}>{data.checks.schema.diff.removedTables.join(", ")}</Text>
                  </View>
                )}
                {data.checks.schema.diff.modifiedTables.length > 0 && (
                  <View style={styles.diffRow}>
                    <Text style={[styles.diffLabel, { color: Colors.warning }]}>~ Modificate</Text>
                    <Text style={styles.diffValue}>{data.checks.schema.diff.modifiedTables.join(", ")}</Text>
                  </View>
                )}
              </View>
            )}
          </SectionCard>

          {/* Preferences alignment */}
          <SectionCard title="Preferenze Match" status={data.checks.preferences.status}>
            <Text style={styles.infoText}>{data.checks.preferences.message}</Text>
            {data.checks.preferences.missingFromDb.length > 0 && (
              <View style={styles.chipRow}>
                <Text style={styles.chipLabel}>Mancanti nel DB:</Text>
                {data.checks.preferences.missingFromDb.map((col) => (
                  <View key={col} style={[styles.chip, { backgroundColor: Colors.error + "22", borderColor: Colors.error }]}>
                    <Text style={[styles.chipText, { color: Colors.error }]}>{col}</Text>
                  </View>
                ))}
              </View>
            )}
            {data.checks.preferences.unknownInDb.length > 0 && (
              <View style={styles.chipRow}>
                <Text style={styles.chipLabel}>Extra nel DB:</Text>
                {data.checks.preferences.unknownInDb.map((col) => (
                  <View key={col} style={[styles.chip, { backgroundColor: Colors.warning + "22", borderColor: Colors.warning }]}>
                    <Text style={[styles.chipText, { color: Colors.warning }]}>{col}</Text>
                  </View>
                ))}
              </View>
            )}
          </SectionCard>

          {/* Distance sample */}
          <SectionCard title="Campione Distanze GPS" status={data.checks.distanceSample.status}>
            <Text style={styles.infoText}>{data.checks.distanceSample.message}</Text>
            {data.checks.distanceSample.distancesKm.length > 0 && (
              <View style={styles.distanceRow}>
                {data.checks.distanceSample.distancesKm.map((d, i) => (
                  <View key={i} style={styles.distancePill}>
                    <Text style={styles.distancePillText}>{d} km</Text>
                  </View>
                ))}
              </View>
            )}
          </SectionCard>

          {/* Admin gate */}
          <SectionCard title="Admin Gate" status={data.checks.adminGate.status}>
            <Text style={styles.infoText}>{data.checks.adminGate.message}</Text>
            <View style={styles.gateRow}>
              <Text style={styles.gateKey}>{data.checks.adminGate.key}</Text>
              <Text style={[styles.gateValue, {
                color: data.checks.adminGate.value === "false" ? Colors.error : Colors.success,
              }]}>
                {data.checks.adminGate.value ?? "true (default)"}
              </Text>
            </View>
          </SectionCard>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    padding: 16,
    gap: 12,
  },
  overallCard: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderColor: Colors.border,
  },
  overallLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  overallLabel: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
    color: Colors.textSecondary,
  },
  overallStatus: {
    fontFamily: "Inter_700Bold",
    fontSize: 22,
    marginTop: 2,
  },
  overallStatusMuted: {
    fontFamily: "Inter_700Bold",
    fontSize: 22,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  runButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: Colors.accent,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  runButtonDisabled: {
    opacity: 0.6,
  },
  runButtonText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
    color: "#fff",
  },
  checkedAt: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: Colors.textSecondary,
    textAlign: "center",
  },
  errorBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: Colors.error + "18",
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.error,
  },
  errorText: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: Colors.error,
    flex: 1,
  },
  summaryRow: {
    flexDirection: "row",
    backgroundColor: Colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingVertical: 14,
    alignItems: "center",
  },
  summaryItem: {
    flex: 1,
    alignItems: "center",
  },
  summaryValue: {
    fontFamily: "Inter_700Bold",
    fontSize: 20,
    color: Colors.text,
  },
  summaryKey: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  summaryDivider: {
    width: 1,
    height: 32,
    backgroundColor: Colors.border,
  },
  sectionCard: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: "hidden",
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 14,
  },
  sectionHeaderRight: {
    flexDirection: "row",
    alignItems: "center",
  },
  sectionTitle: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
    color: Colors.text,
  },
  sectionBody: {
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    padding: 14,
    gap: 8,
  },
  badge: {
    borderRadius: 6,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  badgeText: {
    fontFamily: "Inter_700Bold",
    fontSize: 11,
    letterSpacing: 0.5,
  },
  matchRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 5,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border + "55",
  },
  matchRowLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    marginRight: 8,
  },
  matchId: {
    color: Colors.textSecondary,
    fontFamily: "Inter_400Regular",
  },
  matchLabel: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: Colors.text,
    flex: 1,
  },
  matchCount: {
    fontFamily: "Inter_700Bold",
    fontSize: 14,
    minWidth: 48,
    textAlign: "right",
  },
  infoText: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: Colors.text,
  },
  infoMuted: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: Colors.textSecondary,
  },
  diffBox: {
    backgroundColor: Colors.background,
    borderRadius: 10,
    padding: 10,
    gap: 6,
    marginTop: 4,
  },
  diffRow: {
    flexDirection: "row",
    gap: 8,
    flexWrap: "wrap",
  },
  diffLabel: {
    fontFamily: "Inter_700Bold",
    fontSize: 12,
    minWidth: 70,
  },
  diffValue: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: Colors.text,
    flex: 1,
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 6,
    marginTop: 4,
  },
  chipLabel: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
    color: Colors.textSecondary,
  },
  chip: {
    borderRadius: 6,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  chipText: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
  },
  distanceRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 4,
  },
  distancePill: {
    backgroundColor: Colors.surfaceLight,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  distancePillText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
    color: Colors.text,
  },
  gateRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 4,
    backgroundColor: Colors.background,
    borderRadius: 10,
    padding: 10,
  },
  gateKey: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: Colors.textSecondary,
  },
  gateValue: {
    fontFamily: "Inter_700Bold",
    fontSize: 14,
  },
});
