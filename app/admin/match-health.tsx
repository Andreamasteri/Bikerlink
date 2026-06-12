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
import { MaterialCommunityIcons, Ionicons, MaterialIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/colors";
import { getApiUrl } from "@/lib/query-client";
import { copyLogToClipboard } from "@/lib/copyAdminLog";
import { MatchCountsSection } from "@/components/admin/match-health/MatchCountsSection";
import { SchemaSection } from "@/components/admin/match-health/SchemaSection";
import { ZeroMatchKpiCard, type ZeroMatchSnapshotPoint } from "@/components/admin/match-health/ZeroMatchKpiCard";

interface MatchCount {
  id: number;
  key: string;
  label: string;
  count: number;
  sourceCount?: number;
  status: "OK" | "WARN" | "NO_DATA" | "INACTIVE";
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
    typesAnomalous?: number;
    typesNoData?: number;
    typesInactive?: number;
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

interface MatchSummaryResponse {
  total: number;
  zeroMatchCount: number;
}

export default function MatchHealthScreen() {
  const insets = useSafeAreaInsets();
  const [copied, setCopied] = useState(false);

  const { data, isLoading, isFetching, error, refetch } = useQuery<MatchHealthResponse>({
    queryKey: ["/api/admin/match-health"],
    staleTime: 0,
    retry: false,
  });

  const { data: matchSummary } = useQuery<MatchSummaryResponse>({
    queryKey: ["/api/admin/users/match-summary-kpi"],
    queryFn: async () => {
      const base = getApiUrl();
      const url = new URL("/api/admin/users/match-summary", base);
      url.searchParams.set("page", "1");
      url.searchParams.set("limit", "1");
      const res = await fetch(url.toString(), { credentials: "include" });
      if (!res.ok) throw new Error("Errore caricamento");
      return res.json();
    },
    staleTime: 30000,
    retry: false,
  });

  const { data: snapshotsData } = useQuery<{ snapshots: ZeroMatchSnapshotPoint[] }>({
    queryKey: ["/api/admin/users/zero-match-snapshots"],
    queryFn: async () => {
      const base = getApiUrl();
      const url = new URL("/api/admin/users/zero-match-snapshots", base);
      const res = await fetch(url.toString(), { credentials: "include" });
      if (!res.ok) throw new Error("Errore caricamento snapshot");
      return res.json();
    },
    staleTime: 60000,
    retry: false,
  });

  const handleRunCheck = () => {
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
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          {data && (
            <TouchableOpacity
              onPress={async () => {
                const extraLines: string[] = [
                  `Tipi totali: ${data.summary.totalMatchTypes}`,
                  `Anomalie: ${data.summary.typesAnomalous ?? data.summary.typesWithZeroResults}`,
                  `Senza dati: ${(data.summary.typesNoData ?? 0) + (data.summary.typesInactive ?? 0)}`,
                  `Gate: ${data.summary.adminGateStatus}`,
                  `Schema: ${data.summary.schemaStatus}`,
                  `Preferenze: ${data.summary.prefsStatus}`,
                  `Distanze: ${data.summary.distanceStatus}`,
                  "",
                  `Tipi di match:`,
                  ...data.checks.matchCounts.map(
                    (m) => `  [${m.status}] ${m.label}: ${m.count}${m.sourceCount !== undefined ? ` (sorgente: ${m.sourceCount})` : ""}`
                  ),
                ];
                const ok = await copyLogToClipboard({
                  title: "Match Engine Health",
                  overall: data.overallStatus,
                  extraLines,
                });
                if (ok) {
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                }
              }}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              style={styles.copyBtn}
            >
              <MaterialIcons name="content-copy" size={18} color={Colors.textSecondary} />
            </TouchableOpacity>
          )}
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
      </View>
      {copied && (
        <Text style={styles.copiedHint}>Copiato!</Text>
      )}

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
          <View style={styles.summaryRow}>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryValue}>{data.summary.totalMatchTypes}</Text>
              <Text style={styles.summaryKey}>Tipi totali</Text>
            </View>
            <View style={styles.summaryDivider} />
            <View style={styles.summaryItem}>
              <Text style={[styles.summaryValue, (data.summary.typesAnomalous ?? 0) > 0 ? { color: Colors.warning } : { color: Colors.success }]}>
                {data.summary.typesAnomalous ?? data.summary.typesWithZeroResults}
              </Text>
              <Text style={styles.summaryKey}>Anomalie</Text>
            </View>
            <View style={styles.summaryDivider} />
            <View style={styles.summaryItem}>
              <Text style={[styles.summaryValue, { color: Colors.textSecondary }]}>
                {(data.summary.typesNoData ?? 0) + (data.summary.typesInactive ?? 0)}
              </Text>
              <Text style={styles.summaryKey}>Senza dati</Text>
            </View>
            <View style={styles.summaryDivider} />
            <View style={styles.summaryItem}>
              <Text style={[styles.summaryValue, { color: statusColor(data.summary.adminGateStatus) }]}>
                {data.summary.adminGateStatus}
              </Text>
              <Text style={styles.summaryKey}>Gate</Text>
            </View>
          </View>

          {matchSummary !== undefined && (
            <ZeroMatchKpiCard
              zeroMatchCount={matchSummary.zeroMatchCount}
              total={matchSummary.total}
              snapshots={snapshotsData?.snapshots ?? []}
            />
          )}

          <SectionCard title="17 Tipi di Match" status={data.checks.matchCounts.some(m => m.status === "WARN") ? "WARN" : "OK"}>
            <MatchCountsSection matchCounts={data.checks.matchCounts} />
          </SectionCard>

          <SectionCard title="Schema DB" status={data.checks.schema.status}>
            <SchemaSection schema={data.checks.schema} formatDate={formatDate} />
          </SectionCard>

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
  infoText: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: Colors.text,
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
  copyBtn: {
    padding: 4,
  },
  copiedHint: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 11,
    color: Colors.success,
    textAlign: "center",
  },
});
