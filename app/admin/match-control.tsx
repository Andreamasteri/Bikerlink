// Task #2603 — split mechanical: stili, types, FreshnessSlider e EngineActionsCard
// estratti in app/admin/match-control/.
import React, { useMemo } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Switch,
  Alert,
} from "react-native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { MaterialCommunityIcons, Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/colors";
import { apiRequest } from "@/lib/query-client";
// Task #2527 — sotto-componenti estratti per ridurre la dimensione del file.
import { CycleMetaCard } from "@/components/admin/matching/CycleMetaCard";
import { LockCard } from "@/components/admin/matching/LockCard";
import { StatsTable } from "@/components/admin/matching/StatsTable";
import { styles } from "@/components/admin/match-control/styles";
import { FreshnessSlider } from "./match-control/FreshnessSlider";
import { EngineActionsCard } from "./match-control/EngineActionsCard";
import {
  AppSettingRow,
  FRESHNESS_KEYS,
  MUSIC_KEYS,
  MatchSettingsResponse,
  MatchingStatsResponse,
  LockStateResponse,
} from "@/components/admin/match-control/types";

export default function MatchControlScreen() {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const router = useRouter();

  const { data, isLoading, refetch } = useQuery<MatchSettingsResponse>({
    queryKey: ["/api/admin/match-settings"],
    refetchInterval: 15000,
    staleTime: 5000,
  });

  const { data: matchingStats } = useQuery<MatchingStatsResponse>({
    queryKey: ["/api/admin/matching-stats"],
    refetchInterval: 30000,
    staleTime: 10000,
  });

  const { data: lockState, refetch: refetchLock } = useQuery<LockStateResponse>({
    queryKey: ["/api/admin/matching/lock-state"],
    refetchInterval: 5000,
    staleTime: 2000,
  });

  const toggleMutation = useMutation({
    mutationFn: async (val: boolean) => {
      await apiRequest("PUT", "/api/admin/settings/match_preferences_visible", {
        value: val ? "true" : "false",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/match-settings"] });
    },
    onError: () => Alert.alert("Errore", "Impossibile aggiornare l'impostazione"),
  });

  const { data: allSettings, refetch: refetchSettings } = useQuery<AppSettingRow[]>({
    queryKey: ["/api/admin/settings"],
    staleTime: 30000,
  });

  const freshness = useMemo(() => {
    const find = (k: string) => allSettings?.find((s) => s.key === k)?.value;
    const num = (v: string | null | undefined, dflt: number) => {
      const n = v != null ? Number(v) : NaN;
      return Number.isFinite(n) ? n : dflt;
    };
    return {
      halflifeGeneric: num(find(FRESHNESS_KEYS.halflifeGeneric), 7),
      halflifeProposal: num(find(FRESHNESS_KEYS.halflifeProposal), 2),
      archiveAfter: num(find(FRESHNESS_KEYS.archiveAfter), 30),
    };
  }, [allSettings]);

  const musicAffinity = useMemo(() => {
    const find = (k: string) => allSettings?.find((s) => s.key === k)?.value;
    const num = (v: string | null | undefined, dflt: number) => {
      const n = v != null ? Number(v) : NaN;
      return Number.isFinite(n) ? n : dflt;
    };
    return {
      musicK: num(find(MUSIC_KEYS.musicK), 5),
      musicThreshold: num(find(MUSIC_KEYS.musicThreshold), 0.55),
    };
  }, [allSettings]);

  const settingMutation = useMutation({
    mutationFn: async (vars: { key: string; value: number }) => {
      await apiRequest("PUT", `/api/admin/settings/${vars.key}`, { value: String(vars.value) });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/settings"] });
      refetchSettings();
    },
    onError: () => Alert.alert("Errore", "Impossibile salvare l'impostazione"),
  });

  const visible = data?.visible ?? false;
  const autoMatchEnabled = data?.autoMatchEnabled ?? true;
  const cycleMeta = data?.cycleMeta ?? null;
  const stats = data?.stats ?? [];
  const anomalies = stats.filter((s) => s.isAnomaly);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
    >
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Stato Motore</Text>

        {/* Task #2527 — estratto in components/admin/matching/CycleMetaCard.tsx */}
        <CycleMetaCard
          autoMatchEnabled={autoMatchEnabled}
          cycleMeta={cycleMeta}
          isLoading={isLoading}
        />
      </View>

      {matchingStats && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Statistiche Match</Text>
          <View style={styles.statsCard}>
            <View style={styles.statsHeaderRow}>
              <Text style={[styles.statsHeaderCell, { flex: 2 }]} />
              <Text style={[styles.statsHeaderCell, { flex: 1 }]}>Nuovi</Text>
              <Text style={[styles.statsHeaderCell, { flex: 1 }]}>Accettati</Text>
              <Text style={[styles.statsHeaderCell, { flex: 1 }]}>Rifiutati</Text>
              <Text style={[styles.statsHeaderCell, { flex: 1 }]}>Tot.</Text>
            </View>
            <View style={styles.statsDataRow}>
              <Text style={[styles.statsLabel, { flex: 2 }]}>Biker-Biker</Text>
              <Text style={[styles.statsValue, { flex: 1 }]}>{matchingStats.bikerBiker.new}</Text>
              <Text style={[styles.statsValue, { flex: 1 }, styles.accepted]}>{matchingStats.bikerBiker.accepted}</Text>
              <Text style={[styles.statsValue, { flex: 1 }, styles.rejected]}>{matchingStats.bikerBiker.rejected}</Text>
              <Text style={[styles.statsValue, { flex: 1 }]}>{matchingStats.bikerBiker.total}</Text>
            </View>
            <View style={[styles.statsDataRow, styles.statsDataRowAlt]}>
              <Text style={[styles.statsLabel, { flex: 2 }]}>Biker-Zavorrina</Text>
              <Text style={[styles.statsValue, { flex: 1 }]}>{matchingStats.bikerZavorrina.new}</Text>
              <Text style={[styles.statsValue, { flex: 1 }, styles.accepted]}>{matchingStats.bikerZavorrina.accepted}</Text>
              <Text style={[styles.statsValue, { flex: 1 }, styles.rejected]}>{matchingStats.bikerZavorrina.rejected}</Text>
              <Text style={[styles.statsValue, { flex: 1 }]}>{matchingStats.bikerZavorrina.total}</Text>
            </View>
          </View>
        </View>
      )}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Freshness & Archiviazione Match</Text>
        <View style={styles.freshnessCard}>
          <Text style={styles.freshnessHelp}>
            I match vengono ordinati per dynamicScore = baseScore × decadimento esponenziale.
            Più basso il half-life, più rapido il decadimento.
          </Text>
          <FreshnessSlider
            label="Half-life generico (biker-biker, garage)"
            value={freshness.halflifeGeneric}
            min={1}
            max={30}
            step={0.5}
            unit="giorni"
            onCommit={(v) => settingMutation.mutate({ key: FRESHNESS_KEYS.halflifeGeneric, value: v })}
          />
          <FreshnessSlider
            label="Half-life proposte"
            value={freshness.halflifeProposal}
            min={0.5}
            max={14}
            step={0.5}
            unit="giorni"
            onCommit={(v) => settingMutation.mutate({ key: FRESHNESS_KEYS.halflifeProposal, value: v })}
          />
          <FreshnessSlider
            label="Auto-archivia match 'new' dopo"
            value={freshness.archiveAfter}
            min={7}
            max={120}
            step={1}
            unit="giorni"
            onCommit={(v) => settingMutation.mutate({ key: FRESHNESS_KEYS.archiveAfter, value: v })}
          />
        </View>
        <TouchableOpacity
          style={styles.archiveLinkBtn}
          onPress={() => router.push("/match/archived" as never)}
          activeOpacity={0.8}
        >
          <Ionicons name="archive-outline" size={18} color={Colors.accent} />
          <Text style={styles.archiveLinkText}>Visualizza match archiviati</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Music Affinity</Text>
        <View style={styles.freshnessCard}>
          <Text style={styles.freshnessHelp}>
            K = numero di vicini musicali confrontati per utente (min 1).{"\n"}
            Soglia = similarità Jaccard minima per considerare due gusti compatibili (0–1).
          </Text>
          <FreshnessSlider
            label="K vicini musicali (match_music_k)"
            value={musicAffinity.musicK}
            min={1}
            max={50}
            step={1}
            unit=""
            onCommit={(v) => settingMutation.mutate({ key: MUSIC_KEYS.musicK, value: Math.round(v) })}
          />
          <FreshnessSlider
            label="Soglia affinità (music_taste_combined)"
            value={musicAffinity.musicThreshold}
            min={0}
            max={1}
            step={0.05}
            unit=""
            onCommit={(v) => settingMutation.mutate({ key: MUSIC_KEYS.musicThreshold, value: Math.round(v * 100) / 100 })}
          />
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Visibilità Preferenze</Text>
        <View style={styles.toggleCard}>
          <View style={styles.toggleLeft}>
            <MaterialCommunityIcons
              name={visible ? "eye" : "eye-off"}
              size={24}
              color={visible ? Colors.success : Colors.textSecondary}
            />
            <View style={styles.toggleTextWrap}>
              <Text style={styles.toggleLabel}>
                Sezione preferenze match visibile agli utenti
              </Text>
              <Text style={styles.toggleSubtext}>
                {visible
                  ? "Gli utenti vedono e gestiscono i propri switch"
                  : "La sezione è nascosta per tutti gli utenti"}
              </Text>
            </View>
          </View>
          <Switch
            value={visible}
            onValueChange={(val) => toggleMutation.mutate(val)}
            trackColor={{ false: Colors.border, true: Colors.success + "88" }}
            thumbColor={visible ? Colors.success : Colors.textSecondary}
            disabled={toggleMutation.isPending}
          />
        </View>
      </View>

      <View style={styles.section}>
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>Motore Matching</Text>
          <TouchableOpacity onPress={() => { refetch(); refetchLock(); }} style={styles.refreshBtn}>
            <Ionicons name="refresh" size={15} color={Colors.accent} />
          </TouchableOpacity>
        </View>

        {/* Task #2527 — estratto in components/admin/matching/LockCard.tsx */}
        <LockCard lockState={lockState} />

        <EngineActionsCard
          anomaliesCount={anomalies.length}
          queryClient={queryClient}
          refetch={refetch}
          refetchLock={refetchLock}
        />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Statistiche per Tipo di Match</Text>
        {/* Task #2527 — estratto in components/admin/matching/StatsTable.tsx */}
        <StatsTable stats={stats} isLoading={isLoading} />
      </View>
    </ScrollView>
  );
}
