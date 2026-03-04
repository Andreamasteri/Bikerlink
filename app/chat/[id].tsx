import React, { useState, useCallback, useEffect } from "react";
import { View, Text, TextInput, FlatList, Pressable, StyleSheet, Platform, ActivityIndicator } from "react-native";
import { useLocalSearchParams, Stack, useRouter } from "expo-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { useAuth } from "@/lib/auth-context";
import { apiRequest, queryClient } from "@/lib/query-client";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";

export default function ChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [message, setMessage] = useState("");

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["/api/conversations", id, "/messages"],
    refetchInterval: 3000,
  });

  const messages = (data as any)?.messages || [];

  useEffect(() => {
    if (id) {
      apiRequest("PUT", `/api/conversations/${id}/read`).catch(() => {});
    }
  }, [id, messages.length]);

  const sendMutation = useMutation({
    mutationFn: async (content: string) => {
      await apiRequest("POST", `/api/conversations/${id}/messages`, { content, messageType: "text" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/conversations", id, "/messages"] });
      queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
    },
  });

  const handleSend = () => {
    if (!message.trim()) return;
    const content = message.trim();
    setMessage("");
    sendMutation.mutate(content);
  };

  const renderMessage = useCallback(({ item }: { item: any }) => {
    const isOwn = item.senderId === user?.id;
    const isSystem = item.isSystem;

    if (isSystem) {
      return (
        <View style={styles.systemMsg}>
          <Ionicons name="information-circle" size={14} color={Colors.warning} />
          <Text style={styles.systemText}>{item.content}</Text>
        </View>
      );
    }

    return (
      <View style={[styles.msgRow, isOwn && styles.msgRowOwn]}>
        {!isOwn && <Text style={styles.senderName}>{item.sender?.nickname}</Text>}
        <View style={[styles.msgBubble, isOwn ? styles.msgBubbleOwn : styles.msgBubbleOther]}>
          <Text style={[styles.msgText, isOwn ? styles.msgTextOwn : styles.msgTextOther]}>{item.content}</Text>
        </View>
      </View>
    );
  }, [user?.id]);

  return (
    <KeyboardAvoidingView
      style={[styles.container, { paddingTop: Platform.OS === "web" ? 67 : insets.top }]}
      behavior="padding"
      keyboardVerticalOffset={0}
    >
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
          data={messages}
          renderItem={renderMessage}
          keyExtractor={(item) => item.id}
          inverted
          contentContainerStyle={styles.messageList}
          keyboardDismissMode="interactive"
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyText}>Inizia la conversazione!</Text>
            </View>
          }
          scrollEnabled={messages.length > 0}
        />
      )}

      <View style={[styles.inputRow, { paddingBottom: Platform.OS === "web" ? 34 : Math.max(insets.bottom, 8) }]}>
        <TextInput
          style={styles.input}
          placeholder="Scrivi un messaggio..."
          placeholderTextColor={Colors.textSecondary}
          value={message}
          onChangeText={setMessage}
          multiline
        />
        <Pressable style={styles.sendBtn} onPress={handleSend} disabled={!message.trim()}>
          <Ionicons name="send" size={20} color={message.trim() ? Colors.background : Colors.textSecondary} />
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: Colors.border },
  title: { fontSize: 18, fontFamily: "Inter_600SemiBold", color: Colors.text },
  loading: { flex: 1, justifyContent: "center", alignItems: "center" },
  messageList: { padding: 16, paddingBottom: 8 },
  msgRow: { marginBottom: 8 },
  msgRowOwn: { alignItems: "flex-end" },
  senderName: { fontSize: 12, fontFamily: "Inter_500Medium", color: Colors.textSecondary, marginBottom: 2, marginLeft: 4 },
  msgBubble: { maxWidth: "80%", padding: 12, borderRadius: 16 },
  msgBubbleOwn: { backgroundColor: Colors.accent, borderBottomRightRadius: 4 },
  msgBubbleOther: { backgroundColor: Colors.surface, borderBottomLeftRadius: 4 },
  msgText: { fontSize: 15, fontFamily: "Inter_400Regular" },
  msgTextOwn: { color: Colors.background },
  msgTextOther: { color: Colors.text },
  systemMsg: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: Colors.warning + "15", padding: 10, borderRadius: 10, marginBottom: 8, alignSelf: "center" },
  systemText: { fontSize: 13, fontFamily: "Inter_400Regular", color: Colors.warning, flex: 1 },
  empty: { alignItems: "center", paddingTop: 40 },
  emptyText: { fontSize: 14, fontFamily: "Inter_400Regular", color: Colors.textSecondary },
  inputRow: { flexDirection: "row", alignItems: "flex-end", gap: 8, paddingHorizontal: 16, paddingTop: 8, borderTopWidth: 1, borderTopColor: Colors.border, backgroundColor: Colors.surface },
  input: { flex: 1, backgroundColor: Colors.background, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10, fontSize: 15, fontFamily: "Inter_400Regular", color: Colors.text, maxHeight: 100 },
  sendBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.accent, alignItems: "center", justifyContent: "center" },
});
