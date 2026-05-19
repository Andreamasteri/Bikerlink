import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  Alert,
} from "react-native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams } from "expo-router";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/colors";
import { apiRequest, getApiUrl } from "@/lib/query-client";

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

  const recalcMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/admin/users/${userId}/matches/recalculate`);
      return res.json();
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey });
      Alert.alert(
        "Ricalcolo completato",
        `Nuovi match: ${result.bikerBiker ?? 0} B-B + ${result.zavarrina ?? 0} B-Z`,
      );
    },
    onError: () => Alert.alert("Errore", "Ricalcolo fallito"),
  });

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
  const totalMatches = matchesByType.reduce((s, t) => s + t.count, 0);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
    >
      <View style={styles.userCard}>
        {user.avatarUrl ? (
          <Image source={{ uri: user.avatarUrl }} style={styles.avatar} />
        ) : (
          <View style={styles.avatarPlaceholder}>
            <Text style={styles.avatarLetter}>{user.nickname.charAt(0).toUpperCase()}</Text>
          </View>
        )}
        <View style={styles.userMeta}>
          <Text style={styles.userNickname}>{user.nickname}</Text>
          <Text style={styles.userType}>{user.userType} · {user.role}</Text>
          <Text style={styles.gpsInfo}>
            <MaterialCommunityIcons name="map-marker-path" size={12} color={Colors.textSecondary} />
            {" "}{gpsRouteCount} percorsi GPS
          </Text>
        </View>
        <View style={styles.totalBadge}>
          <Text style={styles.totalNum}>{totalMatches}</Text>
          <Text style={styles.totalLabel}>match totali</Text>
        </View>
      </View>

      <View style={styles.actionsRow}>
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
          <Text style={styles.recalcText}>Ricalcola ora</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.sectionTitle}>17 Tipi di Match</Text>

      {matchesByType.map((section) => {
        const expanded = expandedTypes.has(section.typeKey);
        const badgeColor = section.disabled
          ? Colors.textSecondary
          : section.insufficientData
          ? "#2196F3"
          : Colors.accent;

        return (
          <View key={section.typeKey} style={styles.typeCard}>
            <TouchableOpacity
              style={styles.typeHeader}
              onPress={() => toggleType(section.typeKey)}
              activeOpacity={0.7}
            >
              <View style={styles.typeHeaderLeft}>
                <Text style={styles.typeName}>{section.typeName}</Text>
                <View style={styles.typeBadges}>
                  <View style={[styles.countBadge, { backgroundColor: badgeColor + "22", borderColor: badgeColor }]}>
                    <Text style={[styles.countBadgeText, { color: badgeColor }]}>{section.count}</Text>
                  </View>
                  {section.disabled && (
                    <View style={styles.statusPill}>
                      <Text style={styles.statusPillText}>DISABILITATO</Text>
                    </View>
                  )}
                  {!section.disabled && section.insufficientData && (
                    <View style={[styles.statusPill, { backgroundColor: "#2196F333" }]}>
                      <Text style={[styles.statusPillText, { color: "#2196F3" }]}>DATI GPS MANCANTI</Text>
                    </View>
                  )}
                </View>
              </View>
              <Ionicons
                name={expanded ? "chevron-up" : "chevron-down"}
                size={18}
                color={Colors.textSecondary}
              />
            </TouchableOpacity>

            {expanded && (
              <View style={styles.matchList}>
                {section.matches.length === 0 ? (
                  <Text style={styles.emptyMatches}>Nessun match per questo tipo</Text>
                ) : (
                  section.matches.map((match) => (
                    <View key={match.id} style={styles.matchRow}>
                      {match.matchedAvatarUrl ? (
                        <Image source={{ uri: match.matchedAvatarUrl }} style={styles.matchAvatar} />
                      ) : (
                        <View style={styles.matchAvatarPlaceholder}>
                          <Text style={styles.matchAvatarLetter}>
                            {match.matchedNickname.charAt(0).toUpperCase()}
                          </Text>
                        </View>
                      )}
                      <View style={styles.matchInfo}>
                        <Text style={styles.matchNickname}>{match.matchedNickname}</Text>
                        <View style={styles.matchMeta}>
                          {match.distanceKm != null && (
                            <Text style={styles.matchMetaText}>
                              <Ionicons name="location-outline" size={11} color={Colors.textSecondary} />
                              {" "}{match.distanceKm} km
                            </Text>
                          )}
                          <Text style={styles.matchMetaText}>{formatDate(match.createdAt)}</Text>
                          {match.isSupermatch && (
                            <View style={styles.superBadge}>
                              <Text style={styles.superText}>⭐</Text>
                            </View>
                          )}
                        </View>
                      </View>
                      <View style={[styles.statusDot, { backgroundColor: statusColor(match.status) }]} />
                    </View>
                  ))
                )}
                {section.count > 50 && (
                  <Text style={styles.truncNote}>Mostrati 50 di {section.count} match</Text>
                )}
              </View>
            )}
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  loadingContainer: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: Colors.background },
  errorText: { fontFamily: "Inter_400Regular", fontSize: 15, color: Colors.textSecondary },
  userCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.surface,
    margin: 16,
    borderRadius: 16,
    padding: 16,
    gap: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  avatar: { width: 56, height: 56, borderRadius: 28 },
  avatarPlaceholder: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.accent + "33",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarLetter: { fontFamily: "Inter_700Bold", fontSize: 22, color: Colors.accent },
  userMeta: { flex: 1, gap: 2 },
  userNickname: { fontFamily: "Inter_700Bold", fontSize: 17, color: Colors.text },
  userType: { fontFamily: "Inter_400Regular", fontSize: 13, color: Colors.textSecondary },
  gpsInfo: { fontFamily: "Inter_400Regular", fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  totalBadge: { alignItems: "center" },
  totalNum: { fontFamily: "Inter_700Bold", fontSize: 24, color: Colors.accent },
  totalLabel: { fontFamily: "Inter_400Regular", fontSize: 10, color: Colors.textSecondary },
  actionsRow: {
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 16,
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
  sectionTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 13,
    color: Colors.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  typeCard: {
    marginHorizontal: 12,
    marginBottom: 8,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: "hidden",
  },
  typeHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  typeHeaderLeft: { flex: 1, gap: 4 },
  typeName: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: Colors.text },
  typeBadges: { flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" },
  countBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
    borderWidth: 1,
  },
  countBadgeText: { fontFamily: "Inter_700Bold", fontSize: 12 },
  statusPill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: Colors.textSecondary + "22",
  },
  statusPillText: { fontFamily: "Inter_600SemiBold", fontSize: 9, color: Colors.textSecondary },
  matchList: {
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingVertical: 4,
  },
  emptyMatches: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: Colors.textSecondary,
    textAlign: "center",
    paddingVertical: 12,
  },
  matchRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 8,
    gap: 10,
  },
  matchAvatar: { width: 32, height: 32, borderRadius: 16 },
  matchAvatarPlaceholder: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.surfaceLight,
    alignItems: "center",
    justifyContent: "center",
  },
  matchAvatarLetter: { fontFamily: "Inter_700Bold", fontSize: 13, color: Colors.textSecondary },
  matchInfo: { flex: 1, gap: 2 },
  matchNickname: { fontFamily: "Inter_600SemiBold", fontSize: 13, color: Colors.text },
  matchMeta: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  matchMetaText: { fontFamily: "Inter_400Regular", fontSize: 11, color: Colors.textSecondary },
  superBadge: {
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 4,
    backgroundColor: "#FFD70022",
  },
  superText: { fontSize: 10 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  truncNote: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    color: Colors.textSecondary,
    textAlign: "center",
    paddingBottom: 8,
  },
});
