import React, { useCallback, useState } from "react";
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
} from "react-native";
import { useRouter } from "expo-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/colors";
import { t } from "@/lib/i18n";
import { useAuth } from "@/lib/auth-context";
import { apiRequest, queryClient } from "@/lib/query-client";

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

function getConversationTitle(conv: ConversationItem, userId: string): string {
  if (conv.title) return conv.title;
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

  if (diff < dayMs) {
    return date.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
  }
  if (diff < 7 * dayMs) {
    return date.toLocaleDateString("it-IT", { weekday: "short" });
  }
  return date.toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit" });
}

function getUserTypeColor(userType: string): string {
  switch (userType) {
    case "biker": return Colors.maleIcon;
    case "zavorrina": return Colors.femaleIcon;
    case "coppia": return Colors.coupleIcon;
    default: return Colors.textSecondary;
  }
}

function getConversationIcon(conv: ConversationItem): { name: keyof typeof Ionicons.glyphMap; bg: string } {
  if (conv.conversationType === "contact") return { name: "people-circle", bg: Colors.success };
  if (conv.conversationType === "group") return { name: "people", bg: Colors.accent };
  return { name: "person", bg: Colors.maleIcon };
}

function ConversationRow({ item, userId, onPress }: { item: ConversationItem; userId: string; onPress: () => void }) {
  const title = getConversationTitle(item, userId);
  const preview = getLastMessagePreview(item.lastMessage);
  const time = item.lastMessage ? formatTime(item.lastMessage.createdAt) : "";
  const other = item.participants.find((p) => p.id !== userId);
  const icon = getConversationIcon(item);
  const avatarBg = item.conversationType === "private" ? getUserTypeColor(other?.userType || "biker") : icon.bg;

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
    </TouchableOpacity>
  );
}

interface UserSearchResult {
  id: string;
  nickname: string;
  avatarUrl: string | null;
  userType: string;
}

export default function ChatScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const userId = user?.id || "";
  const [showNewChat, setShowNewChat] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [chatType, setChatType] = useState<"contact" | "private">("contact");

  const { data: conversations, isLoading } = useQuery<ConversationItem[]>({
    queryKey: ["/api/chat/conversations"],
    refetchInterval: 10000,
  });

  const { data: users } = useQuery<UserSearchResult[]>({
    queryKey: ["/api/users"],
    enabled: showNewChat,
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
      setChatType("contact");
      router.push(`/chat/${conv.id}`);
    },
    onError: () => {
      Alert.alert("Errore", "Impossibile creare la conversazione");
    },
  });

  const handleContactUser = useCallback(
    (targetUserId: string) => {
      createConversationMutation.mutate({
        conversationType: chatType,
        participantIds: [targetUserId],
      });
    },
    [chatType, createConversationMutation]
  );

  const filteredUsers = users?.filter(
    (u) =>
      u.id !== userId &&
      u.nickname.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleConversationPress = useCallback(
    (convId: string) => {
      router.push(`/chat/${convId}`);
    },
    [router]
  );

  const renderItem = useCallback(
    ({ item }: { item: ConversationItem }) => (
      <ConversationRow
        item={item}
        userId={userId}
        onPress={() => handleConversationPress(item.id)}
      />
    ),
    [userId, handleConversationPress]
  );

  const webTopInset = Platform.OS === "web" ? 67 : 0;

  return (
    <View style={[styles.container, { paddingTop: webTopInset }]}>
      <View style={[styles.header, { paddingTop: Platform.OS === "web" ? 16 : insets.top + 12 }]}>
        <View style={styles.headerRow}>
          <Text style={styles.headerTitle}>{t("chat.title")}</Text>
          <TouchableOpacity onPress={() => setShowNewChat(true)} style={styles.newChatButton}>
            <Ionicons name="create-outline" size={24} color={Colors.accent} />
          </TouchableOpacity>
        </View>
      </View>

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

      <Modal visible={showNewChat} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { paddingTop: Platform.OS === "web" ? 24 : insets.top + 12 }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Nuova conversazione</Text>
              <TouchableOpacity onPress={() => { setShowNewChat(false); setSearchQuery(""); setChatType("contact"); }}>
                <Ionicons name="close" size={28} color={Colors.text} />
              </TouchableOpacity>
            </View>

            <View style={styles.chatTypeRow}>
              <TouchableOpacity
                style={[styles.chatTypeOption, chatType === "contact" && styles.chatTypeActive]}
                onPress={() => setChatType("contact")}
              >
                <Ionicons name="people-circle" size={20} color={chatType === "contact" ? Colors.background : Colors.textSecondary} />
                <Text style={[styles.chatTypeText, chatType === "contact" && styles.chatTypeTextActive]}>Contatto</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.chatTypeOption, chatType === "private" && styles.chatTypeActive]}
                onPress={() => setChatType("private")}
              >
                <Ionicons name="lock-closed" size={20} color={chatType === "private" ? Colors.background : Colors.textSecondary} />
                <Text style={[styles.chatTypeText, chatType === "private" && styles.chatTypeTextActive]}>Privata</Text>
              </TouchableOpacity>
            </View>

            {chatType === "private" && (
              <View style={styles.privateNotice}>
                <Ionicons name="information-circle" size={16} color={Colors.warning} />
                <Text style={styles.privateNoticeText}>Consigliamo la chat di contatto</Text>
              </View>
            )}

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
                  <View style={[styles.userAvatar, { backgroundColor: getUserTypeColor(item.userType) }]}>
                    <Ionicons name="person" size={18} color="#fff" />
                  </View>
                  <Text style={styles.userNickname}>{item.nickname}</Text>
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
    justifyContent: "space-between",
    alignItems: "center",
  },
  headerTitle: {
    fontSize: 28,
    fontFamily: "Inter_700Bold",
    color: Colors.text,
  },
  newChatButton: {
    padding: 4,
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
  chatTypeRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 12,
  },
  chatTypeOption: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  chatTypeActive: {
    backgroundColor: Colors.accent,
    borderColor: Colors.accent,
  },
  chatTypeText: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    color: Colors.textSecondary,
  },
  chatTypeTextActive: {
    color: Colors.background,
  },
  privateNotice: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: Colors.surface,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    marginBottom: 12,
  },
  privateNoticeText: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: Colors.warning,
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
  noUsersText: {
    textAlign: "center" as const,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
    marginTop: 20,
  },
});
