import React, { useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
} from "react-native";
import { Stack } from "expo-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { apiRequest } from "@/lib/query-client";

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

function getNotifIcon(type: string): { name: React.ComponentProps<typeof Ionicons>["name"]; color: string } {
  switch (type) {
    case "match_request":
    case "match_accepted":
      return { name: "bicycle", color: "#FF6600" };
    case "proposal":
    case "proposal_joined":
      return { name: "map", color: "#4A90E2" };
    case "sos":
      return { name: "warning", color: "#E63946" };
    case "chat":
      return { name: "chatbubble", color: "#34C759" };
    case "motoclub":
      return { name: "people", color: "#AF52DE" };
    default:
      return { name: "notifications", color: "#FF6600" };
  }
}

function timeAgo(dateStr: string): string {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (diff < 60) return "Adesso";
  if (diff < 3600) return `${Math.floor(diff / 60)} min fa`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} ore fa`;
  if (diff < 604800) return `${Math.floor(diff / 86400)} giorni fa`;
  return new Date(dateStr).toLocaleDateString("it-IT");
}

export default function NotificationsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();

  const { data: notifications = [], isLoading } = useQuery<AppNotification[]>({
    queryKey: ["/api/notifications"],
  });

  const markReadMutation = useMutation({
    mutationFn: (id: string) => apiRequest("PUT", `/api/notifications/${id}/read`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/notifications"] });
    },
  });

  const markAllRead = useCallback(async () => {
    const unread = notifications.filter((n) => !n.isRead);
    for (const n of unread) {
      await apiRequest("PUT", `/api/notifications/${n.id}/read`, {});
    }
    qc.invalidateQueries({ queryKey: ["/api/notifications"] });
  }, [notifications, qc]);

  const handleItemPress = useCallback((item: AppNotification) => {
    if (!item.isRead) {
      markReadMutation.mutate(item.id);
    }
  }, [markReadMutation]);

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  const renderItem = ({ item }: { item: AppNotification }) => {
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
        onPress={() => handleItemPress(item)}
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
      </TouchableOpacity>
    );
  };

  const topPad = Platform.OS === "web" ? 67 : insets.top;

  return (
    <View style={[styles.container, { backgroundColor: colors.background ?? colors.surface, paddingTop: topPad }]}>
      <Stack.Screen
        options={{
          headerShown: true,
          headerTitle: "Notifiche",
          headerStyle: { backgroundColor: colors.surface },
          headerTintColor: colors.text,
          headerRight: unreadCount > 0
            ? () => (
                <TouchableOpacity onPress={markAllRead} style={styles.headerBtn}>
                  <Text style={{ color: colors.accent, fontSize: 13, fontWeight: "600" }}>
                    Segna tutte lette
                  </Text>
                </TouchableOpacity>
              )
            : undefined,
        }}
      />

      {isLoading ? (
        <ActivityIndicator color={colors.accent} style={{ marginTop: 40 }} />
      ) : notifications.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="notifications-off-outline" size={56} color={colors.textSecondary ?? colors.text} />
          <Text style={[styles.emptyText, { color: colors.textSecondary ?? colors.text }]}>
            Nessuna notifica
          </Text>
        </View>
      ) : (
        <FlatList
          data={notifications}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={{ paddingBottom: insets.bottom + 16 }}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  item: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  textWrap: {
    flex: 1,
    gap: 2,
  },
  title: {
    fontSize: 14,
    fontWeight: "500",
  },
  body: {
    fontSize: 13,
  },
  time: {
    fontSize: 12,
    marginTop: 2,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    flexShrink: 0,
  },
  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  emptyText: {
    fontSize: 16,
  },
  headerBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
});
