import React, { useCallback, useState, useEffect, useMemo } from "react";
import * as Location from "expo-location";
import { useFocusEffect } from "expo-router";
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  AppState,
  Alert,
  TouchableOpacity,
} from "react-native";
import { useRouter } from "expo-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/colors";
import { InlineMiniPlayer } from "@/components/MiniPlayer";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/lib/auth-context";
import { useT } from "@/lib/language-context";
import { apiRequest, queryClient, getQueryFnWithTimeout } from "@/lib/query-client";
import { useChatSSE } from "@/hooks/useChatSSE";

import { ChatListItem, ConversationItem } from "@/components/chat-list/ChatListItem";
import { ChatListHeader } from "@/components/chat-list/ChatListHeader";
import { NewConversationModal } from "@/components/chat-list/NewConversationModal";
import { FriendsSection } from "@/components/chat-list/FriendsSection";

interface FriendItem {
  id: string;
  nickname: string;
  userType: string;
  gender: string | null;
}

interface UserSearchResult {
  id: string;
  nickname: string;
  avatarUrl: string | null;
  userType: string;
  sex?: string | null;
  distance?: number | null;
}

export default function ChatScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const { user } = useAuth();
  const t = useT();
  const userId = user?.id || "";
  const [showNewChat, setShowNewChat] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortOrder, setSortOrder] = useState<"alpha" | "distance">("alpha");
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);

  const { data: conversations, isLoading, isError, refetch } = useQuery<ConversationItem[]>({
    queryKey: ["/api/chat/conversations"],
    queryFn: getQueryFnWithTimeout(15000),
    refetchInterval: 60000,
    staleTime: 60000,
    retry: false,
  });

  const { data: friends } = useQuery<FriendItem[]>({
    queryKey: ["/api/friends"],
  });

  useChatSSE((event) => {
    if (
      (event.type === "new_message" || event.type === "conversation_update") &&
      event.message
    ) {
      const msg = event.message as {
        id: string;
        content: string | null;
        messageType: string;
        createdAt: string;
        senderId: string;
      };
      let didUpdate = false;
      queryClient.setQueryData<ConversationItem[]>(
        ["/api/chat/conversations"],
        (old) => {
          if (!old) return old;
          const idx = old.findIndex((c) => c.id === event.conversationId);
          if (idx === -1) return old;
          didUpdate = true;
          const conv = old[idx];
          const newLastMessage = {
            id: msg.id,
            content: msg.content,
            messageType: msg.messageType,
            createdAt: msg.createdAt,
            senderId: msg.senderId,
          };
          const updatedConv = {
            ...conv,
            lastMessage: newLastMessage,
            updatedAt: msg.createdAt,
            unreadCount: msg.senderId !== userId ? conv.unreadCount + 1 : conv.unreadCount,
          };
          const rest = old.filter((_, i) => i !== idx);
          return [updatedConv, ...rest];
        }
      );
      if (!didUpdate) {
        queryClient.invalidateQueries({ queryKey: ["/api/chat/conversations"] });
      }
    } else {
      queryClient.invalidateQueries({ queryKey: ["/api/chat/conversations"] });
    }
  });

  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      // Guard the listener body so a rejected invalidate (paused/offline) can
      // never escape this native callback as a fatal unhandled rejection.
      try {
        if (state === "active") {
          queryClient.invalidateQueries({ queryKey: ["/api/chat/conversations"] }).catch(() => {});
        }
      } catch {
        // no-op: never let the resume AppState callback crash the app
      }
    });
    return () => sub.remove();
  }, []);

  useFocusEffect(
    useCallback(() => {
      queryClient.invalidateQueries({ queryKey: ["/api/friends"] });
    }, [])
  );

  useEffect(() => {
    if (!showNewChat) return;
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
          if (status === "granted") {
            const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
            setUserLocation({ lat: loc.coords.latitude, lng: loc.coords.longitude });
          }
      } catch (err) {
        console.debug("Location fetch error:", err);
      }
    })();
  }, [showNewChat]);

  const usersQueryKey = userLocation
    ? [`/api/users?lat=${userLocation.lat}&lng=${userLocation.lng}`]
    : ["/api/users"];

  const { data: users } = useQuery<UserSearchResult[]>({
    queryKey: usersQueryKey,
    enabled: showNewChat,
  });

  const { data: myProfile } = useQuery<{ emailChatNotifications?: boolean }>({
    queryKey: ["/api/users/profile"],
  });

  const emailNotifEnabled = myProfile?.emailChatNotifications ?? true;

  const toggleEmailNotifMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      await apiRequest("PUT", "/api/users/profile/dynamic", { emailChatNotifications: enabled });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users/profile"] });
    },
  });

  const createConversationMutation = useMutation({
    mutationFn: async (data: { conversationType: string; participantIds: string[] }) => {
      const res = await apiRequest("POST", "/api/chat/conversations", data);
      return await res.json();
    },
    onSuccess: (conv) => {
      queryClient.invalidateQueries({ queryKey: ["/api/chat/conversations"] });
      setShowNewChat(false);
      setSearchQuery("");
      router.push(`/chat/${conv.id}`);
    },
    onError: () => {
      Alert.alert("Errore", "Impossibile creare la conversazione");
    },
  });

  const handleContactUser = useCallback(
    (targetUserId: string) => {
      createConversationMutation.mutate({
        conversationType: "private",
        participantIds: [targetUserId],
      });
    },
    [createConversationMutation]
  );

  const filteredUsers = useMemo(() => {
    const base = users?.filter(
      (u) =>
        u.id !== userId &&
        u.nickname.toLowerCase().includes(searchQuery.toLowerCase())
    ) ?? [];
    if (sortOrder === "alpha") {
      return [...base].sort((a, b) => a.nickname.localeCompare(b.nickname));
    }
    return [...base].sort((a, b) => {
      const da = a.distance ?? Infinity;
      const db = b.distance ?? Infinity;
      return da - db;
    });
  }, [users, userId, searchQuery, sortOrder]);

  const handleConversationPress = useCallback(
    (convId: string) => {
      router.push(`/chat/${convId}`);
    },
    [router]
  );

  const deleteConversationMutation = useMutation({
    mutationFn: async (convId: string) => {
      await apiRequest("DELETE", `/api/chat/conversations/${convId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/chat/conversations"] });
    },
    onError: (error: unknown) => {
      const message = error instanceof Error && error.message
        ? error.message
        : "Impossibile eliminare la conversazione";
      Alert.alert("Errore", message);
    },
  });

  const handleDeleteConversation = useCallback((convId: string) => {
    deleteConversationMutation.mutate(convId);
  }, [deleteConversationMutation]);

  const handleFriendPress = useCallback(
    (friend: FriendItem) => {
      createConversationMutation.mutate({
        conversationType: "private",
        participantIds: [friend.id],
      });
    },
    [createConversationMutation]
  );

  const renderItem = useCallback(
    ({ item }: { item: ConversationItem }) => (
      <ChatListItem
        item={item}
        userId={userId}
        onPress={() => handleConversationPress(item.id)}
        onDelete={handleDeleteConversation}
        t={t}
      />
    ),
    [userId, handleConversationPress, handleDeleteConversation, t]
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <InlineMiniPlayer />
      <ChatListHeader
        insets={insets}
        colors={colors}
        emailNotifEnabled={emailNotifEnabled}
        onToggleEmailNotif={(val) => toggleEmailNotifMutation.mutate(val)}
        onNewChatPress={() => setShowNewChat(true)}
      />

      <FriendsSection
        friends={friends || []}
        userId={userId}
        onFriendPress={handleFriendPress}
        t={t}
      />

      {isLoading ? (
        <View style={styles.centerContent}>
          <ActivityIndicator size="large" color={Colors.accent} />
        </View>
      ) : isError ? (
        <View style={styles.centerContent}>
          <Ionicons name="cloud-offline-outline" size={48} color={Colors.textSecondary} />
          <Text style={styles.emptyText}>Impossibile caricare le chat</Text>
          <TouchableOpacity style={styles.retryButton} onPress={() => refetch()}>
            <Text style={styles.retryText}>Riprova</Text>
          </TouchableOpacity>
        </View>
      ) : !conversations || conversations.length === 0 ? (
        <View style={styles.centerContent}>
          <Ionicons name="chatbubbles-outline" size={48} color={Colors.textSecondary} />
          <Text style={styles.emptyText}>{t("common.noResults")}</Text>
          <Text style={styles.emptySubtext}>Le conversazioni appariranno qui</Text>
        </View>
      ) : (
        <FlatList
          data={conversations}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 84 }]}
          showsVerticalScrollIndicator={false}
        />
      )}

      <NewConversationModal
        visible={showNewChat}
        onClose={() => { setShowNewChat(false); setSearchQuery(""); setSortOrder("alpha"); }}
        insets={insets}
        searchQuery={searchQuery}
        onSearchQueryChange={setSearchQuery}
        sortOrder={sortOrder}
        onSortOrderChange={setSortOrder}
        users={filteredUsers}
        onUserPress={handleContactUser}
        isPending={createConversationMutation.isPending}
        userId={userId}
        t={t}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  centerContent: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 12,
  },
  emptyText: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    color: Colors.textSecondary,
  },
  emptySubtext: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
  },
  listContent: {
    paddingTop: 8,
  },
  retryButton: {
    marginTop: 12,
    paddingHorizontal: 24,
    paddingVertical: 10,
    backgroundColor: Colors.accent,
    borderRadius: 8,
  },
  retryText: {
    color: "#fff",
    fontFamily: "Inter_600SemiBold",
    fontSize: 15,
  },
});
