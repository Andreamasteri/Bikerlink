import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
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

  const [efSearchInput, setEfSearchInput] = useState<string>("");
  const [thresholdInput, setThresholdInput] = useState<string>("");
  const [dailyCapInput, setDailyCapInput] = useState<string>("");

  React.useEffect(() => {
    if (data) {
      setEfSearchInput(String(data.efSearch));
      setThresholdInput(String(data.coverageThresholdPct));
      setDailyCapInput(String(data.dailyCap));
    }
  }, [data?.efSearch, data?.coverageThresholdPct, data?.dailyCap]);

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

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 12,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  title: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 15,
    color: Colors.text,
    flex: 1,
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  warningBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: Colors.warning + "22",
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: Colors.warning,
  },
  warningBadgeText: {
    fontFamily: "Inter_700Bold",
    fontSize: 10,
    color: Colors.warning,
    letterSpacing: 0.5,
  },
  errorBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: Colors.error + "18",
    borderRadius: 8,
    padding: 10,
  },
  errorText: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: Colors.error,
    flex: 1,
  },
  statsRow: {
    flexDirection: "row",
    backgroundColor: Colors.background,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
    borderWidth: 1,
    borderColor: Colors.border,
  },
  statItem: {
    flex: 1,
    alignItems: "center",
  },
  statValue: {
    fontFamily: "Inter_700Bold",
    fontSize: 18,
    color: Colors.text,
  },
  statLabel: {
    fontFamily: "Inter_400Regular",
    fontSize: 10,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  statDivider: {
    width: 1,
    height: 28,
    backgroundColor: Colors.border,
  },
  lastUpdated: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    color: Colors.textSecondary,
    textAlign: "right",
  },
  fieldList: {
    gap: 6,
  },
  fieldRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  fieldName: {
    fontFamily: "Inter_500Medium",
    fontSize: 12,
    color: Colors.textSecondary,
    width: 48,
  },
  fieldBar: {
    flex: 1,
    height: 6,
    backgroundColor: Colors.border,
    borderRadius: 3,
    overflow: "hidden",
  },
  fieldBarFill: {
    height: 6,
    borderRadius: 3,
  },
  fieldPct: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 11,
    color: Colors.text,
    width: 38,
    textAlign: "right",
  },
  divider: {
    height: 1,
    backgroundColor: Colors.border,
  },
  settingsSection: {
    gap: 12,
  },
  settingsSectionTitle: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
    color: Colors.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  settingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    justifyContent: "space-between",
  },
  settingInfo: {
    flex: 1,
  },
  settingLabel: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
    color: Colors.text,
  },
  settingDesc: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  settingInputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  settingInput: {
    backgroundColor: Colors.surfaceLight,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
    color: Colors.text,
    width: 72,
    textAlign: "center",
  },
  saveBtn: {
    backgroundColor: Colors.accent,
    borderRadius: 8,
    padding: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  saveBtnDisabled: {
    opacity: 0.6,
  },
});
