import React, { useCallback, useState, useEffect } from "react";
import * as Location from "expo-location";
import { useFocusEffect } from "expo-router";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Platform,
  Modal,
  TextInput,
  Alert,
  Switch,
} from "react-native";
import { KeyboardAvoidingView } from "react-native";
import { useRouter } from "expo-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/colors";
import { InlineMiniPlayer } from "@/components/MiniPlayer";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/lib/auth-context";
import { useT } from "@/lib/language-context";
import { getCurrentLocale } from "@/lib/i18n";
import { apiRequest, queryClient } from "@/lib/query-client";

interface FriendItem {
  id: string;
  nickname: string;
  userType: string;
  gender: string | null;
}

interface ConversationItem {
  id: string;
  conversationType: string;
  title: string | null;
  proposalId: string | null;
  createdAt: string;
  updatedAt: string;
  participants: Array<{
    id: string;
    nickname: string;
    avatarUrl: string | null;
    userType: string;
  }>;
  lastMessage: {
    id: string;
    content: string | null;
    messageType: string;
    createdAt: string;
    senderId: string;
  } | null;
  unreadCount: number;
}

function getConversationTitle(conv: ConversationItem, userId: string, t: (key: string) => string): string {
  if (conv.title) return conv.title;
  if (conv.conversationType === "motoclub") return conv.title ?? "Clubs";
  if (conv.conversationType === "contact") {
    const others = conv.participants.filter((p) => p.id !== userId);
    if (others.length === 0) return "Chat di contatto";
    if (others.length === 1) return `Contatto - ${others[0].nickname}`;
    return `Contatto (${conv.participants.length})`;
  }
  if (conv.conversationType === "group") return t("chat.group");
  const other = conv.participants.find((p) => p.id !== userId);
  return other?.nickname ?? t("chat.private");
}

function getLastMessagePreview(msg: ConversationItem["lastMessage"]): string {
  if (!msg) return "";
  if (msg.messageType === "image") return "Foto";
  if (msg.messageType === "location") return "Posizione";
  return msg.content || "";
}

function formatTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const dayMs = 86400000;

  const loc = getCurrentLocale();
  if (diff < dayMs) {
    return date.toLocaleTimeString(loc, { hour: "2-digit", minute: "2-digit" });
  }
  if (diff < 7 * dayMs) {
    return date.toLocaleDateString(loc, { weekday: "short" });
  }
  return date.toLocaleDateString(loc, { day: "2-digit", month: "2-digit" });
}

function getUserTypeColor(userType: string, sex?: string | null): string {
  if (userType === "coppia") return Colors.coupleIcon;
  if (sex === "F") return Colors.femaleIcon;
  if (sex === "M") return Colors.maleIcon;
  if (userType.startsWith("zavorrina")) return Colors.femaleIcon;
  if (userType.startsWith("biker")) return Colors.maleIcon;
  return Colors.textSecondary;
}

function getConversationIcon(conv: ConversationItem): { name: keyof typeof Ionicons.glyphMap; bg: string } {
  if (conv.conversationType === "motoclub") return { name: "shield", bg: Colors.accent };
  if (conv.conversationType === "contact") return { name: "people-circle", bg: Colors.success };
  if (conv.conversationType === "group") return { name: "people", bg: Colors.accent };
  return { name: "person", bg: Colors.maleIcon };
}

function ConversationRow({ item, userId, onPress, onDelete, t }: { item: ConversationItem; userId: string; onPress: () => void; onDelete: (id: string) => void; t: (key: string) => string }) {
  const title = getConversationTitle(item, userId, t);
  const preview = getLastMessagePreview(item.lastMessage);
  const time = item.lastMessage ? formatTime(item.lastMessage.createdAt) : "";
  const other = item.participants.find((p) => p.id !== userId);
  const icon = getConversationIcon(item);
  const avatarBg = item.conversationType === "private" ? getUserTypeColor(other?.userType || "biker", other?.sex) : icon.bg;

  const handleLongPress = () => {
    Alert.alert(
      "Elimina chat",
      `Vuoi eliminare questa conversazione con ${title}? Tutti i messaggi verranno cancellati.`,
      [
        { text: "Annulla", style: "cancel" },
        { text: "Elimina", style: "destructive", onPress: () => onDelete(item.id) },
      ]
    );
  };

  return (
    <TouchableOpacity style={styles.conversationRow} onPress={onPress} activeOpacity={0.7}>
      <View style={[styles.avatar, { backgroundColor: avatarBg }]}>
        <Ionicons
          name={icon.name}
          size={22}
          color="#fff"
        />
      </View>
      <View style={styles.conversationInfo}>
        <View style={styles.conversationHeader}>
          <Text style={[styles.conversationTitle, item.unreadCount > 0 && styles.unreadTitle]} numberOfLines={1}>
            {title}
          </Text>
          <Text style={styles.timeText}>{time}</Text>
        </View>
        <View style={styles.conversationFooter}>
          <Text style={[styles.previewText, item.unreadCount > 0 && styles.unreadPreview]} numberOfLines={1}>
            {preview}
          </Text>
          {item.unreadCount > 0 && (
            <View style={styles.unreadBadge}>
              <Text style={styles.unreadBadgeText}>{item.unreadCount}</Text>
            </View>
          )}
        </View>
      </View>
      <TouchableOpacity
        onPress={handleLongPress}
        style={styles.deleteButton}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Ionicons name="trash-outline" size={18} color={Colors.textSecondary} />
      </TouchableOpacity>
    </TouchableOpacity>
  );
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

  const { data: conversations, isLoading } = useQuery<ConversationItem[]>({
    queryKey: ["/api/chat/conversations"],
    refetchInterval: 10000,
  });

  const { data: friends } = useQuery<FriendItem[]>({
    queryKey: ["/api/friends"],
  });

  useFocusEffect(
    useCallback(() => {
      queryClient.invalidateQueries({ queryKey: ["/api/friends"] });
    }, [])
  );

  useEffect(() => {
    if (!showNewChat) return;
    (async () => {
      try {
        if (Platform.OS === "web") {
          if (typeof navigator !== "undefined" && navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
              (pos) => setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
              (err) => console.debug("Geolocation unavailable:", err.message)
            );
          }
        } else {
          const { status } = await Location.requestForegroundPermissionsAsync();
          if (status === "granted") {
            const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
            setUserLocation({ lat: loc.coords.latitude, lng: loc.coords.longitude });
          }
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

  const emailNotifEnabled = myProfile?.emailChatNotifications ?? false;

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

  const filteredUsers = React.useMemo(() => {
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
  });

  const handleDeleteConversation = useCallback((convId: string) => {
    deleteConversationMutation.mutate(convId);
  }, []);

  const handleFriendPress = useCallback(
    (friend: FriendItem) => {
      const existing = conversations?.find((conv) =>
        conv.conversationType === "contact" &&
        conv.participants.some((p) => p.id === friend.id)
      );
      if (existing) {
        router.push(`/chat/${existing.id}`);
      } else {
        createConversationMutation.mutate({
          conversationType: "contact",
          participantIds: [friend.id],
        });
      }
    },
    [conversations, router, createConversationMutation]
  );

  const renderItem = useCallback(
    ({ item }: { item: ConversationItem }) => (
      <ConversationRow
        item={item}
        userId={userId}
        onPress={() => handleConversationPress(item.id)}
        onDelete={handleDeleteConversation}
        t={t}
      />
    ),
    [userId, handleConversationPress, handleDeleteConversation, t]
  );

  const webTopInset = Platform.OS === "web" ? 67 : 0;

  return (
    <View style={[styles.container, { paddingTop: webTopInset, backgroundColor: colors.background }]}>
      <InlineMiniPlayer />
      <View style={[styles.header, { paddingTop: Platform.OS === "web" ? 16 : insets.top + 4, backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <View style={styles.emailNotifRow}>
          <Ionicons name="mail-outline" size={15} color={colors.textSecondary} style={{ marginRight: 6 }} />
          <Text style={styles.emailNotifLabel}>Invia i messaggi in email quando sono Offline</Text>
          <Switch
            value={emailNotifEnabled}
            onValueChange={(val) => toggleEmailNotifMutation.mutate(val)}
            trackColor={{ false: Colors.surfaceLight, true: Colors.accent + "88" }}
            thumbColor={emailNotifEnabled ? Colors.accent : Colors.textSecondary}
            style={{ transform: [{ scaleX: 0.8 }, { scaleY: 0.8 }] }}
          />
        </View>
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={() => setShowNewChat(true)} style={styles.newChatButton}>
            <Text style={styles.newChatText}>Nuova Chat</Text>
          </TouchableOpacity>
        </View>
      </View>

      {friends && friends.length > 0 && (
        <View style={styles.friendsSection}>
          <Text style={styles.friendsSectionTitle}>{t("chat.friends")}</Text>
          <FlatList
            horizontal
            data={friends}
            keyExtractor={(item) => item.id}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.friendsListContent}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.friendItem}
                onPress={() => handleFriendPress(item)}
                activeOpacity={0.7}
              >
                <View style={[styles.friendAvatar, { backgroundColor: getUserTypeColor(item.userType, item.gender) }]}>
                  <Ionicons name="person" size={20} color="#fff" />
                </View>
                <Text style={styles.friendNickname} numberOfLines={1}>{item.nickname}</Text>
              </TouchableOpacity>
            )}
          />
        </View>
      )}

      {isLoading ? (
        <View style={styles.centerContent}>
          <ActivityIndicator size="large" color={Colors.accent} />
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
          contentContainerStyle={[styles.listContent, { paddingBottom: Platform.OS === "web" ? 34 : insets.bottom + 84 }]}
          showsVerticalScrollIndicator={false}
        />
      )}

      <Modal
        visible={showNewChat}
        animationType="slide"
        transparent
        onRequestClose={() => { setShowNewChat(false); setSearchQuery(""); setSortOrder("alpha"); }}
      >
        <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
          <View style={styles.modalOverlay}>
            <View style={[styles.modalContent, { paddingTop: Platform.OS === "web" ? 24 : insets.top + 12 }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Nuova conversazione</Text>
              <TouchableOpacity onPress={() => { setShowNewChat(false); setSearchQuery(""); setSortOrder("alpha"); }}>
                <Ionicons name="close" size={28} color={Colors.text} />
              </TouchableOpacity>
            </View>

            <View style={styles.searchWrapper}>
              <Ionicons name="search" size={18} color={Colors.textSecondary} />
              <TextInput
                style={styles.searchInput}
                placeholder="Cerca utente..."
                placeholderTextColor={Colors.textSecondary}
                value={searchQuery}
                onChangeText={setSearchQuery}
                autoFocus
              />
            </View>

            <View style={styles.sortRow}>
              <TouchableOpacity
                style={[styles.sortOption, sortOrder === "alpha" && styles.sortOptionActive]}
                onPress={() => setSortOrder("alpha")}
              >
                <Text style={[styles.sortOptionText, sortOrder === "alpha" && styles.sortOptionTextActive]}>A–Z</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.sortOption, sortOrder === "distance" && styles.sortOptionActive]}
                onPress={() => setSortOrder("distance")}
              >
                <Ionicons name="location-outline" size={14} color={sortOrder === "distance" ? Colors.background : Colors.textSecondary} style={{ marginRight: 4 }} />
                <Text style={[styles.sortOptionText, sortOrder === "distance" && styles.sortOptionTextActive]}>Distanza</Text>
              </TouchableOpacity>
            </View>

            <FlatList
              data={filteredUsers}
              keyExtractor={(item) => item.id}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.userListContent}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.userRow}
                  onPress={() => handleContactUser(item.id)}
                  disabled={createConversationMutation.isPending}
                >
                  <View style={[styles.userAvatar, { backgroundColor: getUserTypeColor(item.userType, item.sex) }]}>
                    <Ionicons name="person" size={18} color="#fff" />
                  </View>
                  <Text style={styles.userNickname}>{item.nickname}</Text>
                  {sortOrder === "distance" && (
                    <Text style={styles.userDistance}>
                      {item.distance != null ? `${item.distance} km` : "–"}
                    </Text>
                  )}
                  <Ionicons name="chatbubble-outline" size={20} color={Colors.accent} />
                </TouchableOpacity>
              )}
              ListEmptyComponent={
                searchQuery.length > 0 ? (
                  <Text style={styles.noUsersText}>Nessun utente trovato</Text>
                ) : null
              }
            />
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 12,
    borderBottomWidth: 0.5,
    borderBottomColor: Colors.border,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: Colors.accent,
    paddingVertical: 4,
  },
  newChatButton: {
    padding: 4,
  },
  newChatText: {
    fontSize: 18,
    fontFamily: "Inter_700Bold",
    color: Colors.accent,
  },
  emailNotifRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  emailNotifLabel: {
    flex: 1,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    color: Colors.warning,
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
  conversationRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    justifyContent: "center",
    alignItems: "center",
  },
  conversationInfo: {
    flex: 1,
    marginLeft: 14,
  },
  conversationHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  conversationTitle: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    color: Colors.text,
    flex: 1,
    marginRight: 8,
  },
  unreadTitle: {
    fontFamily: "Inter_700Bold",
  },
  timeText: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
  },
  conversationFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  previewText: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
    flex: 1,
    marginRight: 8,
  },
  unreadPreview: {
    color: Colors.textSecondary,
    fontFamily: "Inter_500Medium",
  },
  unreadBadge: {
    backgroundColor: Colors.accent,
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 6,
  },
  unreadBadgeText: {
    fontSize: 11,
    fontFamily: "Inter_700Bold",
    color: Colors.background,
  },
  deleteButton: {
    padding: 6,
    marginLeft: 8,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
  },
  modalContent: {
    flex: 1,
    backgroundColor: Colors.background,
    paddingHorizontal: 20,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 22,
    fontFamily: "Inter_700Bold",
    color: Colors.text,
  },
  sortRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 12,
  },
  sortOption: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  sortOptionActive: {
    backgroundColor: Colors.accent,
    borderColor: Colors.accent,
  },
  sortOptionText: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    color: Colors.textSecondary,
  },
  sortOptionTextActive: {
    color: Colors.background,
  },
  searchWrapper: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.surface,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === "ios" ? 10 : 6,
    gap: 8,
    marginBottom: 12,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    color: Colors.text,
  },
  userListContent: {
    paddingBottom: 40,
  },
  userRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    gap: 12,
  },
  userAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
  },
  userNickname: {
    flex: 1,
    fontSize: 16,
    fontFamily: "Inter_500Medium",
    color: Colors.text,
  },
  userDistance: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
    marginRight: 4,
  },
  noUsersText: {
    textAlign: "center" as const,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
    marginTop: 20,
  },
  friendsSection: {
    paddingTop: 12,
    paddingBottom: 8,
    borderBottomWidth: 0.5,
    borderBottomColor: Colors.border,
  },
  friendsSectionTitle: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    color: Colors.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    paddingHorizontal: 20,
    marginBottom: 10,
  },
  friendsListContent: {
    paddingHorizontal: 16,
    gap: 16,
  },
  friendItem: {
    alignItems: "center",
    width: 64,
  },
  friendAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 4,
  },
  friendNickname: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    color: Colors.text,
    textAlign: "center",
    width: 64,
  },
});
