import React from "react";
import { Text, StyleSheet, TouchableOpacity, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";

interface ClubActionsProps {
  isMember: boolean;
  isJoining: boolean;
  onJoin: () => void;
  onOpenChat: () => void;
  hasChat: boolean;
}

export const ClubActions: React.FC<ClubActionsProps> = ({
  isMember,
  isJoining,
  onJoin,
  onOpenChat,
  hasChat,
}) => {
  if (!isMember) {
    return (
      <TouchableOpacity
        style={[styles.joinBtn, isJoining && { opacity: 0.6 }]}
        onPress={onJoin}
        disabled={isJoining}
        activeOpacity={0.8}
      >
        {isJoining ? (
          <ActivityIndicator color="#fff" size="small" />
        ) : (
          <>
            <Ionicons name="person-add" size={18} color="#fff" />
            <Text style={styles.joinBtnText}>Entra nel club</Text>
          </>
        )}
      </TouchableOpacity>
    );
  }

  if (hasChat) {
    return (
      <TouchableOpacity style={styles.chatBtn} onPress={onOpenChat}>
        <Ionicons name="chatbubbles" size={20} color="#fff" />
        <Text style={styles.chatBtnText}>Apri chat del club</Text>
      </TouchableOpacity>
    );
  }

  return null;
};

const styles = StyleSheet.create({
  joinBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: Colors.accent,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 32,
    minWidth: 200,
  },
  joinBtnText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 16,
    color: "#fff",
  },
  chatBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: Colors.accent,
    borderRadius: 14,
    paddingVertical: 16,
    marginTop: 4,
    marginBottom: 8,
  },
  chatBtnText: { fontFamily: "Inter_700Bold", fontSize: 16, color: "#fff" },
});
