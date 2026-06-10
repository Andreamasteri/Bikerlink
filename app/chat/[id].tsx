import React, { useState, useCallback, useRef, useMemo, useEffect } from "react";
import {
  View,
  Text,
  FlatList,
  TextInput,
  StyleSheet,
  ActivityIndicator,
  Alert,
  AppState,
  TouchableOpacity,
} from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useLocalSearchParams, useRouter, useFocusEffect } from "expo-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { apiRequest, queryClient, getApiUrl, getQueryFnWithTimeout } from "@/lib/query-client";
import { showImagePickerMenu, uriToBlob } from "@/lib/image-picker-utils";
import { useChatSSE } from "@/hooks/useChatSSE";
import { useT } from "@/lib/language-context";
import { useAuth } from "@/lib/auth-context";

// Custom Components
import { MessageBubble, ChatMessage } from "@/components/chat/MessageBubble";
import { ChatHeader } from "@/components/chat/ChatHeader";
import { ChatInput } from "@/components/chat/ChatInput";
import { ChatMembersModal } from "@/components/chat/ChatMembersModal";
import { HashtagPanel } from "@/components/chat/HashtagPanel";

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

interface MotoClub {
  id: string;
  name: string;
  conversationId: string | null;
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

function MotoclubWelcomeBanner() {
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
  const t = useT();
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const userId = user?.id || "";
  const [inputText, setInputText] = useState("");
  const flatListRef = useRef<FlatList>(null);
  const textInputRef = useRef<TextInput | null>(null);

  const [showHashtagPanel, setShowHashtagPanel] = useState(false);
  const [hashtagInput, setHashtagInput] = useState("");
  const [autoHashtag, setAutoHashtag] = useState(false);
  const [showMembersPanel, setShowMembersPanel] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);

  const { data: conversations } = useQuery<ConversationDetail[]>({
    queryKey: ["/api/chat/conversations"],
  });

  const { data: conversationDetail } = useQuery<ConversationDetail>({
    queryKey: ["/api/chat/conversations", id],
    queryFn: getQueryFnWithTimeout(15000),
    staleTime: 60000,
    retry: false,
    enabled: !!id,
  });

  const conversation = conversationDetail ?? conversations?.find((c) => c.id === id);
  const isMotoclub = conversation?.conversationType === "motoclub";

  const { data: myClubs } = useQuery<MotoClub[]>({
    queryKey: ["/api/motoclubs/me/clubs"],
    enabled: isMotoclub,
    staleTime: 300000,
  });

  const isMotoclubRef = useRef(false);
  if (conversation !== undefined) isMotoclubRef.current = isMotoclub;

  const markAsRead = useCallback(async () => {
    if (!id) return;
    try {
      await apiRequest("POST", `/api/chat/conversations/${id}/read`);
    } catch {
    }
    queryClient.setQueryData<Array<{ id: string; unreadCount: number; [key: string]: unknown }>>(
      ["/api/chat/conversations"],
      (old) => {
        if (!old) return old;
        const conv = old.find((c) => c.id === id);
        const wasUnread = (conv?.unreadCount ?? 0) as number;
        if (wasUnread > 0) {
          queryClient.setQueryData<{ count: number }>(
            ["/api/chat/conversations/unread-total"],
            (prev) => {
              if (!prev) return { count: 0 };
              return { count: Math.max(0, prev.count - wasUnread) };
            }
          );
        }
        return old.map((c) => (c.id === id ? { ...c, unreadCount: 0 } : c));
      }
    );
    queryClient.invalidateQueries({ queryKey: ["/api/chat/conversations"] });
    queryClient.invalidateQueries({ queryKey: ["/api/chat/conversations/unread-total"] });
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      markAsRead();
    }, [markAsRead])
  );

  const { data: messages, isLoading, isError: isMessagesError, refetch: refetchMessages } = useQuery<ChatMessage[]>({
    queryKey: ["/api/chat/conversations", id, "messages"],
    queryFn: getQueryFnWithTimeout(15000),
    refetchInterval: 60000,
    staleTime: 60000,
    retry: false,
    enabled: !!id,
  });

  useChatSSE((event) => {
    if (event.type === "message_deleted" && event.conversationId === id) {
      queryClient.invalidateQueries({ queryKey: ["/api/chat/conversations", id, "messages"] });
      queryClient.invalidateQueries({ queryKey: ["/api/chat/conversations"] });
    } else if (event.type === "new_message" && event.conversationId === id && event.message) {
      const incoming = event.message as unknown as ChatMessage;
      if (incoming.senderId !== userId) {
        queryClient.setQueryData<ChatMessage[]>(
          ["/api/chat/conversations", id, "messages"],
          (old) => {
            if (!old) return [incoming];
            if (old.some((m) => m.id === incoming.id)) return old;
            return [incoming, ...old];
          }
        );
        markAsRead();
      }
      queryClient.setQueryData<Array<{ id: string; unreadCount: number; [key: string]: unknown }>>(
        ["/api/chat/conversations"],
        (old) => {
          if (!old) return old;
          return old.map((c) => (c.id === id ? { ...c, unreadCount: 0 } : c));
        }
      );
    } else if (event.type === "conversation_update") {
      queryClient.invalidateQueries({ queryKey: ["/api/chat/conversations"] });
    } else if (event.conversationId === id) {
      queryClient.invalidateQueries({ queryKey: ["/api/chat/conversations", id, "messages"] });
      queryClient.invalidateQueries({ queryKey: ["/api/chat/conversations"] });
    }
  });

  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        queryClient.invalidateQueries({ queryKey: ["/api/chat/conversations", id, "messages"] });
        queryClient.invalidateQueries({ queryKey: ["/api/chat/conversations"] });
      }
    });
    return () => sub.remove();
  }, [id]);

  const activeHashtags = useMemo(() => parseHashtagsFromInput(hashtagInput), [hashtagInput]);

  const autoHashtagRef = useRef(false);
  autoHashtagRef.current = autoHashtag;
  const activeHashtagsRef = useRef<string[]>([]);
  activeHashtagsRef.current = activeHashtags;
  const inputTextRef = useRef("");
  inputTextRef.current = inputText;

  const filteredMessages = useMemo(() => {
    if (!messages) return [];
    if (activeHashtags.length === 0) return messages;
    return messages.filter(
      (m) => m.senderId === userId || messageMatchesHashtags(m.content, activeHashtags)
    );
  }, [messages, activeHashtags, userId]);

  const sendMutation = useMutation({
    mutationFn: async (data: { messageType: string; content?: string; latitude?: number; longitude?: number }) => {
      const res = await apiRequest("POST", `/api/chat/conversations/${id}/messages`, data);
      return await res.json();
    },
    onMutate: async (data) => {
      await queryClient.cancelQueries({ queryKey: ["/api/chat/conversations", id, "messages"] });
      const previousMessages = queryClient.getQueryData<ChatMessage[]>(["/api/chat/conversations", id, "messages"]);
      const optimisticId = `optimistic-${Date.now()}`;
      const optimisticMessage: ChatMessage = {
        id: optimisticId,
        conversationId: id,
        senderId: userId,
        messageType: data.messageType,
        content: data.content ?? null,
        imageUrl: null,
        latitude: data.latitude ?? null,
        longitude: data.longitude ?? null,
        isFiltered: false,
        createdAt: new Date().toISOString(),
        sender: user
          ? {
              id: user.id,
              nickname: user.nickname ?? "",
              avatarUrl: user.avatarUrl ?? null,
              userType: user.userType ?? "biker",
              sex: user.sex ?? null,
            }
          : null,
      };
      queryClient.setQueryData<ChatMessage[]>(
        ["/api/chat/conversations", id, "messages"],
        (old) => (old ? [optimisticMessage, ...old] : [optimisticMessage])
      );
      return { previousMessages, optimisticId };
    },
    onSuccess: (newMessage, _data, context) => {
      queryClient.setQueryData<ChatMessage[]>(
        ["/api/chat/conversations", id, "messages"],
        (old) => {
          if (!old) return [newMessage];
          return old.map((m) => (m.id === context?.optimisticId ? newMessage : m));
        }
      );
      queryClient.invalidateQueries({ queryKey: ["/api/chat/conversations"] });
    },
    onError: (error: Error, _data, context) => {
      if (context?.previousMessages !== undefined) {
        queryClient.setQueryData(["/api/chat/conversations", id, "messages"], context.previousMessages);
      } else if (context?.optimisticId) {
        queryClient.setQueryData<ChatMessage[]>(
          ["/api/chat/conversations", id, "messages"],
          (old) => old ? old.filter((m) => m.id !== context.optimisticId) : old
        );
      }
      const msg = error?.message || t("chat.sendMessageError");
      Alert.alert("Errore invio", msg.replace(/^\d+:\s*/, ""));
    },
  });

  const sendMutateRef = useRef(sendMutation.mutate);
  sendMutateRef.current = sendMutation.mutate;

  const deleteConversationMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", `/api/chat/conversations/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/chat/conversations"] });
      router.back();
    },
  });

  const deleteMessageMutation = useMutation({
    mutationFn: async (messageId: string) => {
      await apiRequest("DELETE", `/api/chat/messages/${messageId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/chat/conversations", id, "messages"] });
    },
    onError: () => {
      Alert.alert("Errore", "Impossibile eliminare il messaggio. Riprova.");
    },
  });

  const handleDeleteMessage = useCallback((messageId: string) => {
    deleteMessageMutation.mutate(messageId);
  }, [deleteMessageMutation]);

  const { data: lastfmStatus } = useQuery<{ connected: boolean; trackCount?: number }>({
    queryKey: ["/api/lastfm/status"],
    retry: false,
  });

  const musicConnected = lastfmStatus?.connected ?? false;
  const musicTrackCount = lastfmStatus?.trackCount ?? 0;

  const sharePlaylistMutation = useMutation({
    mutationFn: async ({ toUserId }: { toUserId: string }) => {
      const res = await apiRequest("POST", "/api/lastfm/share-playlist", {
        toUserId,
        conversationId: id,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/chat/conversations", id, "messages"] });
      Alert.alert(t("chat.librarySent"), t("chat.librarySentMsg"));
    },
    onError: () => {
      Alert.alert("Errore", "Impossibile condividere la libreria. Riprova.");
    },
  });

  const otherParticipant = conversation?.participants.find((p) => p.id !== userId);
  const isPrivateChat = !isMotoclub && conversation?.participants.length === 2;

  const handleSharePlaylist = useCallback(() => {
    if (!musicConnected) {
      Alert.alert(t("chat.musicNotConnected"), t("chat.connectLastfmMsg"));
      return;
    }
    if (!isPrivateChat || !otherParticipant) return;
    Alert.alert(
      t("chat.sendLibraryTitle"),
      t("chat.sendLibraryMsg").replace("{count}", String(musicTrackCount)).replace("{name}", otherParticipant.nickname ?? ""),
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("chat.send"),
          onPress: () => sharePlaylistMutation.mutate({ toUserId: otherParticipant.id }),
        },
      ]
    );
  }, [musicConnected, musicTrackCount, isPrivateChat, otherParticipant, sharePlaylistMutation, t]);

  const handleDeleteConversation = useCallback(() => {
    Alert.alert(
      t("chat.deleteTitle2"),
      t("chat.deleteConversationSimpleMsg"),
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("common.delete"),
          style: "destructive",
          onPress: () => deleteConversationMutation.mutate(),
        },
      ]
    );
  }, [deleteConversationMutation, t]);

  const handleSend = useCallback(() => {
    let text = inputTextRef.current.trim();
    if (!text) return;
    const tags = activeHashtagsRef.current;
    if (isMotoclubRef.current && autoHashtagRef.current && tags.length > 0) {
      const suffix = " " + tags.join(" ");
      if (!text.toLowerCase().includes(tags[0])) {
        text = text + suffix;
      }
    }
    setInputText("");
    sendMutateRef.current({ messageType: "text", content: text });
  }, []);

  const handleSendLocation = useCallback(async () => {
    const insertCoords = (lat: number, lng: number) => {
      const formatted = `📍 ${lat.toFixed(5)}, ${lng.toFixed(5)}`;
      setInputText((prev) => (prev ? prev + " " + formatted : formatted));
      setTimeout(() => textInputRef.current?.focus(), 100);
    };

    try {
        const Location = require("expo-location");
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== "granted") {
          Alert.alert(t("chat.permissionDenied"), t("chat.locationPermissionMsg"));
          return;
        }
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
        insertCoords(loc.coords.latitude, loc.coords.longitude);
      } catch {
        Alert.alert(t("chat.locationError"), t("chat.cannotGetGps"));
      }
  }, [t]);

  const uploadPhoto = useCallback(async (uri: string) => {
    setIsUploadingImage(true);
    try {
      const formData = new FormData();
      const filename = uri.split("/").pop() ?? "photo.jpg";
      const ext = filename.split(".").pop()?.toLowerCase() ?? "jpg";
      const mimeType = ext === "png" ? "image/png" : ext === "gif" ? "image/gif" : "image/jpeg";
      const blob = await uriToBlob(uri, mimeType);
      formData.append("image", blob, filename);

      const uploadUrl = new URL(`/api/chat/conversations/${id}/images`, getApiUrl()).toString();
      const resp = await fetch(uploadUrl, {
        method: "POST",
        body: formData,
        credentials: "include",
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ message: t("chat.uploadError") }));
        throw new Error((err as Error).message ?? t("chat.uploadPhotoError"));
      }

      await queryClient.invalidateQueries({ queryKey: ["/api/chat/conversations", id, "messages"] });
    } catch (err: unknown) {
      Alert.alert("Errore", (err instanceof Error ? err.message : null) ?? "Impossibile inviare la foto.");
    } finally {
      setIsUploadingImage(false);
    }
  }, [id, t]);

  const handleSendPhoto = useCallback(() => {
    showImagePickerMenu((uri) => {
      uploadPhoto(uri);
    });
  }, [uploadPhoto]);

  const getTitle = (): string => {
    if (conversation?.title) return conversation.title;
    if (conversation?.conversationType === "motoclub") {
      const matchedClub = myClubs?.find((c) => c.conversationId === id);
      return matchedClub?.name ?? "MotoClub";
    }
    if (conversation?.conversationType === "contact") {
      const others = conversation.participants.filter((p) => p.id !== userId);
      if (others.length === 0) return t("chat.contactChat");
      if (others.length === 1) return `Contatto - ${others[0].nickname}`;
      return `Contatto (${conversation.participants.length})`;
    }
    if (conversation?.conversationType === "group") return t("chat.group");
    const other = conversation?.participants.find((p) => p.id !== userId);
    return other?.nickname ?? t("chat.title");
  };

  const renderMessage = useCallback(
    ({ item }: { item: ChatMessage }) => (
      <MessageBubble
        message={item}
        isOwn={item.senderId === userId}
        onDelete={item.senderId === userId ? handleDeleteMessage : undefined}
      />
    ),
    [userId, handleDeleteMessage]
  );

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior="padding"
      keyboardVerticalOffset={0}
    >
      <ChatHeader
        title={getTitle()}
        isMotoclub={isMotoclub}
        participantCount={conversation?.participants.length}
        isPrivateChat={isPrivateChat}
        otherParticipantId={otherParticipant?.id}
        onShowMembers={() => setShowMembersPanel(true)}
        onToggleHashtags={() => setShowHashtagPanel((v) => !v)}
        onDeleteConversation={handleDeleteConversation}
        showHashtagPanel={showHashtagPanel}
      />

      {isMotoclub && showHashtagPanel && (
        <HashtagPanel
          hashtagInput={hashtagInput}
          onHashtagInputChange={setHashtagInput}
          onClearHashtagInput={() => setHashtagInput("")}
          filteredCount={filteredMessages.length}
          totalCount={messages?.length ?? 0}
          autoHashtag={autoHashtag}
          onAutoHashtagChange={setAutoHashtag}
          activeHashtags={activeHashtags}
        />
      )}

      {isLoading ? (
        <View style={styles.centerContent}>
          <ActivityIndicator size="large" color={Colors.accent} />
        </View>
      ) : isMessagesError ? (
        <View style={styles.centerContent}>
          <Ionicons name="cloud-offline-outline" size={40} color={Colors.textSecondary} />
          <Text style={styles.emptyChatText}>Impossibile caricare i messaggi</Text>
          <TouchableOpacity style={styles.retryButton} onPress={() => refetchMessages()}>
            <Text style={styles.retryText}>Riprova</Text>
          </TouchableOpacity>
        </View>
      ) : (messages || []).length === 0 ? (
        <View style={styles.emptyChatOuter}>
          <Ionicons name="chatbubble-outline" size={40} color={Colors.textSecondary} />
          <Text style={styles.emptyChatText}>Inizia la conversazione!</Text>
          {isMotoclub && (
            <MotoclubWelcomeBanner />
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
        />
      )}

      <ChatInput
        inputText={inputText}
        onChangeText={setInputText}
        onSend={handleSend}
        onSendPhoto={handleSendPhoto}
        onSendLocation={handleSendLocation}
        onSharePlaylist={handleSharePlaylist}
        isUploadingImage={isUploadingImage}
        isPrivateChat={isPrivateChat}
      />

      <ChatMembersModal
        visible={showMembersPanel}
        onClose={() => setShowMembersPanel(false)}
        members={conversation?.participants || []}
      />
    </KeyboardAvoidingView>
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
  },
  messagesList: {
    paddingVertical: 12,
  },
  emptyChatOuter: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  emptyChatText: {
    fontSize: 16,
    fontFamily: "Inter_500Medium",
    color: Colors.textSecondary,
    marginTop: 12,
  },
  retryButton: {
    marginTop: 16,
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
  welcomeBanner: {
    marginTop: 24,
    backgroundColor: Colors.surfaceLight,
    borderRadius: 12,
    padding: 16,
    borderLeftWidth: 4,
    borderLeftColor: Colors.accent,
    width: "100%",
  },
  welcomeText: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
    marginTop: 8,
    lineHeight: 18,
  },
});
