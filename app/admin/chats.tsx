import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  ActivityIndicator,
  TextInput,
  Platform,
  RefreshControl,
} from "react-native";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/colors";

interface Participant {
  id: string;
  nickname: string;
  avatarUrl: string | null;
  userType: string;
  isFake: boolean;
}

interface ChatConversation {
  id: string;
  conversationType: string;
  title: string | null;
  createdAt: string;
  updatedAt: string;
  participants: Participant[];
  lastMessage: {
    content: string | null;
    messageType: string;
    createdAt: string;
    senderId: string;
  } | null;
}

function getTypeLabel(type: string) {
  switch (type) {
    case "private": return "Privata";
    case "group": return "Gruppo";
    case "contact": return "Contatto";
    default: return type;
  }
}

function getTypeColor(type: string) {
  switch (type) {
    case "private": return Colors.accent;
    case "group": return "#4CAF50";
    case "contact": return "#FF9800";
    default: return Colors.textSecondary;
  }
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  if (days === 0) {
    return d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
  }
  if (days === 1) return "Ieri";
  if (days < 7) return `${days}g fa`;
  return d.toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit" });
}

function getPreview(msg: ChatConversation["lastMessage"], participants: Participant[]) {
  if (!msg) return "Nessun messaggio";
  const sender = participants.find(p => p.id === msg.senderId);
  const prefix = sender ? `${sender.nickname}: ` : "";
  if (msg.messageType === "image") return `${prefix}📷 Foto`;
  if (msg.messageType === "location") return `${prefix}📍 Posizione`;
  const text = msg.content || "";
  return `${prefix}${text.length > 60 ? text.substring(0, 60) + "…" : text}`;
}

export default function AdminChatsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [search, setSearch] = useState("");

  const { data, isLoading, refetch } = useQuery<ChatConversation[]>({
    queryKey: ["/api/admin/chats"],
  });

  const conversations = data || [];

  const filtered = search.trim()
    ? conversations.filter((c) =>
        c.participants.some((p) =>
          p.nickname.toLowerCase().includes(search.toLowerCase())
        )
      )
    : conversations;

  const renderItem = ({ item }: { item: ChatConversation }) => {
    const names = item.participants.map(p => p.nickname).join(", ");
    const hasFake = item.participants.some(p => p.isFake);

    return (
      <Pressable
        style={styles.card}
        onPress={() => router.push(`/admin/chat-messages/${item.id}` as any)}
      >
        <View style={styles.cardHeader}>
          <View style={styles.cardHeaderLeft}>
            <View style={[styles.typeBadge, { backgroundColor: getTypeColor(item.conversationType) + "20" }]}>
              <Text style={[styles.typeText, { color: getTypeColor(item.conversationType) }]}>
                {getTypeLabel(item.conversationType)}
              </Text>
            </View>
            {hasFake && (
              <View style={styles.fakeBadge}>
                <MaterialCommunityIcons name="robot" size={12} color="#FF9800" />
              </View>
            )}
          </View>
          <Text style={styles.date}>
            {item.lastMessage ? formatDate(item.lastMessage.createdAt) : formatDate(item.createdAt)}
          </Text>
        </View>

        <Text style={styles.participants} numberOfLines={1}>{names}</Text>
        <Text style={styles.preview} numberOfLines={1}>
          {getPreview(item.lastMessage, item.participants)}
        </Text>
      </Pressable>
    );
  };

  if (isLoading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={Colors.accent} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.searchContainer}>
        <Ionicons name="search" size={18} color={Colors.textSecondary} />
        <TextInput
          style={styles.searchInput}
          placeholder="Cerca per nickname..."
          placeholderTextColor={Colors.textSecondary}
          value={search}
          onChangeText={setSearch}
        />
        {search.length > 0 && (
          <Pressable onPress={() => setSearch("")}>
            <Ionicons name="close-circle" size={18} color={Colors.textSecondary} />
          </Pressable>
        )}
      </View>

      <Text style={styles.countText}>{filtered.length} conversazioni</Text>

      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={{ paddingBottom: insets.bottom + 20, paddingHorizontal: 16 }}
        refreshControl={<RefreshControl refreshing={false} onRefresh={refetch} tintColor={Colors.accent} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="chatbubbles-outline" size={48} color={Colors.textSecondary} />
            <Text style={styles.emptyText}>Nessuna conversazione trovata</Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  loading: { flex: 1, justifyContent: "center", alignItems: "center" },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.surface,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 8,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    color: Colors.text,
  },
  countText: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  cardHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  typeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  typeText: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
  },
  fakeBadge: {
    backgroundColor: "#FF9800" + "20",
    borderRadius: 6,
    padding: 2,
  },
  date: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
  },
  participants: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: Colors.text,
    marginBottom: 4,
  },
  preview: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
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
