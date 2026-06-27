import React, { useCallback, useMemo, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from "react-native";
import { Stack, useRouter } from "expo-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { apiRequest } from "@/lib/query-client";
import { useT } from "@/lib/language-context";
import { styles } from "@/components/notifications/notifications-styles";

export interface AppNotification {
  id: string;
  title: string;
  body: string | null;
  notificationType: string;
  referenceType: string | null;
  referenceId: string | null;
  isRead: boolean;
  createdAt: string;
}

interface IncomingMatchRequest {
  id: string;
  senderId: string;
  receiverId: string;
  status: string;
  createdAt: string;
  sender: {
    id: string;
    nickname: string;
    avatarUrl: string | null;
    userType: string;
  } | null;
}

function getNotifIcon(type: string): { name: React.ComponentProps<typeof Ionicons>["name"]; color: string } {
  switch (type) {
    case "direct_match_request":
      return { name: "person-add", color: "#FF6600" };
    case "direct_match_accepted":
      return { name: "checkmark-circle", color: "#34C759" };
    case "match":
      return { name: "bicycle", color: "#FF6600" };
    case "proposal_match":
      return { name: "map", color: "#4A90E2" };
    case "sos":
      return { name: "warning", color: "#E63946" };
    case "chat":
      return { name: "chatbubble", color: "#34C759" };
    case "motoclub":
    case "motoclub_invite":
    case "motoclub_join":
      return { name: "people", color: "#AF52DE" };
    case "event_approved":
    case "event_invite":
      return { name: "calendar", color: "#4A90E2" };
    case "planned_route_invite":
      return { name: "map", color: "#FF6600" };
    default:
      return { name: "notifications", color: "#FF6600" };
  }
}

function timeAgo(dateStr: string): string {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (diff < 60) return "Adesso";
  if (diff < 3600) return `${Math.floor(diff / 60)} min fa`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} ore fa`;
  if (diff < 604800) return `${Math.floor(diff / 86400)} giorni fa`;
  return new Date(dateStr).toLocaleDateString("it-IT");
}

function getNotifRoute(item: AppNotification): string | null {
  const { notificationType: t, referenceId: rid } = item;
  switch (t) {
    case "direct_match_accepted":
      return rid ? `/profile/${rid}` : null;
    case "match":
      return rid ? `/profile/${rid}` : null;
    case "motoclub":
    case "motoclub_invite":
    case "motoclub_join":
      return rid ? `/motoclub/${rid}` : null;
    case "event_approved":
    case "event_rejected":
    case "event_invite":
      return rid ? `/evento/${rid}` : null;
    case "sos":
      return "/(tabs)/index";
    case "chat":
      return rid ? `/chat/${rid}` : null;
    case "planned_route_invite":
      return "/(tabs)/match?tab=giri";
    case "system":
      return null;
    default:
      return null;
  }
}

function NotificationItem({
  item,
  onPress,
  onDelete,
  isDeleting,
  colors,
}: {
  item: AppNotification;
  onPress: () => void;
  onDelete: () => void;
  isDeleting: boolean;
  colors: ReturnType<typeof useColors>;
}) {
  const icon = getNotifIcon(item.notificationType);
  return (
    <TouchableOpacity
      style={[
        styles.item,
        {
          backgroundColor: item.isRead ? colors.surface : (colors.background ?? colors.surface),
          borderBottomColor: colors.border,
        },
        !item.isRead && { borderLeftWidth: 3, borderLeftColor: colors.accent },
      ]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={[styles.iconWrap, { backgroundColor: icon.color + "22" }]}>
        <Ionicons name={icon.name} size={20} color={icon.color} />
      </View>
      <View style={styles.textWrap}>
        <Text style={[styles.title, { color: colors.text }, !item.isRead && { fontWeight: "700" }]} numberOfLines={2}>
          {item.title}
        </Text>
        {!!item.body && (
          <Text style={[styles.body, { color: colors.textSecondary ?? colors.text }]} numberOfLines={2}>
            {item.body}
          </Text>
        )}
        <Text style={[styles.time, { color: colors.textSecondary ?? colors.text }]}>
          {timeAgo(item.createdAt)}
        </Text>
      </View>
      {!item.isRead && (
        <View style={[styles.unreadDot, { backgroundColor: colors.accent }]} />
      )}
      <TouchableOpacity
        onPress={onDelete}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        disabled={isDeleting}
        style={styles.deleteBtn}
      >
        <Ionicons
          name="trash-outline"
          size={18}
          color={isDeleting ? (colors.textSecondary ?? "#999") : "#E63946"}
        />
      </TouchableOpacity>
    </TouchableOpacity>
  );
}

function MatchRequestCard({
  request,
  onAccept,
  onReject,
  isAccepting,
  isRejecting,
}: {
  request: IncomingMatchRequest;
  onAccept: () => void;
  onReject: () => void;
  isAccepting: boolean;
  isRejecting: boolean;
}) {
  const colors = useColors();
  const router = useRouter();

  return (
    <View style={[matchCardStyles.card, { backgroundColor: colors.surface, borderColor: colors.accent }]}>
      <TouchableOpacity
        style={matchCardStyles.senderRow}
        onPress={() => request.sender && router.push(`/profile/${request.sender.id}` as never)}
        activeOpacity={0.7}
      >
        <View style={[matchCardStyles.avatar, { backgroundColor: colors.accent + "22" }]}>
          <Ionicons name="person-add" size={22} color={colors.accent} />
        </View>
        <View style={matchCardStyles.senderInfo}>
          <Text style={[matchCardStyles.senderName, { color: colors.text }]} numberOfLines={1}>
            {request.sender?.nickname ?? "Utente"}
          </Text>
          <Text style={[matchCardStyles.senderSub, { color: colors.textSecondary ?? colors.text }]}>
            ti ha mandato una richiesta di match · {timeAgo(request.createdAt)}
          </Text>
        </View>
      </TouchableOpacity>
      <View style={matchCardStyles.actions}>
        <TouchableOpacity
          style={[matchCardStyles.rejectBtn, { borderColor: colors.border }]}
          onPress={onReject}
          disabled={isRejecting || isAccepting}
          activeOpacity={0.7}
        >
          {isRejecting ? (
            <ActivityIndicator size="small" color={colors.textSecondary ?? "#999"} />
          ) : (
            <Text style={[matchCardStyles.rejectText, { color: colors.textSecondary ?? "#999" }]}>Rifiuta</Text>
          )}
        </TouchableOpacity>
        <TouchableOpacity
          style={[matchCardStyles.acceptBtn, { backgroundColor: colors.accent }]}
          onPress={onAccept}
          disabled={isAccepting || isRejecting}
          activeOpacity={0.7}
        >
          {isAccepting ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={matchCardStyles.acceptText}>Accetta</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const matchCardStyles = StyleSheet.create({
  card: {
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 14,
    borderWidth: 1.5,
    padding: 14,
    gap: 12,
  },
  senderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  senderInfo: { flex: 1 },
  senderName: { fontSize: 15, fontWeight: "700" },
  senderSub: { fontSize: 12, marginTop: 2 },
  actions: {
    flexDirection: "row",
    gap: 10,
  },
  rejectBtn: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  acceptBtn: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    borderRadius: 10,
  },
  rejectText: { fontSize: 14, fontWeight: "600" },
  acceptText: { fontSize: 14, fontWeight: "700", color: "#fff" },
});

export default function NotificationsScreen() {
  const t = useT();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const router = useRouter();
  const routerRef = useRef(router);
  routerRef.current = router;

  const { data: notifications = [], isLoading } = useQuery<AppNotification[]>({
    queryKey: ["/api/notifications"],
    refetchOnMount: "always",
    staleTime: 0,
  });

  const { data: incomingRequests = [], isLoading: loadingRequests } = useQuery<IncomingMatchRequest[]>({
    queryKey: ["/api/friends/requests/incoming"],
    refetchOnMount: "always",
    staleTime: 0,
  });

  const markReadMutation = useMutation({
    mutationFn: (id: string) => apiRequest("PUT", `/api/notifications/${id}/read`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/notifications"], refetchType: "all" });
    },
  });

  const deleteOneMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/notifications/${id}`),
    onMutate: async (id: string) => {
      await qc.cancelQueries({ queryKey: ["/api/notifications"] });
      const previous = qc.getQueryData<AppNotification[]>(["/api/notifications"]);
      qc.setQueryData<AppNotification[]>(["/api/notifications"], (old) =>
        Array.isArray(old) ? old.filter((n) => n.id !== id) : old,
      );
      return { previous };
    },
    onError: (_e, _id, ctx) => {
      if (ctx?.previous) qc.setQueryData(["/api/notifications"], ctx.previous);
      Alert.alert("Errore", "Impossibile eliminare la notifica");
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["/api/notifications"], refetchType: "all" });
    },
  });

  const markAllRead = useCallback(async () => {
    const current = qc.getQueryData<AppNotification[]>(["/api/notifications"]) ?? [];
    const unread = current.filter((n) => !n.isRead);
    for (const n of unread) {
      try {
        await apiRequest("PUT", `/api/notifications/${n.id}/read`);
      } catch (e) {
        console.error("[notifications] markRead failed:", e);
      }
    }
    qc.invalidateQueries({ queryKey: ["/api/notifications"], refetchType: "all" });
  }, [qc]);

  const deleteAllMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("DELETE", "/api/notifications/all");
      return res.json().catch(() => ({ success: true }));
    },
    onMutate: async () => {
      await qc.cancelQueries({ queryKey: ["/api/notifications"] });
      const previous = qc.getQueryData<AppNotification[]>(["/api/notifications"]);
      qc.setQueryData<AppNotification[]>(["/api/notifications"], []);
      return { previous };
    },
    onError: (e, _vars, ctx) => {
      if (ctx?.previous) qc.setQueryData(["/api/notifications"], ctx.previous);
      console.error("[notifications] deleteAll failed:", e);
      Alert.alert("Errore", (e as Error)?.message || "Impossibile eliminare le notifiche");
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["/api/notifications"], refetchType: "all" });
    },
  });

  const markReadMutateRef = useRef(markReadMutation.mutate);
  markReadMutateRef.current = markReadMutation.mutate;
  const deleteOneMutateRef = useRef(deleteOneMutation.mutate);
  deleteOneMutateRef.current = deleteOneMutation.mutate;
  const deleteAllMutateRef = useRef(deleteAllMutation.mutate);
  deleteAllMutateRef.current = deleteAllMutation.mutate;

  const acceptRequestMutation = useMutation({
    mutationFn: (requestId: string) => apiRequest("POST", `/api/friends/request/${requestId}/accept`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/friends/requests/incoming"] });
      qc.invalidateQueries({ queryKey: ["/api/friends"] });
      qc.invalidateQueries({ queryKey: ["/api/notifications"] });
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- mutation error shape
    onError: (e: any) => {
      Alert.alert("Errore", (e as Error).message || "Impossibile accettare la richiesta");
    },
  });

  const rejectRequestMutation = useMutation({
    mutationFn: (requestId: string) => apiRequest("POST", `/api/friends/request/${requestId}/reject`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/friends/requests/incoming"] });
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- mutation error shape
    onError: (e: any) => {
      Alert.alert("Errore", (e as Error).message || "Impossibile rifiutare la richiesta");
    },
  });

  const handleDeleteAll = useCallback(() => {
    Alert.alert(
      "Cancella tutte le notifiche",
      t("notifications.deleteAllConfirm"),
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: "Cancella tutto",
          style: "destructive",
          onPress: () => deleteAllMutateRef.current(),
        },
      ]
    );
  }, [t]);

  const handleItemPress = useCallback((item: AppNotification) => {
    if (item.notificationType === "direct_match_request") {
      return;
    }
    if (!item.isRead) {
      markReadMutateRef.current(item.id);
    }
    if (item.notificationType === "proposal_match") {
      Alert.alert(
        "Giro proposto",
        "Hai un nuovo match su un giro proposto! Vai nella sezione Proposte per vedere i dettagli.",
        [{ text: "OK" }]
      );
      return;
    }
    const route = getNotifRoute(item);
    if (route) {
      routerRef.current.push(route as never);
    }
  }, []);

  const handleDeleteOne = useCallback((id: string) => {
    deleteOneMutateRef.current(id);
  }, []);

  const unreadCount = notifications.filter((n) => !n.isRead).length;
  const isLoadingAny = isLoading || loadingRequests;
  const hasContent = notifications.length > 0 || incomingRequests.length > 0;

  const headerRight = useCallback(() => (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
      {unreadCount > 0 && (
        <TouchableOpacity onPress={markAllRead} style={styles.headerBtn}>
          <Ionicons name="checkmark-done-outline" size={22} color={colors.accent} />
        </TouchableOpacity>
      )}
      {notifications.length > 0 && (
        <TouchableOpacity
          onPress={handleDeleteAll}
          style={styles.headerBtn}
          disabled={deleteAllMutation.isPending}
        >
          <Ionicons
            name="trash-outline"
            size={20}
            color={deleteAllMutation.isPending ? (colors.textSecondary ?? "#999") : "#E63946"}
          />
        </TouchableOpacity>
      )}
    </View>
  ), [unreadCount, markAllRead, notifications.length, handleDeleteAll, deleteAllMutation.isPending, colors]);

  const renderItem = useCallback(({ item }: { item: AppNotification }) => {
    return (
      <NotificationItem
        item={item}
        onPress={() => handleItemPress(item)}
        onDelete={() => handleDeleteOne(item.id)}
        isDeleting={deleteOneMutation.isPending && deleteOneMutation.variables === item.id}
        colors={colors}
      />
    );
  }, [handleItemPress, handleDeleteOne, deleteOneMutation.isPending, deleteOneMutation.variables, colors]);

  const screenOptions = useMemo(
    () => ({ headerRight: hasContent ? headerRight : undefined }),
    [hasContent, headerRight]
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background ?? colors.surface }]}>
      <Stack.Screen options={screenOptions} />

      {isLoadingAny ? (
        <ActivityIndicator color={colors.accent} style={{ marginTop: 40 }} />
      ) : !hasContent ? (
        <View style={styles.empty}>
          <Ionicons name="notifications-off-outline" size={56} color={colors.textSecondary ?? colors.text} />
          <Text style={[styles.emptyText, { color: colors.textSecondary ?? colors.text }]}>
            Nessuna notifica
          </Text>
        </View>
      ) : (
        <FlatList
          data={notifications}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          ListHeaderComponent={
            incomingRequests.length > 0 ? (
              <View style={{ paddingBottom: 8 }}>
                <Text style={[styles.sectionLabel, { color: colors.accent }]}>
                  Richieste di Match ({incomingRequests.length})
                </Text>
                {incomingRequests.map((req) => (
                  <MatchRequestCard
                    key={req.id}
                    request={req}
                    onAccept={() => acceptRequestMutation.mutate(req.id)}
                    onReject={() => rejectRequestMutation.mutate(req.id)}
                    isAccepting={acceptRequestMutation.isPending && acceptRequestMutation.variables === req.id}
                    isRejecting={rejectRequestMutation.isPending && rejectRequestMutation.variables === req.id}
                  />
                ))}
                {notifications.length > 0 && (
                  <View style={[styles.sectionDivider, { borderColor: colors.border }]} />
                )}
              </View>
            ) : null
          }
          contentContainerStyle={{ paddingBottom: insets.bottom + 16 }}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}
