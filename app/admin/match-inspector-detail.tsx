import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Pressable,
  ActivityIndicator,
  Alert,
  Switch,
} from "react-native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams } from "expo-router";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/colors";
import { apiRequest, getApiUrl } from "@/lib/query-client";
import { MatchUserCard } from "@/components/admin/match-inspector/MatchUserCard";
import { PreferencesDiffCard } from "@/components/admin/match-inspector/PreferencesDiffCard";
import { MatchTypeCard } from "@/components/admin/match-inspector/MatchTypeCard";
import { ProfileGapsCard } from "@/components/admin/match-inspector/ProfileGapsCard";

interface MatchItem {
  id: string;
  matchedUserId: string;
  matchedNickname: string;
  matchedAvatarUrl: string | null;
  distanceKm: number | null;
  status: string;
  isSupermatch: boolean;
  createdAt: string;
}

interface MatchTypeSection {
  typeKey: string;
  typeName: string;
  count: number;
  disabled: boolean;
  insufficientData: boolean;
  matches: MatchItem[];
}

interface DetailResponse {
  user: {
    id: string;
    nickname: string;
    avatarUrl: string | null;
    userType: string;
    role: string;
    status: string;
  };
  gpsRouteCount: number;
  matchesByType: MatchTypeSection[];
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("it-IT", { day: "2-digit", month: "short", year: "2-digit" });
  } catch {
    return iso;
  }
}

function statusColor(status: string): string {
  switch (status) {
    case "accepted": return Colors.success;
    case "rejected": return Colors.error;
    default: return Colors.textSecondary;
  }
}

export default function MatchInspectorDetailScreen() {
  const { userId } = useLocalSearchParams<{ userId: string }>();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const [expandedTypes, setExpandedTypes] = useState<Set<string>>(new Set());
  const [deletedAt, setDeletedAt] = useState<string | null>(null);
  const [autoRecalc, setAutoRecalc] = useState(false);

  const queryKey = ["/api/admin/users", userId, "matches"];

  const { data, isLoading, refetch } = useQuery<DetailResponse>({
    queryKey,
    queryFn: async () => {
      const base = getApiUrl();
      const url = new URL(`/api/admin/users/${userId}/matches`, base);
      const res = await fetch(url.toString(), { credentials: "include" });
      if (!res.ok) throw new Error("Errore caricamento");
      return res.json();
    },
    enabled: !!userId,
    refetchInterval: 10000,
    staleTime: 5000,
  });

  const totalMatches = data?.matchesByType.reduce((s, t) => s + t.count, 0) ?? 0;

  const recalcMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/admin/users/${userId}/matches/recalculate`);
      return res.json();
    },
    onSuccess: (result) => {
      setDeletedAt(null);
      queryClient.invalidateQueries({ queryKey });
      Alert.alert(
        "Ricalcolo completato",
        `Nuovi match: ${result.bikerBiker ?? 0} B-B + ${result.zavarrina ?? 0} B-Z`,
      );
    },
    onError: () => Alert.alert("Errore", "Ricalcolo fallito"),
  });

  const deleteMatchesMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("DELETE", `/api/admin/users/${userId}/matches`);
      return res.json();
    },
    onSuccess: (result) => {
      setDeletedAt(result.lastDeletedAt ?? new Date().toISOString());
      queryClient.invalidateQueries({ queryKey });
      const total = result.deleted?.total ?? 0;
      const bb = result.deleted?.bikerBiker ?? 0;
      const bz = result.deleted?.bikerZavorrina ?? 0;
      const pp = result.deleted?.proposalProfile ?? 0;
      Alert.alert(
        "Match eliminati",
        `Eliminati ${total} match totali:\n${bb} biker-biker · ${bz} biker-zavorrina · ${pp} proposal`,
        [
          {
            text: "OK",
            onPress: () => {
              if (autoRecalc) {
                recalcMutation.mutate();
              }
            },
          },
        ],
      );
    },
    onError: () => Alert.alert("Errore", "Eliminazione match fallita"),
  });

  const handleDeleteMatches = () => {
    Alert.alert(
      "Elimina tutti i match",
      `Eliminare tutti i match dell'utente ${data?.user.nickname ?? ""}? L'operazione è irreversibile. Dopo potrai rilanciare il ricalcolo.`,
      [
        { text: "Annulla", style: "cancel" },
        {
          text: "Elimina",
          style: "destructive",
          onPress: () => deleteMatchesMutation.mutate(),
        },
      ],
    );
  };

  const toggleType = useCallback((typeKey: string) => {
    setExpandedTypes((prev) => {
      const next = new Set(prev);
      if (next.has(typeKey)) next.delete(typeKey);
      else next.add(typeKey);
      return next;
    });
  }, []);

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator color={Colors.accent} size="large" />
      </View>
    );
  }

  if (!data) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.errorText}>Utente non trovato</Text>
      </View>
    );
  }

  const { user, gpsRouteCount, matchesByType } = data;
  const needsRecalculate = !!deletedAt && totalMatches === 0;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
    >
      <MatchUserCard
        user={user}
        gpsRouteCount={gpsRouteCount}
        totalMatches={totalMatches}
        needsRecalculate={needsRecalculate}
        lastDeletedAt={deletedAt ?? undefined}
      />

      <View style={[styles.actionsRow, needsRecalculate && { marginTop: 12 }]}>
        <TouchableOpacity style={styles.refreshBtn} onPress={() => refetch()}>
          <Ionicons name="refresh" size={16} color={Colors.accent} />
          <Text style={styles.refreshText}>Aggiorna</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.recalcBtn, recalcMutation.isPending && { opacity: 0.6 }]}
          onPress={() => recalcMutation.mutate()}
          disabled={recalcMutation.isPending}
        >
          {recalcMutation.isPending ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <MaterialCommunityIcons name="calculator-variant" size={16} color="#fff" />
          )}
          <Text style={styles.recalcText}>
            {recalcMutation.isPending ? "Ricalcolo..." : "Ricalcola ora"}
          </Text>
        </TouchableOpacity>
      </View>

      <View style={styles.deleteMatchesRow}>
        <View style={styles.deleteMatchesTop}>
          <TouchableOpacity
            style={[styles.deleteMatchesBtn, deleteMatchesMutation.isPending && { opacity: 0.6 }]}
            onPress={handleDeleteMatches}
            disabled={deleteMatchesMutation.isPending}
          >
            {deleteMatchesMutation.isPending ? (
              <ActivityIndicator size="small" color={Colors.error} />
            ) : (
              <MaterialCommunityIcons name="delete-sweep" size={16} color={Colors.error} />
            )}
            <Text style={styles.deleteMatchesText}>
              {deleteMatchesMutation.isPending ? "Eliminazione..." : "Elimina tutti i match"}
            </Text>
          </TouchableOpacity>
        </View>
        <Pressable
          style={styles.autoRecalcRow}
          onPress={() => setAutoRecalc((v) => !v)}
        >
          <Switch
            value={autoRecalc}
            onValueChange={() => {}}
            trackColor={{ false: Colors.border, true: Colors.accent + "88" }}
            thumbColor={autoRecalc ? Colors.accent : Colors.textSecondary}
            style={styles.autoRecalcSwitch}
          />
          <Text style={styles.autoRecalcLabel}>Ricalcola automaticamente dopo l'eliminazione</Text>
        </Pressable>
      </View>

      <ProfileGapsCard userId={userId!} totalMatches={totalMatches} />

      <PreferencesDiffCard sections={matchesByType} userId={userId!} nickname={user.nickname} />

      <Text style={styles.sectionTitle}>17 Tipi di Match</Text>

      {matchesByType.map((section) => (
        <MatchTypeCard
          key={section.typeKey}
          section={section}
          expanded={expandedTypes.has(section.typeKey)}
          onToggle={() => toggleType(section.typeKey)}
          formatDate={formatDate}
          statusColor={statusColor}
          currentUserId={userId}
          currentNickname={user.nickname}
        />
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  loadingContainer: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: Colors.background },
  errorText: { fontFamily: "Inter_400Regular", fontSize: 15, color: Colors.textSecondary },
  actionsRow: {
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 16,
    marginTop: 16,
    marginBottom: 16,
  },
  refreshBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  refreshText: { fontFamily: "Inter_600SemiBold", fontSize: 13, color: Colors.accent },
  recalcBtn: {
    flex: 2,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    backgroundColor: Colors.accent,
    borderRadius: 12,
  },
  recalcText: { fontFamily: "Inter_600SemiBold", fontSize: 13, color: "#fff" },
  deleteMatchesRow: {
    paddingHorizontal: 16,
    marginBottom: 16,
    gap: 8,
  },
  deleteMatchesTop: {},
  deleteMatchesBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.error,
  },
  deleteMatchesText: { fontFamily: "Inter_600SemiBold", fontSize: 13, color: Colors.error },
  autoRecalcRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  autoRecalcSwitch: { transform: [{ scaleX: 0.85 }, { scaleY: 0.85 }] },
  autoRecalcLabel: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: Colors.textSecondary,
    flex: 1,
  },
  sectionTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 13,
    color: Colors.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    paddingHorizontal: 16,
    marginBottom: 8,
  },
});
