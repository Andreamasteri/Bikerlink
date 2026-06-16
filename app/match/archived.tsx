import React, { useCallback } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert } from "react-native";
import { Stack } from "expo-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/colors";
import { useT } from "@/lib/language-context";
import { apiRequest, queryClient } from "@/lib/query-client";

interface ArchivedRow {
  id: string;
  createdAt?: string;
  archivedAt?: string;
  otherNickname?: string;
  score?: number;
}

function useArchived(path: string) {
  return useQuery<ArchivedRow[]>({
    queryKey: [path],
    refetchOnMount: true,
  });
}

export default function ArchivedMatchesScreen() {
  const t = useT();
  const insets = useSafeAreaInsets();
  const garage = useArchived("/api/proposals/garage-matches/archived");
  const biker = useArchived("/api/proposals/biker-matches/archived");
  const proposalProfile = useArchived("/api/proposals/proposal-profile-matches/archived");
  const proposal = useArchived("/api/proposals/matches/archived");

  const reactivateGarage = useMutation({
    mutationFn: (id: string) => apiRequest("POST", `/api/proposals/garage-matches/${id}/reactivate`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/proposals/garage-matches/archived"] });
      queryClient.invalidateQueries({ queryKey: ["/api/proposals/garage-matches"] });
      queryClient.invalidateQueries({ queryKey: ["/api/proposals/matches/fresh"] });
    },
    onError: () => Alert.alert(t("common.error"), t("common.retry")),
  });

  const reactivateBiker = useMutation({
    mutationFn: (id: string) => apiRequest("POST", `/api/proposals/biker-matches/${id}/reactivate`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/proposals/biker-matches/archived"] });
      queryClient.invalidateQueries({ queryKey: ["/api/proposals/biker-matches"] });
      queryClient.invalidateQueries({ queryKey: ["/api/proposals/matches/fresh"] });
    },
    onError: () => Alert.alert(t("common.error"), t("common.retry")),
  });

  const reactivateProposalProfile = useMutation({
    mutationFn: (id: string) => apiRequest("POST", `/api/proposals/proposal-profile-matches/${id}/reactivate`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/proposals/proposal-profile-matches/archived"] });
      queryClient.invalidateQueries({ queryKey: ["/api/proposals/proposal-profile-matches"] });
      queryClient.invalidateQueries({ queryKey: ["/api/proposals/matches/fresh"] });
    },
    onError: () => Alert.alert(t("common.error"), t("common.retry")),
  });

  const reactivateProposal = useMutation({
    mutationFn: (id: string) => apiRequest("POST", `/api/proposals/matches/${id}/reactivate`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/proposals/matches/archived"] });
      queryClient.invalidateQueries({ queryKey: ["/api/proposals/matches"] });
      queryClient.invalidateQueries({ queryKey: ["/api/proposals/matches/fresh"] });
    },
    onError: () => Alert.alert(t("common.error"), t("common.retry")),
  });

  const renderRow = useCallback(
    (item: ArchivedRow, kind: "garage" | "biker" | "proposalProfile" | "proposal") => {
      const name = item.otherNickname ?? "?";
      const date = item.archivedAt ? new Date(item.archivedAt).toLocaleDateString() : "";
      const mutation =
        kind === "garage" ? reactivateGarage
        : kind === "biker" ? reactivateBiker
        : kind === "proposalProfile" ? reactivateProposalProfile
        : reactivateProposal;
      const isPending = mutation.isPending && mutation.variables === item.id;
      return (
        <View key={item.id} style={styles.row}>
          <View style={{ flex: 1 }}>
            <Text style={styles.name} numberOfLines={1}>
              {name}
            </Text>
            <Text style={styles.date}>{date}</Text>
          </View>
          <TouchableOpacity
            style={styles.reactivateBtn}
            disabled={isPending}
            onPress={() => mutation.mutate(item.id)}
          >
            {isPending ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <Ionicons name="refresh" size={14} color="#fff" />
                <Text style={styles.reactivateText}>{t("match.reactivate")}</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      );
    },
    [reactivateGarage, reactivateBiker, reactivateProposalProfile, reactivateProposal, t],
  );

  const loading = garage.isLoading || biker.isLoading || proposalProfile.isLoading || proposal.isLoading;
  const garageRows = garage.data ?? [];
  const bikerRows = biker.data ?? [];
  const proposalProfileRows = proposalProfile.data ?? [];
  const proposalRows = proposal.data ?? [];
  const empty = !loading && garageRows.length === 0 && bikerRows.length === 0 && proposalProfileRows.length === 0 && proposalRows.length === 0;

  return (
    <>
      <Stack.Screen options={{ title: t("match.archived") }} />
      <ScrollView
        style={styles.container}
        contentContainerStyle={{ paddingBottom: insets.bottom + 24, paddingTop: 12 }}
      >
        {loading && <ActivityIndicator color={Colors.accent} style={{ marginTop: 24 }} />}
        {empty && (
          <View style={styles.emptyWrap}>
            <Ionicons name="archive-outline" size={48} color={Colors.textSecondary} />
            <Text style={styles.emptyText}>{t("match.archivedEmpty")}</Text>
          </View>
        )}
        {garageRows.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Biker ↔ Zavorrina</Text>
            {garageRows.map((r) => renderRow(r, "garage"))}
          </View>
        )}
        {bikerRows.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Biker ↔ Biker</Text>
            {bikerRows.map((r) => renderRow(r, "biker"))}
          </View>
        )}
        {proposalProfileRows.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Proposal ↔ Profile</Text>
            {proposalProfileRows.map((r) => renderRow(r, "proposalProfile"))}
          </View>
        )}
        {proposalRows.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Proposal ↔ Proposal</Text>
            {proposalRows.map((r) => renderRow(r, "proposal"))}
          </View>
        )}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  section: { marginHorizontal: 12, marginTop: 16 },
  sectionTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 13,
    color: Colors.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.surface,
    padding: 12,
    borderRadius: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 12,
  },
  name: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: Colors.text },
  date: { fontFamily: "Inter_400Regular", fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  reactivateBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: Colors.accent,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  reactivateText: { color: "#fff", fontFamily: "Inter_600SemiBold", fontSize: 13 },
  emptyWrap: { alignItems: "center", padding: 40, gap: 12 },
  emptyText: { fontFamily: "Inter_500Medium", fontSize: 14, color: Colors.textSecondary },
});
