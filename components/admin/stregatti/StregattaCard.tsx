import React from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";

interface FakeUser {
  id: string;
  nickname: string;
  userType: string;
  sex: string;
  region: string;
  birthYear: number;
  isFake: boolean;
  lastLoginAt: string | null;
  profile: { isAvailable: boolean } | null;
  profileViews: number;
  chatRequests: number;
  chatMessages: number;
}

interface StregattaCardProps {
  user: FakeUser;
  onToggleAvailable: (id: string) => void;
  onToggleOnline: (id: string) => void;
  onDelete: (id: string, nickname: string) => void;
  onOpenChat: (id: string) => void;
  isTogglingAvailable: boolean;
  isTogglingOnline: boolean;
  isDeleting: boolean;
}

export function StregattaCard({
  user,
  onToggleAvailable,
  onToggleOnline,
  onDelete,
  onOpenChat,
  isTogglingAvailable,
  isTogglingOnline,
  isDeleting: _isDeleting,
}: StregattaCardProps) {
  const isAvailable = user.profile?.isAvailable ?? false;
  const isOnline = user.lastLoginAt ? (new Date().getTime() - new Date(user.lastLoginAt).getTime() < 5 * 60 * 1000) : false;

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View>
          <Text style={styles.nickname}>{user.nickname}</Text>
          <Text style={styles.userDetails}>
            {user.userType} • {user.sex} • {user.region} • {user.birthYear}
          </Text>
        </View>
        <View style={styles.cardActions}>
          <TouchableOpacity
            style={[styles.iconBtn, styles.chatBtn]}
            onPress={() => onOpenChat(user.id)}
          >
            <Ionicons name="chatbubbles" size={20} color={Colors.accent} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.iconBtn, styles.deleteBtn]}
            onPress={() => onDelete(user.id, user.nickname)}
          >
            <Ionicons name="trash" size={20} color={Colors.error} />
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.statsRow}>
        <View style={styles.stat}>
          <Text style={styles.statVal}>{user.profileViews}</Text>
          <Text style={styles.statLabel}>Viste</Text>
        </View>
        <View style={styles.stat}>
          <Text style={styles.statVal}>{user.chatRequests}</Text>
          <Text style={styles.statLabel}>Req.</Text>
        </View>
        <View style={styles.stat}>
          <Text style={styles.statVal}>{user.chatMessages}</Text>
          <Text style={styles.statLabel}>Msg.</Text>
        </View>
      </View>

      <View style={styles.toggleRow}>
        <TouchableOpacity
          style={[styles.toggleBtn, isAvailable && styles.toggleBtnActive]}
          onPress={() => onToggleAvailable(user.id)}
          disabled={isTogglingAvailable}
        >
          {isTogglingAvailable ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <>
              <Ionicons name={isAvailable ? "eye" : "eye-off"} size={16} color="#fff" />
              <Text style={styles.toggleBtnText}>{isAvailable ? "Visibile" : "Nascosto"}</Text>
            </>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.toggleBtn, isOnline && styles.toggleBtnActiveOnline]}
          onPress={() => onToggleOnline(user.id)}
          disabled={isTogglingOnline}
        >
          {isTogglingOnline ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <>
              <View style={[styles.onlineDot, isOnline && styles.onlineDotActive]} />
              <Text style={styles.toggleBtnText}>{isOnline ? "Online" : "Offline"}</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  nickname: {
    fontFamily: "Inter_700Bold",
    fontSize: 16,
    color: Colors.text,
  },
  userDetails: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  cardActions: {
    flexDirection: "row",
    gap: 8,
  },
  iconBtn: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: Colors.background,
  },
  chatBtn: {
    borderColor: Colors.accent,
    borderWidth: 1,
  },
  deleteBtn: {
    borderColor: Colors.error,
    borderWidth: 1,
  },
  statsRow: {
    flexDirection: "row",
    marginVertical: 12,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: Colors.border,
  },
  stat: {
    flex: 1,
    alignItems: "center",
  },
  statVal: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
    color: Colors.text,
  },
  statLabel: {
    fontFamily: "Inter_400Regular",
    fontSize: 10,
    color: Colors.textSecondary,
  },
  toggleRow: {
    flexDirection: "row",
    gap: 8,
  },
  toggleBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: Colors.border,
  },
  toggleBtnActive: {
    backgroundColor: Colors.accent,
  },
  toggleBtnActiveOnline: {
    backgroundColor: "#4caf50",
  },
  toggleBtnText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
    color: "#fff",
  },
  onlineDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#ccc",
  },
  onlineDotActive: {
    backgroundColor: "#fff",
  },
});
