import React, { useState, useCallback, useRef, useMemo, useEffect } from "react";
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
  Alert,
  Modal,
  Image,
  Pressable,
  AppState,
} from "react-native";
import { KeyboardAvoidingView } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/colors";
import { t, getCurrentLocale } from "@/lib/i18n";
import { useAuth } from "@/lib/auth-context";
import { apiRequest, queryClient, getApiUrl } from "@/lib/query-client";
import { showImagePickerMenu } from "@/lib/image-picker-utils";
import FavoriteStar from "@/components/FavoriteStar";
import { useChatSSE } from "@/hooks/useChatSSE";
import { useT } from "@/lib/language-context";

interface MessageSender {
  id: string;
  nickname: string;
  avatarUrl: string | null;
  userType: string;
  sex?: string | null;
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
  playlistId?: number | null;
}

const MUSIC_ACCENT = "#2196F3";

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
  return date.toLocaleTimeString(getCurrentLocale(), { hour: "2-digit", minute: "2-digit" });
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

function PlaylistBubble({ message, isOwn }: { message: ChatMessage; isOwn: boolean }) {
  const router = useRouter();
  let playlistId: number | null = null;
  try {
    if (message.content) {
      const parsed = JSON.parse(message.content);
      if (parsed.playlistId) playlistId = parsed.playlistId;
    }
  } catch {}

  const iconColor = isOwn ? "#fff" : MUSIC_ACCENT;
  const textColor = isOwn ? "#fff" : Colors.text;

  const handlePress = () => {
    if (isOwn || !playlistId) return;
    router.push({ pathname: "/(tabs)/music", params: { tab: "brani", playlistId: String(playlistId) } } as any);
  };

  return (
    <TouchableOpacity
      onPress={handlePress}
      activeOpacity={isOwn ? 1 : 0.7}
      style={styles.locationContent}
    >
      <Ionicons name="musical-notes" size={20} color={iconColor} style={{ marginRight: 8 }} />
      <Text style={[styles.messageText, { color: textColor }]}>Nuova playlist</Text>
      {!isOwn && (
        <Ionicons name="chevron-forward" size={14} color={Colors.textSecondary} style={{ marginLeft: 6 }} />
      )}
    </TouchableOpacity>
  );
}

function ImageMessageBubble({ message, isOwn }: { message: ChatMessage; isOwn: boolean }) {
  const [fullscreen, setFullscreen] = useState(false);
  const baseUrl = getApiUrl();
  const imageUri = message.imageUrl
    ? message.imageUrl.startsWith("http")
      ? message.imageUrl
      : new URL(message.imageUrl, baseUrl).toString()
    : null;

  return (
    <>
      <Pressable onPress={() => imageUri && setFullscreen(true)}>
        {imageUri ? (
          <Image
            source={{ uri: imageUri }}
            style={styles.chatImage}
            resizeMode="cover"
          />
        ) : (
          <View style={styles.locationContent}>
            <Ionicons name="image" size={18} color={isOwn ? "#fff" : Colors.accent} />
            <Text style={[styles.messageText, isOwn ? styles.ownText : styles.otherText]}>Foto</Text>
          </View>
        )}
      </Pressable>
      <Modal visible={fullscreen} transparent animationType="fade" onRequestClose={() => setFullscreen(false)}>
        <Pressable style={styles.fullscreenOverlay} onPress={() => setFullscreen(false)}>
          <Image source={{ uri: imageUri ?? "" }} style={styles.fullscreenImage} resizeMode="contain" />
        </Pressable>
      </Modal>
    </>
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
      <View style={[styles.bubble, isOwn ? styles.ownBubble : styles.otherBubble, message.messageType === "image" && styles.imageBubble]}>
        {message.messageType === "playlist" ? (
          <PlaylistBubble message={message} isOwn={isOwn} />
        ) : message.messageType === "location" && message.latitude && message.longitude ? (
          <View style={styles.locationContent}>
            <Ionicons name="location" size={18} color={isOwn ? "#fff" : Colors.accent} />
            <Text style={[styles.messageText, isOwn ? styles.ownText : styles.otherText]}>
              {message.content || `${message.latitude.toFixed(4)}, ${message.longitude.toFixed(4)}`}
            </Text>
          </View>
        ) : message.messageType === "image" ? (
          <ImageMessageBubble message={message} isOwn={isOwn} />
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
        {message.messageType !== "image" && (
          <Text style={[styles.timeStamp, isOwn ? styles.ownTimeStamp : styles.otherTimeStamp]}>
            {formatMessageTime(message.createdAt)}
            {message.isFiltered && " \u26A0"}
          </Text>
        )}
      </View>
      {message.messageType === "image" && (
        <Text style={[styles.timeStamp, isOwn ? styles.ownTimeStamp : styles.otherTimeStamp, { marginTop: 2 }]}>
          {formatMessageTime(message.createdAt)}
        </Text>
      )}
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
  const t = useT();
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
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

  const conversation = conversations?.find((c) => c.id === id);
  const isMotoclub = conversation?.conversationType === "motoclub";

  const isMotoclubRef = useRef(false);
  if (conversations !== undefined) isMotoclubRef.current = isMotoclub;

  const { data: messages, isLoading } = useQuery<ChatMessage[]>({
    queryKey: ["/api/chat/conversations", id, "messages"],
    refetchInterval: 15000,
    enabled: !!id,
  });

  useChatSSE((event) => {
    if (event.conversationId === id) {
      queryClient.invalidateQueries({ queryKey: ["/api/chat/conversations", id, "messages"] });
    }
    queryClient.invalidateQueries({ queryKey: ["/api/chat/conversations"] });
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/chat/conversations", id, "messages"] });
      queryClient.invalidateQueries({ queryKey: ["/api/chat/conversations"] });
    },
    onError: (error: Error) => {
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
  }, [musicConnected, musicTrackCount, isPrivateChat, otherParticipant, sharePlaylistMutation]);

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
  }, [deleteConversationMutation]);

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

    if (Platform.OS === "web") {
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (position) => {
            insertCoords(position.coords.latitude, position.coords.longitude);
          },
          () => {
            Alert.alert(t("chat.locationUnavailable"), t("chat.locationUnavailableWeb"));
          }
        );
      } else {
        Alert.alert("Non supportato", "Il tuo browser non supporta la geolocalizzazione.");
      }
    } else {
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
        Alert.alert("Errore posizione", "Impossibile ottenere la posizione GPS. Riprova.");
      }
    }
  }, []);

  const uploadPhoto = useCallback(async (uri: string) => {
    setIsUploadingImage(true);
    try {
      const formData = new FormData();
      const filename = uri.split("/").pop() ?? "photo.jpg";
      const ext = filename.split(".").pop()?.toLowerCase() ?? "jpg";
      const mimeType = ext === "png" ? "image/png" : ext === "gif" ? "image/gif" : "image/jpeg";
      (formData as any).append("image", { uri, name: filename, type: mimeType } as any);

      const uploadUrl = new URL(`/api/chat/conversations/${id}/images`, getApiUrl()).toString();
      const resp = await fetch(uploadUrl, {
        method: "POST",
        body: formData,
        credentials: "include",
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ message: t("chat.uploadError") }));
        throw new Error(err.message ?? t("chat.uploadPhotoError"));
      }

      await queryClient.invalidateQueries({ queryKey: [`/api/chat/conversations/${id}/messages`] });
    } catch (err: any) {
      Alert.alert("Errore", err?.message ?? "Impossibile inviare la foto.");
    } finally {
      setIsUploadingImage(false);
    }
  }, [id]);

  const handleSendPhoto = useCallback(() => {
    showImagePickerMenu((uri) => {
      uploadPhoto(uri);
    });
  }, [uploadPhoto]);

  const getTitle = (): string => {
    if (conversation?.title) return conversation.title;
    if (conversation?.conversationType === "motoclub") return "Clubs";
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
          <Ionicons name="chevron-back" size={28} color={Colors.text} />
        </TouchableOpacity>
        <View style={styles.topBarInfo}>
          <Text style={styles.topBarTitle} numberOfLines={1}>{getTitle()}</Text>
          {isMotoclub && conversation && (
            <Text style={styles.topBarSubtitle}>
              {conversation.participants.length} partecipanti
            </Text>
          )}
        </View>
        {isMotoclub && (
          <TouchableOpacity
            onPress={() => setShowMembersPanel(true)}
            style={styles.membersBtn}
            activeOpacity={0.7}
          >
            <Ionicons name="people-outline" size={20} color={Colors.textSecondary} />
          </TouchableOpacity>
        )}
        {isMotoclub && (
          <TouchableOpacity
            onPress={() => setShowHashtagPanel((v) => !v)}
            style={[styles.hashtagBtn, showHashtagPanel && styles.hashtagBtnActive]}
            activeOpacity={0.7}
          >
            <Text style={[styles.hashtagBtnText, showHashtagPanel && styles.hashtagBtnTextActive]}>#</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          onPress={handleDeleteConversation}
          style={styles.infoButton}
          activeOpacity={0.7}
        >
          <Ionicons name="trash-outline" size={22} color={Colors.error} />
        </TouchableOpacity>
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

      <Modal
        visible={showMembersPanel}
        animationType="slide"
        transparent
        onRequestClose={() => setShowMembersPanel(false)}
      >
        <View style={styles.membersOverlay}>
          <TouchableOpacity
            style={styles.membersBackdrop}
            activeOpacity={1}
            onPress={() => setShowMembersPanel(false)}
          />
          <View style={styles.membersSheet}>
            <View style={styles.membersHeader}>
              <Text style={styles.membersTitle}>Iscritti</Text>
              <TouchableOpacity onPress={() => setShowMembersPanel(false)} style={styles.membersCloseBtn}>
                <Ionicons name="close" size={22} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>
            <FlatList
              data={conversation?.participants ?? []}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <View style={styles.memberRow}>
                  <View style={styles.memberAvatar}>
                    <Text style={styles.memberAvatarText}>
                      {item.nickname.charAt(0).toUpperCase()}
                    </Text>
                  </View>
                  <View style={styles.memberInfo}>
                    <Text style={styles.memberNickname}>{item.nickname}</Text>
                    <Text style={styles.memberUserType}>{item.userType}</Text>
                  </View>
                  {item.id !== userId && <FavoriteStar targetUserId={item.id} size={14} />}
                </View>
              )}
              ItemSeparatorComponent={() => <View style={styles.memberSeparator} />}
              contentContainerStyle={styles.membersList}
              showsVerticalScrollIndicator={false}
            />
          </View>
        </View>
      </Modal>

      <View style={[styles.inputBar, { paddingBottom: Platform.OS === "web" ? 34 : Math.max(insets.bottom, 12) }]}>
        <TouchableOpacity onPress={handleSendLocation} style={styles.iconButton}>
          <Ionicons name="location-outline" size={24} color={Colors.accent} />
        </TouchableOpacity>
        <TouchableOpacity onPress={handleSendPhoto} style={styles.iconButton} disabled={isUploadingImage}>
          {isUploadingImage
            ? <ActivityIndicator size="small" color={Colors.accent} />
            : <Ionicons name="image-outline" size={24} color={Colors.accent} />
          }
        </TouchableOpacity>
        {isPrivateChat && (
          <TouchableOpacity
            onPress={handleSharePlaylist}
            style={styles.iconButton}
            disabled={sharePlaylistMutation.isPending}
          >
            <Ionicons
              name="musical-notes-outline"
              size={24}
              color={musicConnected ? Colors.accent : Colors.textSecondary}
            />
          </TouchableOpacity>
        )}
        <View style={styles.inputWrapper}>
          <TextInput
            ref={textInputRef}
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
  membersBtn: {
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
  membersOverlay: {
    flex: 1,
    justifyContent: "flex-end",
  },
  membersBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  membersSheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: "70%",
    paddingBottom: Platform.OS === "web" ? 34 : 0,
  },
  membersHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 18,
    paddingVertical: 16,
    borderBottomWidth: 0.5,
    borderBottomColor: Colors.border,
  },
  membersTitle: {
    fontSize: 17,
    fontFamily: "Inter_700Bold",
    color: Colors.text,
  },
  membersCloseBtn: {
    padding: 4,
  },
  membersList: {
    paddingVertical: 8,
  },
  memberRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 18,
    paddingVertical: 10,
    gap: 12,
  },
  memberAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.accent + "33",
    alignItems: "center",
    justifyContent: "center",
  },
  memberAvatarText: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
    color: Colors.accent,
  },
  memberInfo: {
    flex: 1,
  },
  memberNickname: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: Colors.text,
  },
  memberUserType: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
    marginTop: 2,
  },
  memberSeparator: {
    height: 0.5,
    backgroundColor: Colors.border,
    marginLeft: 70,
  },
  imageBubble: {
    padding: 3,
    overflow: "hidden",
  },
  chatImage: {
    width: 220,
    height: 160,
    borderRadius: 10,
  },
  fullscreenOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.92)",
    justifyContent: "center",
    alignItems: "center",
  },
  fullscreenImage: {
    width: "100%",
    height: "100%",
  },
});
