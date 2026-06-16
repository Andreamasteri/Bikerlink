import React from "react";
import { View, Text, StyleSheet, TouchableOpacity, TextInput, Switch, ActivityIndicator, Alert } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { useT } from "@/lib/language-context";
import { useMutation, useQuery } from "@tanstack/react-query";
import { getApiUrl, queryClient } from "@/lib/query-client";

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
  triggerBtn: {
    backgroundColor: Colors.warning,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  triggerBtnText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
    color: Colors.text,
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
    color: Colors.text,
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
  feedbackText: {
    fontFamily: "Inter_500Medium",
    fontSize: 11,
    marginTop: 8,
    textAlign: "center",
  },
});

interface MatchingEngineSectionProps {
  expanded: boolean;
  onToggle: () => void;
  alwaysExpanded?: boolean;
  autoMatchEnabled: boolean;
  onAutoMatchToggle: (val: boolean) => void;
  autoMatchPending: boolean;
  showSearchPrefEnabled: boolean;
  onShowSearchPrefToggle: (val: boolean) => void;
  showSearchPrefPending: boolean;
  matchPrefVisibleEnabled: boolean;
  onMatchPrefVisibleToggle: (val: boolean) => void;
  matchPrefVisiblePending: boolean;
  searchPrefLockedEnabled: boolean;
  onSearchPrefLockedToggle: (val: boolean) => void;
  searchPrefLockedPending: boolean;
  refetchIntervalInput: string;
  setRefetchIntervalInput: (val: string) => void;
  onRefetchIntervalEndEditing: () => void;
  coordMaxAgeInput: string;
  setCoordMaxAgeInput: (val: string) => void;
  onCoordMaxAgeEndEditing: () => void;
  motoclubCreationEnabled: boolean;
  onMotoclubCreationToggle: (val: boolean) => void;
  motoclubCreationPending: boolean;
  matchingTriggerFeedback: string | null;
}

export function MatchingEngineSection({
  expanded,
  onToggle,
  alwaysExpanded = false,
  autoMatchEnabled,
  onAutoMatchToggle,
  autoMatchPending,
  showSearchPrefEnabled,
  onShowSearchPrefToggle,
  showSearchPrefPending,
  matchPrefVisibleEnabled,
  onMatchPrefVisibleToggle,
  matchPrefVisiblePending,
  searchPrefLockedEnabled,
  onSearchPrefLockedToggle,
  searchPrefLockedPending,
  refetchIntervalInput,
  setRefetchIntervalInput,
  onRefetchIntervalEndEditing,
  coordMaxAgeInput,
  setCoordMaxAgeInput,
  onCoordMaxAgeEndEditing,
  motoclubCreationEnabled,
  onMotoclubCreationToggle,
  motoclubCreationPending,
  matchingTriggerFeedback,
}: MatchingEngineSectionProps) {
  const t = useT();

  const { data: matchingStats } = useQuery<{
    totalZavorrinaMatches: number;
    totalBikerBikerMatches: number;
    totalMusicMatches: number;
    lastRunAt: string | null;
  }>({
    queryKey: ["/api/admin/matching/stats"],
  });

  const matchingTriggerMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(new URL("/api/admin/matching/trigger", getApiUrl()).toString(), {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/matching/stats"] });
    },
    onError: (e: Error) => Alert.alert("Errore", (e as Error).message),
  });

  return (
    <View style={styles.accordionPanel}>
      {!alwaysExpanded && (
        <TouchableOpacity style={styles.accordionPanelHeader} onPress={onToggle}>
          <View style={styles.synecoInfo}>
            <Ionicons name="git-network" size={20} color={Colors.warning} />
            <Text style={styles.accordionPanelTitle}>Matching Engine</Text>
          </View>
          <Ionicons name={expanded ? "chevron-up" : "chevron-down"} size={18} color={Colors.textSecondary} />
        </TouchableOpacity>
      )}
      {(expanded || alwaysExpanded) && (
        <View style={[styles.accordionPanelContent, alwaysExpanded && { borderTopWidth: 0 }]}>
          <View style={styles.paidCard}>
            <View style={styles.synecoHeader}>
              <View style={styles.synecoInfo}>
                <Ionicons name="git-compare" size={20} color={Colors.warning} />
                <Text style={styles.synecoLabel}>Match Automatico</Text>
              </View>
              <Switch
                value={autoMatchEnabled}
                onValueChange={onAutoMatchToggle}
                trackColor={{ false: Colors.border, true: Colors.warning }}
                thumbColor={autoMatchEnabled ? Colors.text : Colors.textSecondary}
                disabled={autoMatchPending}
              />
            </View>
            <Text style={styles.synecoDesc}>
              {autoMatchEnabled ? t("admin.matchEngineActive") : t("admin.matchEngineInactive")}
            </Text>
          </View>

          <View style={styles.paidCard}>
            <View style={styles.synecoHeader}>
              <View style={styles.synecoInfo}>
                <Ionicons name="search" size={20} color={Colors.warning} />
                <Text style={styles.synecoLabel}>Mostra "Ricerca Match con..."</Text>
              </View>
              <Switch
                value={showSearchPrefEnabled}
                onValueChange={onShowSearchPrefToggle}
                trackColor={{ false: Colors.border, true: Colors.warning }}
                thumbColor={showSearchPrefEnabled ? Colors.text : Colors.textSecondary}
                disabled={showSearchPrefPending}
              />
            </View>
            <Text style={styles.synecoDesc}>
              {showSearchPrefEnabled ? t("admin.searchMatchVisible") : t("admin.searchMatchHidden")}
            </Text>
          </View>

          <View style={styles.paidCard}>
            <View style={styles.synecoHeader}>
              <View style={styles.synecoInfo}>
                <Ionicons name="options" size={20} color={Colors.warning} />
                <Text style={styles.synecoLabel}>Preferenze Matching visibili</Text>
              </View>
              <Switch
                value={matchPrefVisibleEnabled}
                onValueChange={onMatchPrefVisibleToggle}
                trackColor={{ false: Colors.border, true: Colors.warning }}
                thumbColor={matchPrefVisibleEnabled ? Colors.text : Colors.textSecondary}
                disabled={matchPrefVisiblePending}
              />
            </View>
            <Text style={styles.synecoDesc}>
              {matchPrefVisibleEnabled ? "Sezione Preferenze Matching visibile nel profilo utente" : "Sezione Preferenze Matching nascosta nel profilo utente"}
            </Text>
          </View>

          <View style={styles.paidCard}>
            <View style={styles.synecoHeader}>
              <View style={styles.synecoInfo}>
                <Ionicons name="lock-closed" size={20} color={Colors.warning} />
                <Text style={styles.synecoLabel}>Blocca scelta ricerca match</Text>
              </View>
              <Switch
                value={searchPrefLockedEnabled}
                onValueChange={onSearchPrefLockedToggle}
                trackColor={{ false: Colors.border, true: Colors.warning }}
                thumbColor={searchPrefLockedEnabled ? Colors.text : Colors.textSecondary}
                disabled={searchPrefLockedPending}
              />
            </View>
            <Text style={styles.synecoDesc}>
              {searchPrefLockedEnabled ? 'Utenti bloccati su "Entrambi", non possono cambiare scelta' : "Utenti liberi di scegliere la propria preferenza di ricerca"}
            </Text>
          </View>

          <View style={styles.paidCard}>
            <View style={styles.synecoHeader}>
              <View style={styles.synecoInfo}>
                <Ionicons name="refresh" size={20} color={Colors.warning} />
                <Text style={styles.synecoLabel}>Aggiorna Coordinate (sec)</Text>
              </View>
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <TextInput
                  style={{ borderWidth: 1, borderColor: Colors.border, borderRadius: 6, paddingHorizontal: 10, paddingVertical: 4, width: 70, color: Colors.text, fontSize: 14, textAlign: "center", backgroundColor: Colors.surface }}
                  keyboardType="numeric"
                  value={refetchIntervalInput}
                  onChangeText={setRefetchIntervalInput}
                  onEndEditing={onRefetchIntervalEndEditing}
                />
              </View>
            </View>
            <Text style={styles.synecoDesc}>
              Ogni quanti secondi i client aggiornano le proprie coordinate nella tab Match (min 5s, default 30s)
            </Text>
          </View>

          <View style={styles.paidCard}>
            <View style={styles.synecoHeader}>
              <View style={styles.synecoInfo}>
                <Ionicons name="time" size={20} color={Colors.warning} />
                <Text style={styles.synecoLabel}>{t("admin.maxCoordAge")}</Text>
              </View>
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <TextInput
                  style={{ borderWidth: 1, borderColor: Colors.border, borderRadius: 6, paddingHorizontal: 10, paddingVertical: 4, width: 70, color: Colors.text, fontSize: 14, textAlign: "center", backgroundColor: Colors.surface }}
                  keyboardType="numeric"
                  value={coordMaxAgeInput}
                  onChangeText={setCoordMaxAgeInput}
                  onEndEditing={onCoordMaxAgeEndEditing}
                />
              </View>
            </View>
            <Text style={styles.synecoDesc}>
              {t("admin.coordAgeDesc")}
            </Text>
          </View>

          <View style={styles.paidCard}>
            <View style={styles.synecoHeader}>
              <View style={styles.synecoInfo}>
                <Ionicons name="people" size={20} color={Colors.warning} />
                <Text style={styles.synecoLabel}>Creazione Club da Utenti</Text>
              </View>
              <Switch
                value={motoclubCreationEnabled}
                onValueChange={onMotoclubCreationToggle}
                trackColor={{ false: Colors.border, true: Colors.warning }}
                thumbColor={motoclubCreationEnabled ? Colors.text : Colors.textSecondary}
                disabled={motoclubCreationPending}
              />
            </View>
            <Text style={styles.synecoDesc}>
              {motoclubCreationEnabled ? "Gli utenti possono richiedere la creazione di nuovi motoclub" : "Creazione motoclub da utenti disabilitata"}
            </Text>
          </View>

          <View style={styles.paidCard}>
            <View style={styles.synecoHeader}>
              <View style={styles.synecoInfo}>
                <Ionicons name="bar-chart" size={20} color={Colors.warning} />
                <Text style={styles.synecoLabel}>Status Matching</Text>
              </View>
              <TouchableOpacity
                onPress={() => matchingTriggerMutation.mutate()}
                disabled={matchingTriggerMutation.isPending}
                style={[styles.triggerBtn, matchingTriggerMutation.isPending && { opacity: 0.5 }]}
              >
                {matchingTriggerMutation.isPending
                  ? <ActivityIndicator size="small" color={Colors.text} />
                  : <Text style={styles.triggerBtnText}>Esegui Ora</Text>}
              </TouchableOpacity>
            </View>
            <View style={styles.matchingStatsRow}>
              <View style={styles.matchingStatItem}>
                <Text style={styles.matchingStatValue}>{matchingStats?.totalZavorrinaMatches ?? "—"}</Text>
                <Text style={styles.matchingStatLabel}>Match Garage</Text>
              </View>
              <View style={styles.matchingStatDivider} />
              <View style={styles.matchingStatItem}>
                <Text style={styles.matchingStatValue}>{matchingStats?.totalBikerBikerMatches ?? "—"}</Text>
                <Text style={styles.matchingStatLabel}>Match Biker</Text>
              </View>
              <View style={styles.matchingStatDivider} />
              <View style={styles.matchingStatItem}>
                <Text style={styles.matchingStatValue}>{matchingStats?.totalMusicMatches ?? "—"}</Text>
                <Text style={styles.matchingStatLabel}>Match Music</Text>
              </View>
            </View>
            {matchingTriggerFeedback && (
              <Text style={[styles.feedbackText, { color: Colors.accent }]}>
                {matchingTriggerFeedback}
              </Text>
            )}
            {matchingStats?.lastRunAt && (
              <Text style={[styles.synecoDesc, { textAlign: "center", marginTop: 8 }]}>
                Ultima esecuzione: {new Date(matchingStats.lastRunAt).toLocaleString()}
              </Text>
            )}
          </View>
        </View>
      )}
    </View>
  );
}
