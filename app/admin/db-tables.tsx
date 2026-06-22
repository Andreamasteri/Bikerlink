import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
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
import { DbTableRow } from "./db-tables.part2";
import { makeStyles } from "@/components/admin/db-tables.styles";

export interface TableSizeRow {
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

function _formatSaved(bytesBefore: number, bytesAfter: number): string {
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
            .map((row, idx) => (
              <DbTableRow
                key={row.name}
                row={row}
                idx={idx}
                detail={detailMap.get(row.name)}
                colors={colors}
                styles={styles}
                hasDetail={hasDetail}
              />
            ))}
        </View>
      )}
    </ScrollView>
  );
}
