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

interface TableSizesData {
  tables: TableSizeRow[];
  isRunning: boolean;
  lastVacuum: string | null;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
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
        err instanceof Error ? err.message : "Errore sconosciuto";
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
          </View>
          {tables
            .slice()
            .sort((a, b) => b.totalSizeBytes - a.totalSizeBytes)
            .map((row, idx) => (
              <View
                key={row.name}
                style={[
                  styles.tableRow,
                  idx % 2 === 1 && { backgroundColor: colors.surface + "88" },
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
              </View>
            ))}
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
