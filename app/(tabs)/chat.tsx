import React, { useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Platform,
} from "react-native";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Colors } from "@/constants/colors";
import { t } from "@/lib/i18n";
import { useAuth } from "@/lib/auth-context";

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
    case "biker": return Colors.dark.bikerColor;
    case "zavorrina": return Colors.dark.zavorrinaColor;
    case "coppia": return Colors.dark.coppiaColor;
    default: return Colors.dark.textSecondary;
  }
}

function ConversationRow({ item, userId, onPress }: { item: ConversationItem; userId: string; onPress: () => void }) {
  const title = getConversationTitle(item, userId);
  const preview = getLastMessagePreview(item.lastMessage);
  const time = item.lastMessage ? formatTime(item.lastMessage.createdAt) : "";
  const isGroup = item.conversationType === "group";
  const other = item.participants.find((p) => p.id !== userId);

  return (
    <TouchableOpacity style={styles.conversationRow} onPress={onPress} activeOpacity={0.7}>
      <View style={[styles.avatar, { backgroundColor: isGroup ? Colors.dark.accent : getUserTypeColor(other?.userType || "biker") }]}>
        <Ionicons
          name={isGroup ? "people" : "person"}
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

export default function ChatScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const userId = user?.id || "";

  const { data: conversations, isLoading, refetch } = useQuery<ConversationItem[]>({
    queryKey: ["/api/chat/conversations"],
    refetchInterval: 10000,
  });

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
        <Text style={styles.headerTitle}>{t("chat.title")}</Text>
      </View>

      {isLoading ? (
        <View style={styles.centerContent}>
          <ActivityIndicator size="large" color={Colors.dark.accent} />
        </View>
      ) : !conversations || conversations.length === 0 ? (
        <View style={styles.centerContent}>
          <Ionicons name="chatbubbles-outline" size={48} color={Colors.dark.textMuted} />
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.background,
  },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 12,
    borderBottomWidth: 0.5,
    borderBottomColor: Colors.dark.border,
  },
  headerTitle: {
    fontSize: 28,
    fontFamily: "Inter_700Bold",
    color: Colors.dark.text,
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
    color: Colors.dark.textSecondary,
  },
  emptySubtext: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: Colors.dark.textMuted,
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
    color: Colors.dark.text,
    flex: 1,
    marginRight: 8,
  },
  unreadTitle: {
    fontFamily: "Inter_700Bold",
  },
  timeText: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: Colors.dark.textMuted,
  },
  conversationFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  previewText: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: Colors.dark.textMuted,
    flex: 1,
    marginRight: 8,
  },
  unreadPreview: {
    color: Colors.dark.textSecondary,
    fontFamily: "Inter_500Medium",
  },
  unreadBadge: {
    backgroundColor: Colors.dark.accent,
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
    color: Colors.dark.background,
  },
});
