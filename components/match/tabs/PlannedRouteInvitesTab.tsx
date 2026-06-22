import React from "react";
import {
  View,
  Text,
  FlatList,
  ActivityIndicator,
  Alert,
} from "react-native";
import { useRouter } from "expo-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import { queryClient, apiRequest } from "@/lib/query-client";
import { useAuth } from "@/lib/auth-context";
import { useT } from "@/lib/language-context";
import { InviteCard, PlannedRouteInvite, styles } from "./PlannedRouteInvitesTab.part2";

export function PlannedRouteInvitesTab() {
  const colors = useColors();
  const router = useRouter();
  const { user } = useAuth();
  const t = useT();

  const [pendingAccept, setPendingAccept] = React.useState<string | null>(null);
  const [pendingReject, setPendingReject] = React.useState<string | null>(null);

  const { data, isLoading, refetch, isRefetching } = useQuery<{ count: number; invites: PlannedRouteInvite[] }>({
    queryKey: ["/api/planned-route-invites/mine"],
    enabled: !!user,
    refetchInterval: 60000,
    refetchOnMount: true,
  });

  const acceptMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("PATCH", `/api/planned-route-invites/${id}/respond`, { action: "accept" });
      return res.json() as Promise<{ ok: boolean; action: string; conversationId?: string }>;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/planned-route-invites/mine"] });
      setPendingAccept(null);
      if (data?.conversationId) {
        router.push(`/chat/${data.conversationId}` as never);
      }
    },
    onError: () => {
      setPendingAccept(null);
      Alert.alert(t("common.error"), t("match.giriAcceptError"));
    },
  });

  const rejectMutation = useMutation({
    mutationFn: (id: string) =>
      apiRequest("PATCH", `/api/planned-route-invites/${id}/respond`, { action: "reject" }),
    onMutate: (id) => {
      queryClient.setQueryData(
        ["/api/planned-route-invites/mine"],
        (old: { count: number; invites: PlannedRouteInvite[] } | undefined) => {
          if (!old) return old;
          const filtered = old.invites.filter((inv) => inv.id !== id);
          return { count: filtered.length, invites: filtered };
        },
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/planned-route-invites/mine"] });
      setPendingReject(null);
    },
    onError: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/planned-route-invites/mine"] });
      setPendingReject(null);
      Alert.alert(t("common.error"), t("match.giriRejectError"));
    },
  });

  const handleAccept = (id: string) => {
    Alert.alert(t("common.confirm"), t("match.giriAcceptConfirm"), [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("match.giriAccept"),
        onPress: () => {
          setPendingAccept(id);
          acceptMutation.mutate(id);
        },
      },
    ]);
  };

  const handleReject = (id: string) => {
    Alert.alert(t("common.confirm"), t("match.giriRejectConfirm"), [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("match.giriReject"),
        style: "destructive",
        onPress: () => {
          setPendingReject(id);
          rejectMutation.mutate(id);
        },
      },
    ]);
  };

  const handleViewRoute = (routeId: string) => {
    router.push(`/giri/${routeId}` as never);
  };

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  const invites = data?.invites ?? [];

  if (invites.length === 0) {
    return (
      <View style={styles.centered}>
        <Ionicons name="map-outline" size={48} color={colors.textSecondary} style={{ opacity: 0.5 }} />
        <Text style={[styles.emptyTitle, { color: colors.text }]}>{t("match.emptyGiriTitle")}</Text>
        <Text style={[styles.emptyDesc, { color: colors.textSecondary }]}>{t("match.emptyGiriDesc")}</Text>
      </View>
    );
  }

  return (
    <FlatList
      data={invites}
      keyExtractor={(item) => item.id}
      renderItem={({ item }) => (
        <InviteCard
          invite={item}
          onAccept={handleAccept}
          onReject={handleReject}
          onViewRoute={handleViewRoute}
          accepting={pendingAccept === item.id}
          rejecting={pendingReject === item.id}
        />
      )}
      refreshing={isRefetching}
      onRefresh={refetch}
      contentContainerStyle={styles.list}
      showsVerticalScrollIndicator={false}
    />
  );
}
