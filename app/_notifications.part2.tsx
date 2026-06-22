/* eslint-disable @typescript-eslint/no-explicit-any */
import React from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { styles } from "@/components/notifications/notifications-styles";

interface AppNotification {
  id: string;
  title: string;
  body: string | null;
  notificationType: string;
  referenceType: string | null;
  referenceId: string | null;
  isRead: boolean;
  createdAt: string;
}

function timeAgo(dateStr: string): string {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (diff < 60) return "Adesso";
  if (diff < 3600) return `${Math.floor(diff / 60)} min fa`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} ore fa`;
  if (diff < 604800) return `${Math.floor(diff / 86400)} giorni fa`;
  return new Date(dateStr).toLocaleDateString("it-IT");
}

function getNotifIcon(type: string): { name: React.ComponentProps<typeof Ionicons>["name"]; color: string } {
  switch (type) {
    case "direct_match_request":
      return { name: "person-add", color: "#FF6600" };
    case "direct_match_accepted":
      return { name: "checkmark-circle", color: "#34C759" };
    case "match":
      return { name: "bicycle", color: "#FF6600" };
    case "proposal_match":
      return { name: "map", color: "#4A90E2" };
    case "sos":
      return { name: "warning", color: "#E63946" };
    case "chat":
      return { name: "chatbubble", color: "#34C759" };
    case "motoclub":
    case "motoclub_invite":
    case "motoclub_join":
      return { name: "people", color: "#AF52DE" };
    case "event_approved":
    case "event_invite":
      return { name: "calendar", color: "#4A90E2" };
    case "planned_route_invite":
      return { name: "map", color: "#FF6600" };
    default:
      return { name: "notifications", color: "#FF6600" };
  }
}

export function NotificationItem({
  item,
  onPress,
  onDelete,
  isDeleting,
  colors,
}: {
  item: AppNotification;
  onPress: () => void;
  onDelete: () => void;
  isDeleting: boolean;
  colors: any;
}) {
  const icon = getNotifIcon(item.notificationType);
  return (
    <TouchableOpacity
      style={[
        styles.item,
        {
          backgroundColor: item.isRead ? colors.surface : (colors.background ?? colors.surface),
          borderBottomColor: colors.border,
        },
        !item.isRead && { borderLeftWidth: 3, borderLeftColor: colors.accent },
      ]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={[styles.iconWrap, { backgroundColor: icon.color + "22" }]}>
        <Ionicons name={icon.name} size={20} color={icon.color} />
      </View>
      <View style={styles.textWrap}>
        <Text style={[styles.title, { color: colors.text }, !item.isRead && { fontWeight: "700" }]} numberOfLines={2}>
          {item.title}
        </Text>
        {!!item.body && (
          <Text style={[styles.body, { color: colors.textSecondary ?? colors.text }]} numberOfLines={2}>
            {item.body}
          </Text>
        )}
        <Text style={[styles.time, { color: colors.textSecondary ?? colors.text }]}>
          {timeAgo(item.createdAt)}
        </Text>
      </View>
      {!item.isRead && (
        <View style={[styles.unreadDot, { backgroundColor: colors.accent }]} />
      )}
      <TouchableOpacity
        onPress={onDelete}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        disabled={isDeleting}
        style={styles.deleteBtn}
      >
        <Ionicons
          name="trash-outline"
          size={18}
          color={isDeleting ? (colors.textSecondary ?? "#999") : "#E63946"}
        />
      </TouchableOpacity>
    </TouchableOpacity>
  );
}
