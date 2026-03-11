import React from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  Image,
  Platform,
} from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/colors";

interface Sender {
  id: string;
  nickname: string;
  avatarUrl: string | null;
  userType: string;
  isFake: boolean;
}

interface ChatMessage {
  id: string;
  conversationId: string;
  senderId: string;
  messageType: string;
  content: string | null;
  imageUrl: string | null;
  latitude: number | null;
  longitude: number | null;
  isFiltered: boolean;
  createdAt: string;
  sender: Sender | null;
}

interface ChatData {
  conversation: {
    id: string;
    conversationType: string;
    title: string | null;
  };
  participants: Sender[];
  messages: ChatMessage[];
}

function formatTime(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleString("it-IT", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function AdminChatMessagesScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();

  const { data, isLoading } = useQuery<ChatData>({
    queryKey: ["/api/admin/chats", id, "messages"],
    queryFn: async () => {
      const { getApiUrl } = await import("@/lib/query-client");
      const url = new URL(`/api/admin/chats/${id}/messages?limit=200`, getApiUrl());
      const resp = await fetch(url.toString(), { credentials: "include" });
      if (!resp.ok) throw new Error("Failed to load messages");
      return resp.json();
    },
  });

  const participantNames = data?.participants.map(p => p.nickname).join(", ") || "";

  const renderMessage = ({ item }: { item: ChatMessage }) => {
    const senderName = item.sender?.nickname || "Sconosciuto";
    const isFake = item.sender?.isFake;

    return (
      <View style={styles.messageBubble}>
        <View style={styles.messageHeader}>
          <Text style={styles.senderName}>
            {senderName}
            {isFake ? " 🤖" : ""}
          </Text>
          <Text style={styles.messageTime}>{formatTime(item.createdAt)}</Text>
        </View>

        {item.messageType === "text" && (
          <Text style={[styles.messageText, item.isFiltered && styles.filteredText]}>
            {item.content}
          </Text>
        )}

        {item.messageType === "image" && item.imageUrl && (
          <Image source={{ uri: item.imageUrl }} style={styles.messageImage} resizeMode="cover" />
        )}

        {item.messageType === "location" && (
          <View style={styles.locationBox}>
            <Ionicons name="location" size={16} color={Colors.accent} />
            <Text style={styles.locationText}>
              {item.latitude?.toFixed(4)}, {item.longitude?.toFixed(4)}
            </Text>
          </View>
        )}

        {item.isFiltered && (
          <View style={styles.filteredBadge}>
            <Ionicons name="warning" size={12} color="#FF9800" />
            <Text style={styles.filteredLabel}>Filtrato</Text>
          </View>
        )}
      </View>
    );
  };

  if (isLoading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={Colors.accent} />
      </View>
    );
  }

  const messages = [...(data?.messages || [])].reverse();

  return (
    <View style={styles.container}>
      <View style={styles.infoBar}>
        <Text style={styles.infoText} numberOfLines={1}>
          {participantNames}
        </Text>
        <Text style={styles.infoCount}>{messages.length} messaggi</Text>
      </View>

      <View style={styles.readOnlyBanner}>
        <Ionicons name="eye-outline" size={16} color={Colors.textSecondary} />
        <Text style={styles.readOnlyText}>Modalità sola lettura</Text>
      </View>

      <FlatList
        data={messages}
        keyExtractor={(item) => item.id}
        renderItem={renderMessage}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 20, paddingTop: 8 }}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="chatbubble-outline" size={48} color={Colors.textSecondary} />
            <Text style={styles.emptyText}>Nessun messaggio</Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  loading: { flex: 1, justifyContent: "center", alignItems: "center" },
  infoBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  infoText: {
    flex: 1,
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: Colors.text,
    marginRight: 8,
  },
  infoCount: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
  },
  readOnlyBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 6,
    backgroundColor: Colors.surface,
  },
  readOnlyText: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
  },
  messageBubble: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
  },
  messageHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  senderName: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    color: Colors.accent,
  },
  messageTime: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
  },
  messageText: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: Colors.text,
    lineHeight: 20,
  },
  filteredText: {
    fontStyle: "italic",
    color: Colors.textSecondary,
  },
  messageImage: {
    width: "100%",
    height: 200,
    borderRadius: 8,
  },
  locationBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  locationText: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: Colors.text,
  },
  filteredBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 6,
  },
  filteredLabel: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    color: "#FF9800",
  },
  empty: {
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 60,
    gap: 12,
  },
  emptyText: {
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
  },
});
