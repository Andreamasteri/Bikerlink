import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/colors";

interface ChatHeaderProps {
  title: string;
  isMotoclub: boolean;
  participantCount?: number;
  onlineCount?: number;
  isPrivateChat: boolean;
  otherParticipantId?: string;
  onShowMembers?: () => void;
  onToggleHashtags?: () => void;
  onDeleteConversation: () => void;
  showHashtagPanel?: boolean;
}

export function ChatHeader({
  title,
  isMotoclub,
  participantCount,
  onlineCount,
  isPrivateChat,
  otherParticipantId,
  onShowMembers,
  onToggleHashtags,
  onDeleteConversation,
  showHashtagPanel,
}: ChatHeaderProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const buildSubtitle = (): string | null => {
    if (!isMotoclub) return null;
    const parts: string[] = [];
    if (participantCount !== undefined) parts.push(`${participantCount} partecipanti`);
    if (onlineCount !== undefined && onlineCount > 0) parts.push(`${onlineCount} online`);
    return parts.length > 0 ? parts.join(" · ") : null;
  };

  const subtitle = buildSubtitle();

  return (
    <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
      <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
        <Ionicons name="chevron-back" size={28} color={Colors.text} />
      </TouchableOpacity>
      <View style={styles.topBarInfo}>
        <Text style={styles.topBarTitle} numberOfLines={1}>{title}</Text>
        {subtitle !== null && (
          <View style={styles.subtitleRow}>
            {onlineCount !== undefined && onlineCount > 0 && (
              <View style={styles.onlineDot} />
            )}
            <Text style={styles.topBarSubtitle}>{subtitle}</Text>
          </View>
        )}
      </View>
      {isMotoclub && (
        <TouchableOpacity
          onPress={onShowMembers}
          style={styles.membersBtn}
          activeOpacity={0.7}
        >
          <Ionicons name="people-outline" size={20} color={Colors.textSecondary} />
        </TouchableOpacity>
      )}
      {isMotoclub && (
        <TouchableOpacity
          onPress={onToggleHashtags}
          style={[styles.hashtagBtn, showHashtagPanel && styles.hashtagBtnActive]}
          activeOpacity={0.7}
        >
          <Text style={[styles.hashtagBtnText, showHashtagPanel && styles.hashtagBtnTextActive]}>#</Text>
        </TouchableOpacity>
      )}
      {!isMotoclub && (
        <TouchableOpacity
          onPress={onDeleteConversation}
          style={styles.infoButton}
          activeOpacity={0.7}
        >
          <Ionicons name="trash-outline" size={22} color={Colors.error} />
        </TouchableOpacity>
      )}
      {isPrivateChat && otherParticipantId && (
        <TouchableOpacity onPress={() => router.push(`/profile/${otherParticipantId}` as never)} style={styles.infoButton}>
          <Ionicons name="information-circle-outline" size={26} color={Colors.text} />
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingBottom: 12,
    backgroundColor: Colors.surface,
    borderBottomWidth: 0.5,
    borderBottomColor: Colors.border,
  },
  backButton: {
    padding: 4,
  },
  topBarInfo: {
    flex: 1,
    marginLeft: 8,
  },
  topBarTitle: {
    fontSize: 17,
    fontFamily: "Inter_700Bold",
    color: Colors.text,
  },
  subtitleRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 1,
    gap: 5,
  },
  onlineDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: Colors.success,
  },
  topBarSubtitle: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
  },
  infoButton: {
    padding: 8,
    marginLeft: 4,
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
  },
  hashtagBtnTextActive: {
    color: "#fff",
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
});
