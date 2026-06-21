import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from "react-native";
import { useQuery, useMutation } from "@tanstack/react-query";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { apiRequest, queryClient } from "@/lib/query-client";

interface TableSizeRow {
  name: string;
  sizeBytes: number;
  totalSizeBytes: number;
}

interface VacuumTableDetail {
  table: string;
  bytesBefore: number;
  bytesAfter: number;
  mode?: "analyze" | "full";
  bloatRatio?: number;
}

interface TableSizesData {
  tables: TableSizeRow[];
  isRunning: boolean;
  lastVacuum: string | null;
  lastVacuumDetail: VacuumTableDetail[] | null;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function formatSaved(bytesBefore: number, bytesAfter: number): string {
  const saved = bytesBefore - bytesAfter;
  if (saved <= 0) return "—";
  return `−${formatBytes(saved)}`;
}

function formatDateIT(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleString("it-IT", {
    timeZone: "Europe/Rome",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const QUERY_KEY = ["/api/admin/db/table-sizes"];

export default function DbTablesScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [refreshing, setRefreshing] = useState(false);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { data, isLoading, isError, refetch } = useQuery<TableSizesData>({
    queryKey: QUERY_KEY,
    refetchInterval: false,
  });

  const isRunning = data?.isRunning ?? false;

  useEffect(() => {
    if (isRunning) {
      pollTimerRef.current = setInterval(() => {
        refetch();
      }, 5000);
    } else {
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    }
    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, [isRunning, refetch]);

  const vacuumMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/admin/db/vacuum-full"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    },
    onError: (err: unknown) => {
      const msg =
        err instanceof Error ? (err as Error).message : "Errore sconosciuto";
      Alert.alert("Errore", `Impossibile avviare il VACUUM: ${msg}`);
    },
  });

  const handleVacuum = () => {
    Alert.alert(
      "Esegui VACUUM FULL",
      "Il VACUUM FULL blocca brevemente ogni tabella durante la pulizia. Continuare?",
      [
        { text: "Annulla", style: "cancel" },
        {
          text: "Esegui",
          style: "destructive",
          onPress: () => vacuumMutation.mutate(),
        },
      ],
    );
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  const styles = makeStyles(colors);

  const tables = data?.tables ?? [];
  const totalBytes = tables.reduce((sum, t) => sum + t.totalSizeBytes, 0);
  const detailMap = new Map<string, VacuumTableDetail>(
    (data?.lastVacuumDetail ?? []).map((d) => [d.table, d]),
  );
  const hasDetail = detailMap.size > 0;

  const totalSavedBytes = hasDetail
    ? (data?.lastVacuumDetail ?? []).reduce(
        (sum, d) => sum + Math.max(0, d.bytesBefore - d.bytesAfter),
        0,
      )
    : 0;

  return (
    <ScrollView
      style={[styles.container, { paddingBottom: insets.bottom + 24 }]}
      contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={colors.accent}
        />
      }
    >
      <View style={styles.section}>
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.sectionTitle}>Dimensioni tabelle</Text>
            <Text style={styles.sectionSub}>
              Totale: {totalBytes > 0 ? formatBytes(totalBytes) : "—"}
            </Text>
          </View>
          <TouchableOpacity
            style={[
              styles.vacuumBtn,
              (isRunning || vacuumMutation.isPending) && styles.vacuumBtnDisabled,
            ]}
            onPress={handleVacuum}
            disabled={isRunning || vacuumMutation.isPending}
          >
            {isRunning || vacuumMutation.isPending ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <MaterialCommunityIcons name="broom" size={16} color="#fff" />
            )}
            <Text style={styles.vacuumBtnText}>
              {isRunning ? "VACUUM in corso…" : "Esegui VACUUM ora"}
            </Text>
          </TouchableOpacity>
        </View>

        {isRunning && (
          <View style={styles.runningBanner}>
            <ActivityIndicator size="small" color={colors.accent} />
            <Text style={styles.runningText}>
              VACUUM FULL in corso — aggiornamento automatico ogni 5s
            </Text>
          </View>
        )}

        <View style={styles.lastVacuumRow}>
          <MaterialCommunityIcons
            name="clock-outline"
            size={14}
            color={colors.textSecondary}
          />
          <Text style={styles.lastVacuumText}>
            Ultimo VACUUM:{" "}
            <Text style={styles.lastVacuumValue}>
              {formatDateIT(data?.lastVacuum ?? null)}
            </Text>
          </Text>
        </View>

        {hasDetail && totalSavedBytes > 0 && (
          <View style={styles.savedBanner}>
            <MaterialCommunityIcons
              name="leaf"
              size={14}
              color={colors.success ?? "#22c55e"}
            />
            <Text style={styles.savedBannerText}>
              Spazio liberato nell'ultimo VACUUM:{" "}
              <Text style={styles.savedBannerValue}>
                {formatBytes(totalSavedBytes)}
              </Text>
            </Text>
          </View>
        )}
      </View>

      {isLoading && (
        <ActivityIndicator
          size="large"
          color={colors.accent}
          style={{ marginTop: 40 }}
        />
      )}

      {isError && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>Errore nel caricamento dati.</Text>
          <TouchableOpacity onPress={() => refetch()} style={styles.retryBtn}>
            <Text style={styles.retryText}>Riprova</Text>
          </TouchableOpacity>
        </View>
      )}

      {!isLoading && !isError && (
        <View style={styles.tableSection}>
          <View style={styles.tableHeader}>
            <Text style={[styles.colLabel, { flex: 2 }]}>Tabella</Text>
            <Text style={[styles.colLabel, styles.colRight]}>Dati</Text>
            <Text style={[styles.colLabel, styles.colRight]}>Totale</Text>
            {hasDetail && (
              <Text style={[styles.colLabel, styles.colRight, styles.colSaved]}>
                Risparmio
              </Text>
            )}
            {hasDetail && (
              <Text style={[styles.colLabel, styles.colMode]}>
                Modo
              </Text>
            )}
          </View>
          {tables
            .slice()
            .sort((a, b) => b.totalSizeBytes - a.totalSizeBytes)
            .map((row, idx) => {
              const detail = detailMap.get(row.name);
              const isFull = detail?.mode === "full";
              return (
                <View
                  key={row.name}
                  style={[
                    styles.tableRow,
                    idx % 2 === 1 && { backgroundColor: colors.surface + "88" },
                    isFull && styles.tableRowFull,
                  ]}
                >
                  <Text style={[styles.tableName, { flex: 2 }]} numberOfLines={1}>
                    {row.name}
                  </Text>
                  <Text style={[styles.tableSize, styles.colRight]}>
                    {formatBytes(row.sizeBytes)}
                  </Text>
                  <Text style={[styles.tableSize, styles.colRight, styles.totalSize]}>
                    {formatBytes(row.totalSizeBytes)}
                  </Text>
                  {hasDetail && (
                    <Text
                      style={[
                        styles.tableSize,
                        styles.colRight,
                        detail && detail.bytesBefore > detail.bytesAfter
                          ? styles.savedPositive
                          : styles.savedNeutral,
                      ]}
                    >
                      {detail
                        ? formatSaved(detail.bytesBefore, detail.bytesAfter)
                        : "—"}
                    </Text>
                  )}
                  {hasDetail && (
                    <View style={styles.colMode}>
                      {detail ? (
                        detail.mode ? (
                          <View style={[
                            styles.modeBadge,
                            isFull ? styles.modeBadgeFull : styles.modeBadgeAnalyze,
                          ]}>
                            <Text style={[
                              styles.modeBadgeText,
                              isFull ? styles.modeBadgeTextFull : styles.modeBadgeTextAnalyze,
                            ]}>
                              {isFull ? "FULL" : "ANALYZE"}
                            </Text>
                            {detail.bloatRatio !== undefined && (
                              <Text style={[
                                styles.bloatText,
                                isFull ? styles.bloatTextFull : styles.bloatTextAnalyze,
                              ]}>
                                {(detail.bloatRatio * 100).toFixed(1)}%
                              </Text>
                            )}
                          </View>
                        ) : (
                          <Text style={styles.savedNeutral}>—</Text>
                        )
                      ) : (
                        <Text style={styles.savedNeutral}>—</Text>
                      )}
                    </View>
                  )}
                </View>
              );
            })}
        </View>
      )}
    </ScrollView>
  );
}

function makeStyles(colors: ReturnType<typeof import("@/hooks/useColors").useColors>) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    section: {
      margin: 16,
      backgroundColor: colors.surface,
      borderRadius: 12,
      padding: 16,
    },
    headerRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "flex-start",
      gap: 12,
      flexWrap: "wrap",
    },
    sectionTitle: {
      fontSize: 17,
      fontFamily: "Inter_700Bold",
      color: colors.text,
    },
    sectionSub: {
      fontSize: 13,
      color: colors.textSecondary,
      marginTop: 2,
      fontFamily: "Inter_400Regular",
    },
    vacuumBtn: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.accent,
      borderRadius: 8,
      paddingHorizontal: 12,
      paddingVertical: 8,
      gap: 6,
    },
    vacuumBtnDisabled: {
      opacity: 0.5,
    },
    vacuumBtnText: {
      color: "#fff",
      fontSize: 13,
      fontFamily: "Inter_600SemiBold",
    },
    runningBanner: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      marginTop: 12,
      backgroundColor: colors.accent + "22",
      borderRadius: 8,
      padding: 10,
    },
    runningText: {
      color: colors.accent,
      fontSize: 12,
      fontFamily: "Inter_500Medium",
      flex: 1,
    },
    lastVacuumRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
      marginTop: 12,
    },
    lastVacuumText: {
      fontSize: 12,
      color: colors.textSecondary,
      fontFamily: "Inter_400Regular",
    },
    lastVacuumValue: {
      fontFamily: "Inter_600SemiBold",
      color: colors.text,
    },
    savedBanner: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      marginTop: 10,
      backgroundColor: (colors.success ?? "#22c55e") + "1A",
      borderRadius: 8,
      paddingHorizontal: 10,
      paddingVertical: 8,
    },
    savedBannerText: {
      fontSize: 12,
      color: colors.textSecondary,
      fontFamily: "Inter_400Regular",
      flex: 1,
    },
    savedBannerValue: {
      fontFamily: "Inter_700Bold",
      color: colors.success ?? "#22c55e",
    },
    tableSection: {
      marginHorizontal: 16,
      marginBottom: 16,
      backgroundColor: colors.surface,
      borderRadius: 12,
      overflow: "hidden",
    },
    tableHeader: {
      flexDirection: "row",
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderBottomWidth: 1,
      borderColor: colors.border ?? colors.textSecondary + "33",
      backgroundColor: colors.surface,
    },
    colLabel: {
      fontSize: 11,
      fontFamily: "Inter_700Bold",
      color: colors.textSecondary,
      textTransform: "uppercase",
      letterSpacing: 0.5,
    },
    colRight: {
      width: 72,
      textAlign: "right",
    },
    colSaved: {
      color: colors.success ?? "#22c55e",
    },
    tableRow: {
      flexDirection: "row",
      paddingHorizontal: 14,
      paddingVertical: 10,
      alignItems: "center",
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border ?? colors.textSecondary + "22",
    },
    tableName: {
      fontSize: 13,
      fontFamily: "Inter_400Regular",
      color: colors.text,
    },
    tableSize: {
      width: 72,
      textAlign: "right",
      fontSize: 12,
      fontFamily: "Inter_500Medium",
      color: colors.textSecondary,
    },
    totalSize: {
      color: colors.text,
      fontFamily: "Inter_700Bold",
    },
    savedPositive: {
      color: colors.success ?? "#22c55e",
      fontFamily: "Inter_600SemiBold",
    },
    savedNeutral: {
      color: colors.textSecondary,
    },
    tableRowFull: {
      backgroundColor: (colors.error ?? "#FF4444") + "18",
    },
    colMode: {
      width: 72,
      alignItems: "center" as const,
      justifyContent: "center" as const,
    },
    modeBadge: {
      borderRadius: 5,
      paddingHorizontal: 5,
      paddingVertical: 2,
      alignItems: "center" as const,
      minWidth: 44,
    },
    modeBadgeFull: {
      backgroundColor: (colors.error ?? "#FF4444") + "30",
      borderWidth: 1,
      borderColor: (colors.error ?? "#FF4444") + "88",
    },
    modeBadgeAnalyze: {
      backgroundColor: (colors.accent) + "20",
      borderWidth: 1,
      borderColor: (colors.accent) + "55",
    },
    modeBadgeText: {
      fontSize: 10,
      fontFamily: "Inter_700Bold" as const,
      letterSpacing: 0.3,
    },
    modeBadgeTextFull: {
      color: colors.error ?? "#FF4444",
    },
    modeBadgeTextAnalyze: {
      color: colors.accent,
    },
    bloatText: {
      fontSize: 9,
      fontFamily: "Inter_500Medium" as const,
      marginTop: 1,
    },
    bloatTextFull: {
      color: (colors.error ?? "#FF4444") + "CC",
    },
    bloatTextAnalyze: {
      color: colors.accent + "99",
    },
    errorBox: {
      alignItems: "center",
      marginTop: 40,
      gap: 12,
    },
    errorText: {
      color: colors.error ?? "#FF4444",
      fontFamily: "Inter_500Medium",
      fontSize: 14,
    },
    retryBtn: {
      paddingHorizontal: 20,
      paddingVertical: 8,
      backgroundColor: colors.accent,
      borderRadius: 8,
    },
    retryText: {
      color: "#fff",
      fontFamily: "Inter_600SemiBold",
    },
  });
}
