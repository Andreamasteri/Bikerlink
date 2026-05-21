import React from "react";
import { View, Text, TouchableOpacity, StyleSheet, Alert } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import FavoriteStar from "@/components/FavoriteStar";
import { getCurrentLocale } from "@/lib/i18n";

export interface ConversationItem {
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
    sex?: string | null;
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

export function getConversationTitle(conv: ConversationItem, userId: string, t: (key: string) => string): string {
  if (conv.title) return conv.title;
  if (conv.conversationType === "motoclub") return conv.title ?? "Clubs";
  if (conv.conversationType === "contact") {
    const others = conv.participants.filter((p) => p.id !== userId);
    if (others.length === 0) return t("chat.contactChat");
    if (others.length === 1) return `Contatto - ${others[0].nickname}`;
    return `Contatto (${conv.participants.length})`;
  }
  if (conv.conversationType === "group") return t("chat.group");
  const other = conv.participants.find((p) => p.id !== userId);
  return other?.nickname ?? t("chat.private");
}

export function getLastMessagePreview(msg: ConversationItem["lastMessage"]): string {
  if (!msg) return "";
  if (msg.messageType === "image") return "Foto";
  if (msg.messageType === "location") return "Posizione";
  return msg.content || "";
}

export function formatTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const dayMs = 86400000;

  const loc = getCurrentLocale();
  if (diff < dayMs) {
    return date.toLocaleTimeString(loc, { hour: "2-digit", minute: "2-digit" });
  }
  if (diff < 7 * dayMs) {
    return date.toLocaleDateString(loc, { weekday: "short" });
  }
  return date.toLocaleDateString(loc, { day: "2-digit", month: "2-digit" });
}

export function getUserTypeColor(userType: string, sex?: string | null): string {
  if (userType === "coppia") return Colors.coupleIcon;
  if (sex === "F") return Colors.femaleIcon;
  if (sex === "M") return Colors.maleIcon;
  if (userType.startsWith("zavorrina")) return Colors.femaleIcon;
  if (userType.startsWith("biker")) return Colors.maleIcon;
  return Colors.textSecondary;
}

export function getConversationIcon(conv: ConversationItem): { name: keyof typeof Ionicons.glyphMap; bg: string } {
  if (conv.conversationType === "motoclub") return { name: "shield", bg: Colors.accent };
  if (conv.conversationType === "contact") return { name: "people-circle", bg: Colors.success };
  if (conv.conversationType === "group") return { name: "people", bg: Colors.accent };
  return { name: "person", bg: Colors.maleIcon };
}

export function ChatListItem({ item, userId, onPress, onDelete, t }: { item: ConversationItem; userId: string; onPress: () => void; onDelete: (id: string) => void; t: (key: string) => string }) {
  const title = getConversationTitle(item, userId, t);
  const preview = getLastMessagePreview(item.lastMessage);
  const time = item.lastMessage ? formatTime(item.lastMessage.createdAt) : "";
  const other = item.participants.find((p) => p.id !== userId);
  const icon = getConversationIcon(item);
  const avatarBg = item.conversationType === "private" ? getUserTypeColor(other?.userType || "biker", other?.sex) : icon.bg;

  const handleLongPress = () => {
    Alert.alert(
      t("chat.deleteTitle"),
      t("chat.deleteConversationMsg").replace("{name}", title),
      [
        { text: t("common.cancel"), style: "cancel" },
        { text: t("common.delete"), style: "destructive", onPress: () => onDelete(item.id) },
      ]
    );
  };

  return (
    <TouchableOpacity style={styles.conversationRow} onPress={onPress} activeOpacity={0.7}>
      <View style={[styles.avatar, { backgroundColor: avatarBg }]}>
        <Ionicons
          name={icon.name}
          size={22}
          color="#fff"
        />
      </View>
      <View style={styles.conversationInfo}>
        <View style={styles.conversationHeader}>
          <Text style={[styles.conversationTitle, item.unreadCount > 0 && styles.unreadTitle]} numberOfLines={1}>
            {title}
          </Text>
          {item.conversationType === "private" && other && other.id !== userId && (
            <FavoriteStar targetUserId={other.id} size={14} />
          )}
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
      <TouchableOpacity
        onPress={handleLongPress}
        style={styles.deleteButton}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Ionicons name="trash-outline" size={18} color={Colors.textSecondary} />
      </TouchableOpacity>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
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
    color: Colors.text,
    flex: 1,
    marginRight: 8,
  },
  unreadTitle: {
    fontFamily: "Inter_700Bold",
  },
  timeText: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
  },
  conversationFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  previewText: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
    flex: 1,
    marginRight: 8,
  },
  unreadPreview: {
    color: Colors.textSecondary,
    fontFamily: "Inter_500Medium",
  },
  unreadBadge: {
    backgroundColor: Colors.accent,
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
    color: Colors.background,
  },
  deleteButton: {
    padding: 6,
    marginLeft: 8,
  },
});
