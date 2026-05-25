import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  Pressable,
  Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import Colors from "@/constants/colors";
import { getCurrentLocale } from "@/lib/i18n";
import { getApiUrl } from "@/lib/query-client";
import { MediaMessageModal } from "./MediaMessageModal";

export interface MessageSender {
  id: string;
  nickname: string;
  avatarUrl: string | null;
  userType: string;
  sex?: string | null;
}

export interface ChatMessage {
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

function TextWithHashtags({
  text,
  isOwn,
  style,
}: {
  text: string;
  isOwn: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- StyleSheet style from parent
  style: any;
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
  } catch {
    // no-op: fallback if message content is not valid JSON
  }

  const iconColor = isOwn ? "#fff" : MUSIC_ACCENT;
  const textColor = isOwn ? "#fff" : Colors.text;

  const handlePress = () => {
    if (isOwn || !playlistId) return;
    router.push({ pathname: "/(tabs)/music", params: { tab: "brani", playlistId: String(playlistId) } } as never);
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
      <MediaMessageModal visible={fullscreen} imageUri={imageUri} onClose={() => setFullscreen(false)} />
    </>
  );
}

export function MessageBubble({
  message,
  isOwn,
  onDelete,
}: {
  message: ChatMessage;
  isOwn: boolean;
  onDelete?: (messageId: string) => void;
}) {
  const hasHashtag =
    message.messageType === "text" &&
    message.content &&
    /#[a-zA-Z0-9_àèéìíîòóùúÀÈÉÌÍÎÒÓÙÚ]+/.test(message.content);

  const handleLongPress = () => {
    if (!isOwn || !onDelete) return;
    Alert.alert("Messaggio", "Vuoi eliminare questo messaggio?", [
      { text: "Annulla", style: "cancel" },
      {
        text: "Elimina",
        style: "destructive",
        onPress: () => onDelete(message.id),
      },
    ]);
  };

  return (
    <Pressable
      onLongPress={handleLongPress}
      delayLongPress={400}
      style={[styles.bubbleContainer, isOwn ? styles.bubbleRight : styles.bubbleLeft]}
    >
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
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bubbleContainer: {
    maxWidth: "85%",
    marginVertical: 4,
    paddingHorizontal: 12,
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
    marginBottom: 4,
    marginLeft: 4,
  },
  bubble: {
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 8,
    minWidth: 60,
  },
  ownBubble: {
    backgroundColor: Colors.accent,
    borderBottomRightRadius: 4,
  },
  otherBubble: {
    backgroundColor: Colors.surfaceLight,
    borderBottomLeftRadius: 4,
  },
  imageBubble: {
    padding: 3,
    overflow: "hidden",
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
  timeStamp: {
    fontSize: 10,
    marginTop: 2,
    fontFamily: "Inter_400Regular",
    alignSelf: "flex-end",
  },
  ownTimeStamp: {
    color: "rgba(255,255,255,0.7)",
  },
  otherTimeStamp: {
    color: Colors.textSecondary,
  },
  locationContent: {
    flexDirection: "row",
    alignItems: "center",
  },
  chatImage: {
    width: 220,
    height: 160,
    borderRadius: 10,
  },
});
