import React, { useState, useCallback, useRef } from "react";
import {
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Colors } from "@/constants/colors";
import { t } from "@/lib/i18n";
import { useAuth } from "@/lib/auth-context";
import { apiRequest, queryClient } from "@/lib/query-client";

interface MessageSender {
  id: string;
  nickname: string;
  avatarUrl: string | null;
  userType: string;
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
  sender: MessageSender | null;
}

interface ConversationDetail {
  id: string;
  conversationType: string;
  title: string | null;
  participants: Array<{
    id: string;
    nickname: string;
    avatarUrl: string | null;
    userType: string;
  }>;
}

function formatMessageTime(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
}

function getUserTypeColor(userType: string): string {
  switch (userType) {
    case "biker": return Colors.dark.bikerColor;
    case "zavorrina": return Colors.dark.zavorrinaColor;
    case "coppia": return Colors.dark.coppiaColor;
    default: return Colors.dark.textSecondary;
  }
}

function MessageBubble({ message, isOwn }: { message: ChatMessage; isOwn: boolean }) {
  return (
    <View style={[styles.bubbleContainer, isOwn ? styles.bubbleRight : styles.bubbleLeft]}>
      {!isOwn && message.sender && (
        <Text style={[styles.senderName, { color: getUserTypeColor(message.sender.userType) }]}>
          {message.sender.nickname}
        </Text>
      )}
      <View style={[styles.bubble, isOwn ? styles.ownBubble : styles.otherBubble]}>
        {message.messageType === "location" && message.latitude && message.longitude ? (
          <View style={styles.locationContent}>
            <Ionicons name="location" size={18} color={isOwn ? "#fff" : Colors.dark.accent} />
            <Text style={[styles.messageText, isOwn ? styles.ownText : styles.otherText]}>
              {message.content || `${message.latitude.toFixed(4)}, ${message.longitude.toFixed(4)}`}
            </Text>
          </View>
        ) : message.messageType === "image" ? (
          <View style={styles.locationContent}>
            <Ionicons name="image" size={18} color={isOwn ? "#fff" : Colors.dark.accent} />
            <Text style={[styles.messageText, isOwn ? styles.ownText : styles.otherText]}>
              {message.content || "Foto"}
            </Text>
          </View>
        ) : (
          <Text style={[styles.messageText, isOwn ? styles.ownText : styles.otherText]}>
            {message.content}
          </Text>
        )}
        <Text style={[styles.timeStamp, isOwn ? styles.ownTimeStamp : styles.otherTimeStamp]}>
          {formatMessageTime(message.createdAt)}
          {message.isFiltered && " \u26A0"}
        </Text>
      </View>
    </View>
  );
}

export default function ChatConversationScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const userId = user?.id || "";
  const [inputText, setInputText] = useState("");
  const flatListRef = useRef<FlatList>(null);

  const { data: conversations } = useQuery<ConversationDetail[]>({
    queryKey: ["/api/chat/conversations"],
  });

  const conversation = conversations?.find((c) => c.id === id);

  const { data: messages, isLoading } = useQuery<ChatMessage[]>({
    queryKey: ["/api/chat/conversations", id, "messages"],
    refetchInterval: 5000,
    enabled: !!id,
  });

  const sendMutation = useMutation({
    mutationFn: async (data: { messageType: string; content?: string; latitude?: number; longitude?: number }) => {
      const res = await apiRequest("POST", `/api/chat/conversations/${id}/messages`, data);
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/chat/conversations", id, "messages"] });
      queryClient.invalidateQueries({ queryKey: ["/api/chat/conversations"] });
    },
  });

  const handleSend = useCallback(() => {
    const text = inputText.trim();
    if (!text) return;
    setInputText("");
    sendMutation.mutate({ messageType: "text", content: text });
  }, [inputText, sendMutation]);

  const handleSendLocation = useCallback(async () => {
    if (Platform.OS === "web") {
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (position) => {
            sendMutation.mutate({
              messageType: "location",
              content: "Posizione condivisa",
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
            });
          },
          () => {}
        );
      }
    } else {
      try {
        const Location = require("expo-location");
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== "granted") return;
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        sendMutation.mutate({
          messageType: "location",
          content: "Posizione condivisa",
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude,
        });
      } catch {}
    }
  }, [sendMutation]);

  const getTitle = (): string => {
    if (conversation?.title) return conversation.title;
    if (conversation?.conversationType === "group") return t("chat.group");
    const other = conversation?.participants.find((p) => p.id !== userId);
    return other?.nickname ?? t("chat.title");
  };

  const renderMessage = useCallback(
    ({ item }: { item: ChatMessage }) => (
      <MessageBubble message={item} isOwn={item.senderId === userId} />
    ),
    [userId]
  );

  const webTopInset = Platform.OS === "web" ? 67 : 0;

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
    >
      <View style={[styles.topBar, { paddingTop: Platform.OS === "web" ? webTopInset + 12 : insets.top + 8 }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="chevron-back" size={28} color={Colors.dark.text} />
        </TouchableOpacity>
        <View style={styles.topBarInfo}>
          <Text style={styles.topBarTitle} numberOfLines={1}>{getTitle()}</Text>
          {conversation?.conversationType === "group" && (
            <Text style={styles.topBarSubtitle}>
              {conversation.participants.length} partecipanti
            </Text>
          )}
        </View>
      </View>

      {isLoading ? (
        <View style={styles.centerContent}>
          <ActivityIndicator size="large" color={Colors.dark.accent} />
        </View>
      ) : (
        <FlatList
          ref={flatListRef}
          data={messages}
          renderItem={renderMessage}
          keyExtractor={(item) => item.id}
          inverted
          contentContainerStyle={styles.messagesList}
          showsVerticalScrollIndicator={false}
          keyboardDismissMode="interactive"
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={
            <View style={styles.emptyChat}>
              <Ionicons name="chatbubble-outline" size={40} color={Colors.dark.textMuted} />
              <Text style={styles.emptyChatText}>Inizia la conversazione!</Text>
            </View>
          }
        />
      )}

      <View style={[styles.inputBar, { paddingBottom: Platform.OS === "web" ? 34 : Math.max(insets.bottom, 12) }]}>
        <TouchableOpacity onPress={handleSendLocation} style={styles.iconButton}>
          <Ionicons name="location-outline" size={24} color={Colors.dark.accent} />
        </TouchableOpacity>
        <View style={styles.inputWrapper}>
          <TextInput
            style={styles.textInput}
            value={inputText}
            onChangeText={setInputText}
            placeholder={t("chat.typeMessage")}
            placeholderTextColor={Colors.dark.textMuted}
            multiline
            maxLength={2000}
            returnKeyType="default"
          />
        </View>
        <TouchableOpacity
          onPress={handleSend}
          style={[styles.sendButton, !inputText.trim() && styles.sendButtonDisabled]}
          disabled={!inputText.trim() || sendMutation.isPending}
        >
          <Ionicons
            name="send"
            size={20}
            color={inputText.trim() ? "#fff" : Colors.dark.textMuted}
          />
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.background,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingBottom: 12,
    borderBottomWidth: 0.5,
    borderBottomColor: Colors.dark.border,
    backgroundColor: Colors.dark.surface,
  },
  backButton: {
    padding: 4,
    marginRight: 4,
  },
  topBarInfo: {
    flex: 1,
  },
  topBarTitle: {
    fontSize: 18,
    fontFamily: "Inter_700Bold",
    color: Colors.dark.text,
  },
  topBarSubtitle: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: Colors.dark.textSecondary,
    marginTop: 1,
  },
  centerContent: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  messagesList: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  emptyChat: {
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    transform: [{ scaleY: -1 }],
    paddingVertical: 40,
  },
  emptyChatText: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    color: Colors.dark.textMuted,
  },
  bubbleContainer: {
    maxWidth: "80%",
    marginBottom: 8,
  },
  bubbleLeft: {
    alignSelf: "flex-start",
  },
  bubbleRight: {
    alignSelf: "flex-end",
  },
  senderName: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    marginBottom: 3,
    marginLeft: 4,
  },
  bubble: {
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  ownBubble: {
    backgroundColor: Colors.dark.accent,
    borderBottomRightRadius: 4,
  },
  otherBubble: {
    backgroundColor: Colors.dark.surfaceLight,
    borderBottomLeftRadius: 4,
  },
  messageText: {
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    lineHeight: 20,
  },
  ownText: {
    color: "#fff",
  },
  otherText: {
    color: Colors.dark.text,
  },
  locationContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  timeStamp: {
    fontSize: 10,
    fontFamily: "Inter_400Regular",
    marginTop: 4,
    textAlign: "right" as const,
  },
  ownTimeStamp: {
    color: "rgba(255,255,255,0.6)",
  },
  otherTimeStamp: {
    color: Colors.dark.textMuted,
  },
  inputBar: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingHorizontal: 12,
    paddingTop: 10,
    backgroundColor: Colors.dark.surface,
    borderTopWidth: 0.5,
    borderTopColor: Colors.dark.border,
    gap: 8,
  },
  iconButton: {
    padding: 8,
    marginBottom: 2,
  },
  inputWrapper: {
    flex: 1,
    backgroundColor: Colors.dark.surfaceLight,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === "ios" ? 10 : 6,
    maxHeight: 120,
  },
  textInput: {
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    color: Colors.dark.text,
    maxHeight: 100,
  },
  sendButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: Colors.dark.accent,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 2,
  },
  sendButtonDisabled: {
    backgroundColor: Colors.dark.surfaceLight,
  },
});
