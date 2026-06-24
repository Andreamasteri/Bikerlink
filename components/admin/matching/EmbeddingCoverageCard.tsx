import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from "react-native";
import { MaterialCommunityIcons, Ionicons } from "@expo/vector-icons";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Colors from "@/constants/colors";
import { apiRequest } from "@/lib/query-client";

interface CoverageFieldRow {
  field: string;
  withEmbedding: number;
  missingEmbedding: number;
  coveragePct: number;
  lastUpdated: string | null;
}

interface CoverageResponse {
  efSearch: number;
  activeUsers: number;
  byField: CoverageFieldRow[];
  coverageWarning: boolean;
  coverageThresholdPct: number;
  dailyCap: number;
}

interface HnswStatusResponse {
  exists: boolean;
  valid: boolean;
}

type HnswState = "ok" | "missing" | "invalid";

function resolveHnswState(status?: HnswStatusResponse): HnswState {
  if (!status?.exists) return "missing";
  if (!status.valid) return "invalid";
  return "ok";
}

const HNSW_PRESENTATION: Record<
  HnswState,
  { label: string; icon: keyof typeof Ionicons.glyphMap; color: "success" | "warning" | "error" }
> = {
  ok: { label: "OK", icon: "checkmark-circle", color: "success" },
  missing: { label: "MANCANTE", icon: "close-circle", color: "error" },
  invalid: { label: "INVALIDO", icon: "warning", color: "warning" },
};

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("it-IT", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export function EmbeddingCoverageCard() {
  const queryClient = useQueryClient();

  const { data, isLoading, error, refetch, isFetching } = useQuery<CoverageResponse>({
    queryKey: ["/api/admin/embeddings/coverage"],
    staleTime: 30000,
    retry: false,
  });

  const { data: hnswStatus } = useQuery<HnswStatusResponse>({
    queryKey: ["/api/admin/embeddings/hnsw-status"],
    staleTime: 30000,
    retry: false,
  });

  const [efSearchInput, setEfSearchInput] = useState<string>("");
  const [thresholdInput, setThresholdInput] = useState<string>("");
  const [dailyCapInput, setDailyCapInput] = useState<string>("");

  React.useEffect(() => {
    if (data) {
      setEfSearchInput(String(data.efSearch));
      setThresholdInput(String(data.coverageThresholdPct));
      setDailyCapInput(String(data.dailyCap));
    }
  }, [data]);

  const settingsMutation = useMutation({
    mutationFn: (body: { efSearch?: number; coverageThreshold?: number; dailyCap?: number }) =>
      apiRequest("PATCH", "/api/admin/embeddings/settings", body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["/api/admin/embeddings/coverage"] });
      void queryClient.invalidateQueries({ queryKey: ["/api/admin/embeddings/stats"] });
    },
    onError: () => {
      Alert.alert("Errore", "Impossibile salvare le impostazioni embedding.");
    },
  });

  const handleEfSearchSave = () => {
    const val = parseInt(efSearchInput, 10);
    if (!Number.isFinite(val) || val < 1 || val > 1000) {
      Alert.alert("Valore non valido", "ef_search deve essere un intero tra 1 e 1000.");
      setEfSearchInput(String(data?.efSearch ?? 64));
      return;
    }
    settingsMutation.mutate({ efSearch: val });
  };

  const handleThresholdSave = () => {
    const val = parseInt(thresholdInput, 10);
    if (!Number.isFinite(val) || val < 0 || val > 100) {
      Alert.alert("Valore non valido", "La soglia deve essere un intero tra 0 e 100.");
      setThresholdInput(String(data?.coverageThresholdPct ?? 80));
      return;
    }
    settingsMutation.mutate({ coverageThreshold: val });
  };

  const handleDailyCapSave = () => {
    const val = parseInt(dailyCapInput, 10);
    if (!Number.isFinite(val) || val < 1) {
      Alert.alert("Valore non valido", "Il daily cap deve essere un intero >= 1.");
      setDailyCapInput(String(data?.dailyCap ?? 500));
      return;
    }
    settingsMutation.mutate({ dailyCap: val });
  };

  const bioBioRow = data?.byField.find((r) => r.field === "bio");
  const coveragePct = bioBioRow?.coveragePct ?? 0;
  const coverageColor =
    data?.coverageWarning ? Colors.warning : Colors.success;

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <MaterialCommunityIcons name="database-search" size={18} color={Colors.accent} />
        <Text style={styles.title}>Copertura Embedding</Text>
        <View style={styles.headerRight}>
          {data?.coverageWarning && (
            <View style={styles.warningBadge}>
              <Ionicons name="warning" size={12} color={Colors.warning} />
              <Text style={styles.warningBadgeText}>BASSA</Text>
            </View>
          )}
          <TouchableOpacity
            onPress={() => refetch()}
            disabled={isFetching}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            {isFetching ? (
              <ActivityIndicator size="small" color={Colors.textSecondary} />
            ) : (
              <MaterialCommunityIcons name="refresh" size={18} color={Colors.textSecondary} />
            )}
          </TouchableOpacity>
        </View>
      </View>

      {isLoading && !data && (
        <ActivityIndicator color={Colors.accent} style={{ marginTop: 12 }} />
      )}

      {error && !data && (
        <View style={styles.errorBox}>
          <Ionicons name="alert-circle" size={16} color={Colors.error} />
          <Text style={styles.errorText}>Impossibile caricare i dati di copertura.</Text>
        </View>
      )}

      {data && (
        <>
          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{data.activeUsers.toLocaleString("it-IT")}</Text>
              <Text style={styles.statLabel}>Utenti attivi</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={[styles.statValue, { color: coverageColor }]}>
                {bioBioRow ? `${coveragePct}%` : "—"}
              </Text>
              <Text style={styles.statLabel}>Bio embedded</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{bioBioRow?.withEmbedding ?? 0}</Text>
              <Text style={styles.statLabel}>Con vettore</Text>
            </View>
          </View>

          {bioBioRow?.lastUpdated && (
            <Text style={styles.lastUpdated}>
              Ultimo aggiornamento: {formatDate(bioBioRow.lastUpdated)}
            </Text>
          )}

          {hnswStatus && (() => {
            const state = resolveHnswState(hnswStatus);
            const p = HNSW_PRESENTATION[state];
            const color = Colors[p.color];
            return (
              <View style={[styles.hnswRow, { borderColor: color, backgroundColor: color + "14" }]}>
                <Ionicons name={p.icon} size={16} color={color} />
                <Text style={styles.hnswLabel}>Indice HNSW</Text>
                <Text style={[styles.hnswStatusText, { color }]}>{p.label}</Text>
              </View>
            );
          })()}

          {data.byField.length > 1 && (
            <View style={styles.fieldList}>
              {data.byField.map((row) => (
                <View key={row.field} style={styles.fieldRow}>
                  <Text style={styles.fieldName}>{row.field}</Text>
                  <View style={styles.fieldBar}>
                    <View
                      style={[
                        styles.fieldBarFill,
                        {
                          width: `${row.coveragePct}%` as `${number}%`,
                          backgroundColor:
                            row.coveragePct >= data.coverageThresholdPct
                              ? Colors.success
                              : Colors.warning,
                        },
                      ]}
                    />
                  </View>
                  <Text style={styles.fieldPct}>{row.coveragePct}%</Text>
                </View>
              ))}
            </View>
          )}

          <View style={styles.divider} />

          <View style={styles.settingsSection}>
            <Text style={styles.settingsSectionTitle}>Impostazioni Embedding</Text>

            <View style={styles.settingRow}>
              <View style={styles.settingInfo}>
                <Text style={styles.settingLabel}>ef_search</Text>
                <Text style={styles.settingDesc}>
                  Qualità ricerca HNSW (1–1000, default 64)
                </Text>
              </View>
              <View style={styles.settingInputRow}>
                <TextInput
                  style={styles.settingInput}
                  value={efSearchInput}
                  onChangeText={setEfSearchInput}
                  onEndEditing={handleEfSearchSave}
                  keyboardType="numeric"
                  maxLength={4}
                  selectTextOnFocus
                  editable={!settingsMutation.isPending}
                  returnKeyType="done"
                />
                <TouchableOpacity
                  style={[styles.saveBtn, settingsMutation.isPending && styles.saveBtnDisabled]}
                  onPress={handleEfSearchSave}
                  disabled={settingsMutation.isPending}
                  activeOpacity={0.7}
                >
                  {settingsMutation.isPending ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <MaterialCommunityIcons name="check" size={16} color="#fff" />
                  )}
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.settingRow}>
              <View style={styles.settingInfo}>
                <Text style={styles.settingLabel}>Soglia copertura (%)</Text>
                <Text style={styles.settingDesc}>
                  Sotto questa % appare il badge BASSA (0–100, default 80)
                </Text>
              </View>
              <View style={styles.settingInputRow}>
                <TextInput
                  style={styles.settingInput}
                  value={thresholdInput}
                  onChangeText={setThresholdInput}
                  onEndEditing={handleThresholdSave}
                  keyboardType="numeric"
                  maxLength={3}
                  selectTextOnFocus
                  editable={!settingsMutation.isPending}
                  returnKeyType="done"
                />
                <TouchableOpacity
                  style={[styles.saveBtn, settingsMutation.isPending && styles.saveBtnDisabled]}
                  onPress={handleThresholdSave}
                  disabled={settingsMutation.isPending}
                  activeOpacity={0.7}
                >
                  {settingsMutation.isPending ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <MaterialCommunityIcons name="check" size={16} color="#fff" />
                  )}
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.settingRow}>
              <View style={styles.settingInfo}>
                <Text style={styles.settingLabel}>Daily cap API</Text>
                <Text style={styles.settingDesc}>
                  Max chiamate embedding/giorno (default 500)
                </Text>
              </View>
              <View style={styles.settingInputRow}>
                <TextInput
                  style={styles.settingInput}
                  value={dailyCapInput}
                  onChangeText={setDailyCapInput}
                  onEndEditing={handleDailyCapSave}
                  keyboardType="numeric"
                  maxLength={6}
                  selectTextOnFocus
                  editable={!settingsMutation.isPending}
                  returnKeyType="done"
                />
                <TouchableOpacity
                  style={[styles.saveBtn, settingsMutation.isPending && styles.saveBtnDisabled]}
                  onPress={handleDailyCapSave}
                  disabled={settingsMutation.isPending}
                  activeOpacity={0.7}
                >
                  {settingsMutation.isPending ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <MaterialCommunityIcons name="check" size={16} color="#fff" />
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </>
      )}
    </View>
  );
}

import { styles } from "./EmbeddingCoverageCard.styles";
