import React from "react";
import { View, Text, StyleSheet, FlatList, Pressable, ActivityIndicator, Platform } from "react-native";
import { useRouter, Stack } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/lib/auth-context";

export default function ChatListScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["/api/conversations"],
  });

  const conversations = (data as any)?.conversations || [];

  const getOtherUser = (conv: any) => {
    if (conv.type === "group") return null;
    const other = conv.participants?.find((p: any) => p.id !== user?.id);
    return other;
  };

  const renderConversation = ({ item }: { item: any }) => {
    const other = getOtherUser(item);
    const isGroup = item.type === "group";
    const unread = item.unread_count || 0;

    return (
      <Pressable style={styles.convCard} onPress={() => router.push(`/chat/${item.id}` as any)}>
        <View style={styles.convAvatar}>
          <Ionicons name={isGroup ? "people" : "person-circle"} size={40} color={isGroup ? Colors.accent : Colors.maleIcon} />
        </View>
        <View style={styles.convInfo}>
          <Text style={styles.convName} numberOfLines={1}>
            {isGroup ? "Gruppo" : other?.nickname || "Chat"}
          </Text>
          <Text style={styles.convLastMsg} numberOfLines={1}>
            {item.last_message || "Nessun messaggio"}
          </Text>
        </View>
        {unread > 0 && (
          <View style={styles.unreadBadge}>
            <Text style={styles.unreadText}>{unread}</Text>
          </View>
        )}
      </Pressable>
    );
  };

  return (
    <View style={[styles.container, { paddingTop: Platform.OS === "web" ? 67 : insets.top }]}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.header}>
        <Pressable onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={Colors.text} />
        </Pressable>
        <Text style={styles.title}>Chat</Text>
        <View style={{ width: 24 }} />
      </View>

      {isLoading ? (
        <View style={styles.loading}>
          <ActivityIndicator size="large" color={Colors.accent} />
        </View>
      ) : (
        <FlatList
          data={conversations}
          renderItem={renderConversation}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="chatbubble-outline" size={48} color={Colors.textSecondary} />
              <Text style={styles.emptyText}>Nessuna conversazione</Text>
              <Text style={styles.emptySubtext}>Inizia una chat dal profilo di un utente</Text>
            </View>
          }
          scrollEnabled={conversations.length > 0}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: Colors.border },
  title: { fontSize: 20, fontFamily: "Inter_600SemiBold", color: Colors.text },
  loading: { flex: 1, justifyContent: "center", alignItems: "center" },
  list: { padding: 16 },
  convCard: { flexDirection: "row", alignItems: "center", backgroundColor: Colors.surface, borderRadius: 12, padding: 12, marginBottom: 8, gap: 12 },
  convAvatar: {},
  convInfo: { flex: 1 },
  convName: { fontSize: 16, fontFamily: "Inter_600SemiBold", color: Colors.text },
  convLastMsg: { fontSize: 14, fontFamily: "Inter_400Regular", color: Colors.textSecondary, marginTop: 2 },
  unreadBadge: { backgroundColor: Colors.accentRed, borderRadius: 12, minWidth: 24, height: 24, alignItems: "center", justifyContent: "center", paddingHorizontal: 6 },
  unreadText: { fontSize: 12, fontFamily: "Inter_700Bold", color: "#fff" },
  empty: { alignItems: "center", paddingTop: 80, gap: 8 },
  emptyText: { fontSize: 16, fontFamily: "Inter_500Medium", color: Colors.textSecondary },
  emptySubtext: { fontSize: 14, fontFamily: "Inter_400Regular", color: Colors.textSecondary },
});
