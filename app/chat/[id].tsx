import React, { useState, useCallback, useRef, useMemo } from "react";
import {
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Switch,
  Platform,
} from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/colors";
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

function getUserTypeColor(userType: string, sex?: string | null): string {
  if (userType === "coppia") return Colors.coupleIcon;
  if (sex === "F") return Colors.femaleIcon;
  if (sex === "M") return Colors.maleIcon;
  if (userType.startsWith("zavorrina")) return Colors.femaleIcon;
  if (userType.startsWith("biker")) return Colors.maleIcon;
  return Colors.textSecondary;
}

function parseHashtagsFromInput(input: string): string[] {
  return input
    .split(/\s+/)
    .map((w) => w.trim().toLowerCase())
    .filter((w) => w.startsWith("#") && w.length > 1);
}

function messageMatchesHashtags(content: string | null, hashtags: string[]): boolean {
  if (!content || hashtags.length === 0) return true;
  const lower = content.toLowerCase();
  return hashtags.some((tag) => lower.includes(tag));
}

function TextWithHashtags({
  text,
  isOwn,
  style,
}: {
  text: string;
  isOwn: boolean;
  style: object;
}) {
  const parts = text.split(/(\s+)/);
  return (
    <Text style={style}>
      {parts.map((part, i) => {
        const isHashtag = /^#[a-zA-Z0-9_àèéìíîòóùúÀÈÉÌÍÎÒÓÙÚ]+$/.test(part);
        if (isHashtag) {
          return (
            <Text
              key={i}
              style={{ color: isOwn ? "#FFD580" : Colors.accent, fontFamily: "Inter_600SemiBold" }}
            >
              {part}
            </Text>
          );
        }
        return <Text key={i}>{part}</Text>;
      })}
    </Text>
  );
}

function MessageBubble({ message, isOwn }: { message: ChatMessage; isOwn: boolean }) {
  const hasHashtag =
    message.messageType === "text" &&
    message.content &&
    /#[a-zA-Z0-9_àèéìíîòóùúÀÈÉÌÍÎÒÓÙÚ]+/.test(message.content);

  return (
    <View style={[styles.bubbleContainer, isOwn ? styles.bubbleRight : styles.bubbleLeft]}>
      {!isOwn && message.sender && (
        <Text style={[styles.senderName, { color: getUserTypeColor(message.sender.userType, message.sender.sex) }]}>
          {message.sender.nickname}
        </Text>
      )}
      <View style={[styles.bubble, isOwn ? styles.ownBubble : styles.otherBubble]}>
        {message.messageType === "location" && message.latitude && message.longitude ? (
          <View style={styles.locationContent}>
            <Ionicons name="location" size={18} color={isOwn ? "#fff" : Colors.accent} />
            <Text style={[styles.messageText, isOwn ? styles.ownText : styles.otherText]}>
              {message.content || `${message.latitude.toFixed(4)}, ${message.longitude.toFixed(4)}`}
            </Text>
          </View>
        ) : message.messageType === "image" ? (
          <View style={styles.locationContent}>
            <Ionicons name="image" size={18} color={isOwn ? "#fff" : Colors.accent} />
            <Text style={[styles.messageText, isOwn ? styles.ownText : styles.otherText]}>
              {message.content || "Foto"}
            </Text>
          </View>
        ) : hasHashtag ? (
          <TextWithHashtags
            text={message.content!}
            isOwn={isOwn}
            style={[styles.messageText, isOwn ? styles.ownText : styles.otherText]}
          />
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

function MotoclubWelcomeBanner({ clubName }: { clubName: string | null }) {
  return (
    <View style={styles.welcomeBanner}>
      <Ionicons name="information-circle" size={18} color={Colors.accent} />
      <Text style={styles.welcomeText}>
        Usa gli hashtag della tua regione per organizzare i messaggi del club.{"\n"}
        <Text style={{ color: Colors.accent, fontFamily: "Inter_600SemiBold" }}>Esempio: #veneto #lombardia</Text>
      </Text>
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

  const [showHashtagPanel, setShowHashtagPanel] = useState(false);
  const [hashtagInput, setHashtagInput] = useState("");
  const [autoHashtag, setAutoHashtag] = useState(false);

  const { data: conversations } = useQuery<ConversationDetail[]>({
    queryKey: ["/api/chat/conversations"],
  });

  const conversation = conversations?.find((c) => c.id === id);
  const isMotoclub = conversation?.conversationType === "motoclub";

  const { data: messages, isLoading } = useQuery<ChatMessage[]>({
    queryKey: ["/api/chat/conversations", id, "messages"],
    refetchInterval: 5000,
    enabled: !!id,
  });

  const activeHashtags = useMemo(() => parseHashtagsFromInput(hashtagInput), [hashtagInput]);

  const filteredMessages = useMemo(() => {
    if (!messages) return [];
    if (activeHashtags.length === 0) return messages;
    return messages.filter((m) => messageMatchesHashtags(m.content, activeHashtags));
  }, [messages, activeHashtags]);

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
    let text = inputText.trim();
    if (!text) return;
    if (isMotoclub && autoHashtag && activeHashtags.length > 0) {
      const suffix = " " + activeHashtags.join(" ");
      if (!text.toLowerCase().includes(activeHashtags[0])) {
        text = text + suffix;
      }
    }
    setInputText("");
    sendMutation.mutate({ messageType: "text", content: text });
  }, [inputText, sendMutation, isMotoclub, autoHashtag, activeHashtags]);

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
    if (conversation?.conversationType === "motoclub") return "MotoClub";
    if (conversation?.conversationType === "contact") {
      const others = conversation.participants.filter((p) => p.id !== userId);
      if (others.length === 0) return "Chat di contatto";
      if (others.length === 1) return `Contatto - ${others[0].nickname}`;
      return `Contatto (${conversation.participants.length})`;
    }
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
  const isGroupLike =
    conversation?.conversationType === "group" ||
    conversation?.conversationType === "contact" ||
    conversation?.conversationType === "motoclub";

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
    >
      <View style={[styles.topBar, { paddingTop: Platform.OS === "web" ? webTopInset + 12 : insets.top + 8 }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="chevron-back" size={28} color={Colors.text} />
        </TouchableOpacity>
        <View style={styles.topBarInfo}>
          <Text style={styles.topBarTitle} numberOfLines={1}>{getTitle()}</Text>
          {isGroupLike && conversation && (
            <Text style={styles.topBarSubtitle}>
              {conversation.participants.length} partecipanti
            </Text>
          )}
        </View>
        {isMotoclub && (
          <TouchableOpacity
            onPress={() => setShowHashtagPanel((v) => !v)}
            style={[styles.hashtagBtn, showHashtagPanel && styles.hashtagBtnActive]}
            activeOpacity={0.7}
          >
            <Text style={[styles.hashtagBtnText, showHashtagPanel && styles.hashtagBtnTextActive]}>#</Text>
          </TouchableOpacity>
        )}
        {!isMotoclub && conversation?.conversationType !== "group" && (() => {
          const otherUser = conversation?.participants.find((p: any) => p.id !== userId);
          if (!otherUser) return null;
          return (
            <TouchableOpacity onPress={() => router.push(`/profile/${otherUser.id}` as any)} style={styles.infoButton}>
              <Ionicons name="information-circle-outline" size={26} color={Colors.text} />
            </TouchableOpacity>
          );
        })()}
      </View>

      {isMotoclub && showHashtagPanel && (
        <View style={styles.hashtagPanel}>
          <View style={styles.hashtagInputRow}>
            <Ionicons name="search" size={16} color={Colors.textSecondary} />
            <TextInput
              style={styles.hashtagTextInput}
              value={hashtagInput}
              onChangeText={setHashtagInput}
              placeholder="#veneto #liguria #lombardia..."
              placeholderTextColor={Colors.textSecondary}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="done"
            />
            {hashtagInput.length > 0 && (
              <TouchableOpacity onPress={() => setHashtagInput("")} style={styles.hashtagClearBtn}>
                <Ionicons name="close-circle" size={18} color={Colors.textSecondary} />
              </TouchableOpacity>
            )}
          </View>

          {activeHashtags.length > 0 && (
            <Text style={styles.hashtagCounter}>
              {filteredMessages.length} di {messages?.length ?? 0} messaggi
            </Text>
          )}

          <View style={styles.autoHashtagRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.autoHashtagLabel}>Aggiungi automaticamente a fine frase</Text>
              {autoHashtag && activeHashtags.length > 0 && (
                <Text style={styles.autoHashtagSub}>{activeHashtags.join(" ")}</Text>
              )}
            </View>
            <Switch
              value={autoHashtag}
              onValueChange={setAutoHashtag}
              trackColor={{ false: Colors.border, true: Colors.accent + "88" }}
              thumbColor={autoHashtag ? Colors.accent : Colors.textSecondary}
            />
          </View>
        </View>
      )}

      {isLoading ? (
        <View style={styles.centerContent}>
          <ActivityIndicator size="large" color={Colors.accent} />
        </View>
      ) : (messages || []).length === 0 ? (
        <View style={styles.emptyChatOuter}>
          <Ionicons name="chatbubble-outline" size={40} color={Colors.textSecondary} />
          <Text style={styles.emptyChatText}>Inizia la conversazione!</Text>
          {isMotoclub && (
            <MotoclubWelcomeBanner clubName={conversation?.title ?? null} />
          )}
        </View>
      ) : (
        <FlatList
          ref={flatListRef}
          data={filteredMessages}
          renderItem={renderMessage}
          keyExtractor={(item) => item.id}
          inverted
          contentContainerStyle={styles.messagesList}
          showsVerticalScrollIndicator={false}
          keyboardDismissMode="interactive"
          keyboardShouldPersistTaps="handled"
          ListFooterComponent={
            isMotoclub ? <MotoclubWelcomeBanner clubName={conversation?.title ?? null} /> : null
          }
          ListEmptyComponent={
            activeHashtags.length > 0 ? (
              <View style={styles.noHashtagResults}>
                <Text style={styles.noHashtagResultsText}>
                  Nessun messaggio con {activeHashtags.join(" ")}
                </Text>
              </View>
            ) : null
          }
        />
      )}

      <View style={[styles.inputBar, { paddingBottom: Platform.OS === "web" ? 34 : Math.max(insets.bottom, 12) }]}>
        <TouchableOpacity onPress={handleSendLocation} style={styles.iconButton}>
          <Ionicons name="location-outline" size={24} color={Colors.accent} />
        </TouchableOpacity>
        <View style={styles.inputWrapper}>
          <TextInput
            style={styles.textInput}
            value={inputText}
            onChangeText={setInputText}
            placeholder={
              isMotoclub && autoHashtag && activeHashtags.length > 0
                ? `Scrivi... (${activeHashtags.join(" ")} in auto)`
                : t("chat.typeMessage")
            }
            placeholderTextColor={Colors.textSecondary}
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
            color={inputText.trim() ? "#fff" : Colors.textSecondary}
          />
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingBottom: 12,
    borderBottomWidth: 0.5,
    borderBottomColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  backButton: {
    padding: 4,
    marginRight: 4,
  },
  infoButton: {
    padding: 4,
    marginLeft: 8,
  },
  hashtagBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.surfaceLight,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 8,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  hashtagBtnActive: {
    backgroundColor: Colors.accent,
    borderColor: Colors.accent,
  },
  hashtagBtnText: {
    fontSize: 18,
    fontFamily: "Inter_700Bold",
    color: Colors.textSecondary,
    lineHeight: 22,
  },
  hashtagBtnTextActive: {
    color: "#fff",
  },
  topBarInfo: {
    flex: 1,
  },
  topBarTitle: {
    fontSize: 18,
    fontFamily: "Inter_700Bold",
    color: Colors.text,
  },
  topBarSubtitle: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
    marginTop: 1,
  },
  hashtagPanel: {
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 12,
    gap: 8,
  },
  hashtagInputRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.surfaceLight,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 7,
    gap: 6,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  hashtagTextInput: {
    flex: 1,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: Colors.text,
  },
  hashtagClearBtn: {
    padding: 2,
  },
  hashtagCounter: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    color: Colors.accent,
  },
  autoHashtagRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderTopWidth: 0.5,
    borderTopColor: Colors.border,
    paddingTop: 8,
  },
  autoHashtagLabel: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    color: Colors.text,
  },
  autoHashtagSub: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    color: Colors.accent,
    marginTop: 2,
  },
  welcomeBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    backgroundColor: Colors.accent + "18",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.accent + "33",
    padding: 12,
    marginHorizontal: 16,
    marginVertical: 12,
  },
  welcomeText: {
    flex: 1,
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
    lineHeight: 19,
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
  emptyChatOuter: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 20,
  },
  emptyChatText: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    color: Colors.textSecondary,
  },
  noHashtagResults: {
    alignItems: "center",
    paddingVertical: 32,
  },
  noHashtagResultsText: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
    textAlign: "center",
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
    backgroundColor: Colors.accent,
    borderBottomRightRadius: 4,
  },
  otherBubble: {
    backgroundColor: Colors.surfaceLight,
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
    color: Colors.text,
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
    color: Colors.textSecondary,
  },
  inputBar: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingHorizontal: 12,
    paddingTop: 10,
    backgroundColor: Colors.surface,
    borderTopWidth: 0.5,
    borderTopColor: Colors.border,
    gap: 8,
  },
  iconButton: {
    padding: 8,
    marginBottom: 2,
  },
  inputWrapper: {
    flex: 1,
    backgroundColor: Colors.surfaceLight,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === "ios" ? 10 : 6,
    maxHeight: 120,
  },
  textInput: {
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    color: Colors.text,
    maxHeight: 100,
  },
  sendButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: Colors.accent,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 2,
  },
  sendButtonDisabled: {
    backgroundColor: Colors.surfaceLight,
  },
});
