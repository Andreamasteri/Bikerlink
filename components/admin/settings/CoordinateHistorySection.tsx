import React from "react";
import { View, Text, StyleSheet, TouchableOpacity, TextInput, Switch, ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { useT } from "@/lib/language-context";

const styles = StyleSheet.create({
  accordionPanel: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    marginBottom: 12,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: Colors.border,
  },
  accordionPanelHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 14,
    backgroundColor: "rgba(0,0,0,0.02)",
  },
  accordionPanelTitle: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 15,
    color: Colors.text,
  },
  accordionPanelContent: {
    padding: 14,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  paidCard: {
    backgroundColor: "rgba(0,0,0,0.02)",
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
  },
  synecoHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  synecoInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  synecoLabel: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
    color: Colors.text,
  },
  synecoDesc: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: Colors.textSecondary,
    lineHeight: 16,
  },
  matchingStatsRow: {
    flexDirection: "row",
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    justifyContent: "space-between",
  },
  matchingStatItem: {
    flex: 1,
    alignItems: "center",
  },
  matchingStatValue: {
    fontFamily: "Inter_700Bold",
    fontSize: 16,
    color: Colors.accent,
  },
  matchingStatLabel: {
    fontFamily: "Inter_400Regular",
    fontSize: 10,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  matchingStatDivider: {
    width: 1,
    height: "100%",
    backgroundColor: Colors.border,
  },
  lastCycleBox: {
    marginTop: 12,
    padding: 10,
    borderRadius: 8,
    backgroundColor: Colors.accent + "15",
    borderWidth: 1,
    borderColor: Colors.accent + "40",
  },
  lastCycleText: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    color: Colors.textSecondary,
  },
  countryChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.background,
  },
  countryChipSelected: {
    borderColor: Colors.accent,
    backgroundColor: Colors.accent + "22",
  },
  countryChipText: {
    fontFamily: "Inter_500Medium",
    fontSize: 12,
    color: Colors.textSecondary,
  },
  countryChipTextSelected: {
    color: Colors.accent,
    fontFamily: "Inter_600SemiBold",
  },
});

interface CoordinateHistorySectionProps {
  expanded: boolean;
  onToggle: () => void;
  settings: {
    enabled: boolean;
    interval: number;
    maxRecords: number;
    mode: string;
    selectedUsers: string[];
  } | undefined;
  stats: {
    totalRecords: number;
    trackedUsers: number;
    oldestRecord: string | null;
    newestRecord: string | null;
  } | undefined;
  chIntervalInput: string;
  setChIntervalInput: (val: string) => void;
  onChIntervalEndEditing: () => void;
  chMaxRecordsInput: string;
  setChMaxRecordsInput: (val: string) => void;
  onChMaxRecordsEndEditing: () => void;
  chUserSearch: string;
  setChUserSearch: (val: string) => void;
  chSearchResults: Array<{ id: string; nickname: string; userType: string }> | undefined;
  onMutation: (body: any) => void;
  isPending: boolean;
}

export function CoordinateHistorySection({
  expanded,
  onToggle,
  settings,
  stats,
  chIntervalInput,
  setChIntervalInput,
  onChIntervalEndEditing,
  chMaxRecordsInput,
  setChMaxRecordsInput,
  onChMaxRecordsEndEditing,
  chUserSearch,
  setChUserSearch,
  chSearchResults,
  onMutation,
  isPending,
}: CoordinateHistorySectionProps) {
  const t = useT();

  return (
    <View style={styles.accordionPanel}>
      <TouchableOpacity style={styles.accordionPanelHeader} onPress={onToggle}>
        <View style={styles.synecoInfo}>
          <Ionicons name="navigate" size={20} color={Colors.accent} />
          <Text style={styles.accordionPanelTitle}>Storico Coordinate</Text>
        </View>
        <Ionicons name={expanded ? "chevron-up" : "chevron-down"} size={18} color={Colors.textSecondary} />
      </TouchableOpacity>
      {expanded && (
        <View style={styles.accordionPanelContent}>
          <View style={styles.paidCard}>
            <View style={styles.synecoHeader}>
              <View style={styles.synecoInfo}>
                <Ionicons name="power" size={20} color={Colors.accent} />
                <Text style={styles.synecoLabel}>Tracciamento Attivo</Text>
              </View>
              <Switch
                value={settings?.enabled === true}
                onValueChange={(val) => onMutation({ enabled: val })}
                trackColor={{ false: Colors.border, true: Colors.accent }}
                thumbColor={settings?.enabled ? Colors.text : Colors.textSecondary}
                disabled={isPending}
              />
            </View>
            <Text style={styles.synecoDesc}>
              {settings?.enabled ? t("admin.coordHistoryActive") : t("admin.coordHistoryInactive")}
            </Text>
          </View>

          <View style={styles.paidCard}>
            <View style={styles.synecoHeader}>
              <View style={styles.synecoInfo}>
                <Ionicons name="timer" size={20} color={Colors.accent} />
                <Text style={styles.synecoLabel}>Intervallo Salvataggio (sec)</Text>
              </View>
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <TextInput
                  style={{ borderWidth: 1, borderColor: Colors.border, borderRadius: 6, paddingHorizontal: 10, paddingVertical: 4, width: 70, color: Colors.text, fontSize: 14, textAlign: "center", backgroundColor: Colors.surface }}
                  keyboardType="numeric"
                  value={chIntervalInput}
                  onChangeText={setChIntervalInput}
                  onEndEditing={onChIntervalEndEditing}
                />
              </View>
            </View>
            <Text style={styles.synecoDesc}>
              Ogni quanti secondi salvare le coordinate nella history (min 5s, default 30s)
            </Text>
          </View>

          <View style={styles.paidCard}>
            <View style={styles.synecoHeader}>
              <View style={styles.synecoInfo}>
                <Ionicons name="albums" size={20} color={Colors.accent} />
                <Text style={styles.synecoLabel}>Max Record per Utente</Text>
              </View>
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <TextInput
                  style={{ borderWidth: 1, borderColor: Colors.border, borderRadius: 6, paddingHorizontal: 10, paddingVertical: 4, width: 70, color: Colors.text, fontSize: 14, textAlign: "center", backgroundColor: Colors.surface }}
                  keyboardType="numeric"
                  value={chMaxRecordsInput}
                  onChangeText={setChMaxRecordsInput}
                  onEndEditing={onChMaxRecordsEndEditing}
                />
              </View>
            </View>
            <Text style={styles.synecoDesc}>
              {t("admin.maxRecordsPerUser")}
            </Text>
          </View>

          <View style={styles.paidCard}>
            <View style={styles.synecoHeader}>
              <View style={styles.synecoInfo}>
                <Ionicons name="people" size={20} color={Colors.accent} />
                <Text style={styles.synecoLabel}>{t("admin.adModeLabel")}</Text>
              </View>
              <View style={{ flexDirection: "row", gap: 8 }}>
                {(["all", "selected"] as const).map((m) => (
                  <TouchableOpacity
                    key={m}
                    onPress={() => onMutation({ mode: m })}
                    style={[
                      styles.countryChip,
                      settings?.mode === m && styles.countryChipSelected,
                    ]}
                  >
                    <Text style={[
                      styles.countryChipText,
                      settings?.mode === m && styles.countryChipTextSelected,
                    ]}>
                      {m === "all" ? "Tutti" : "Selezionati"}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
            <Text style={styles.synecoDesc}>
              {settings?.mode === "selected"
                ? `Tracciamento attivo solo per ${settings?.selectedUsers?.length ?? 0} utenti selezionati`
                : "Tracciamento attivo per tutti gli utenti"}
            </Text>
          </View>

          {settings?.mode === "selected" && (
            <View style={styles.paidCard}>
              <View style={styles.synecoHeader}>
                <View style={styles.synecoInfo}>
                  <Ionicons name="person-add" size={20} color={Colors.accent} />
                  <Text style={styles.synecoLabel}>Utenti Selezionati ({settings?.selectedUsers?.length ?? 0})</Text>
                </View>
              </View>
              {(settings?.selectedUsers?.length ?? 0) > 0 && (
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
                  {settings!.selectedUsers.map((uid) => (
                    <TouchableOpacity
                      key={uid}
                      onPress={() => {
                        const updated = settings!.selectedUsers.filter((u) => u !== uid);
                        onMutation({ selectedUsers: updated });
                      }}
                      style={{ flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12, backgroundColor: Colors.accent }}
                    >
                      <Text style={{ color: "#fff", fontSize: 12 }}>{uid.slice(0, 8)}...</Text>
                      <Ionicons name="close-circle" size={14} color="#fff" />
                    </TouchableOpacity>
                  ))}
                </View>
              )}
              <TextInput
                style={{ borderWidth: 1, borderColor: Colors.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, color: Colors.text, fontSize: 14, backgroundColor: Colors.surface, marginTop: 10 }}
                placeholder="Cerca utente per nickname..."
                placeholderTextColor={Colors.textSecondary}
                value={chUserSearch}
                onChangeText={setChUserSearch}
              />
              {chSearchResults && chSearchResults.length > 0 && (
                <View style={{ marginTop: 6, borderWidth: 1, borderColor: Colors.border, borderRadius: 8, backgroundColor: Colors.surface, maxHeight: 180 }}>
                  <ScrollView nestedScrollEnabled>
                    {chSearchResults
                      .filter((u) => !(settings?.selectedUsers ?? []).includes(u.id))
                      .map((u) => (
                        <TouchableOpacity
                          key={u.id}
                          onPress={() => {
                            const current = settings?.selectedUsers ?? [];
                            onMutation({ selectedUsers: [...current, u.id] });
                            setChUserSearch("");
                          }}
                          style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.border }}
                        >
                          <Ionicons name="add-circle" size={18} color={Colors.accent} />
                          <Text style={{ color: Colors.text, fontSize: 14, flex: 1 }}>{u.nickname}</Text>
                          <Text style={{ color: Colors.textSecondary, fontSize: 11 }}>{u.userType}</Text>
                        </TouchableOpacity>
                      ))}
                  </ScrollView>
                </View>
              )}
              {chUserSearch.length >= 2 && chSearchResults && chSearchResults.filter((u) => !(settings?.selectedUsers ?? []).includes(u.id)).length === 0 && (
                <Text style={[styles.synecoDesc, { marginTop: 6 }]}>Nessun utente trovato</Text>
              )}
            </View>
          )}

          <View style={styles.paidCard}>
            <View style={styles.synecoHeader}>
              <View style={styles.synecoInfo}>
                <Ionicons name="stats-chart" size={20} color={Colors.accent} />
                <Text style={styles.synecoLabel}>Statistiche</Text>
              </View>
            </View>
            <View style={styles.matchingStatsRow}>
              <View style={styles.matchingStatItem}>
                <Text style={styles.matchingStatValue}>{stats?.totalRecords ?? "—"}</Text>
                <Text style={styles.matchingStatLabel}>Record Totali</Text>
              </View>
              <View style={styles.matchingStatDivider} />
              <View style={styles.matchingStatItem}>
                <Text style={styles.matchingStatValue}>{stats?.trackedUsers ?? "—"}</Text>
                <Text style={styles.matchingStatLabel}>Utenti Tracciati</Text>
              </View>
            </View>
            {(stats?.oldestRecord || stats?.newestRecord) && (
              <View style={styles.lastCycleBox}>
                {stats.oldestRecord && (
                  <Text style={styles.lastCycleText}>
                    Primo: {new Date(stats.oldestRecord).toLocaleString("it-IT")}
                  </Text>
                )}
                {stats.newestRecord && (
                  <Text style={styles.lastCycleText}>
                    Ultimo: {new Date(stats.newestRecord).toLocaleString("it-IT")}
                  </Text>
                )}
              </View>
            )}
          </View>
        </View>
      )}
    </View>
  );
}
