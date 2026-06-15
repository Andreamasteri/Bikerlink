import React from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Pressable,
  FlatList,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";

interface Member {
  id: string;
  nickname: string;
  avatarUrl: string | null;
  userType: string;
}

interface ChatMembersModalProps {
  visible: boolean;
  onClose: () => void;
  members: Member[];
  onlineUserIds?: Set<string>;
}

export function ChatMembersModal({ visible, onClose, members, onlineUserIds }: ChatMembersModalProps) {
  const onlineCount = onlineUserIds ? members.filter((m) => onlineUserIds.has(m.id)).length : 0;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.membersOverlay}>
        <Pressable style={styles.membersBackdrop} onPress={onClose} />
        <View style={styles.membersSheet}>
          <View style={styles.membersHeader}>
            <View style={styles.membersTitleRow}>
              <Text style={styles.membersTitle}>{members.length} Partecipanti</Text>
              {onlineCount > 0 && (
                <View style={styles.onlineBadge}>
                  <View style={styles.onlineBadgeDot} />
                  <Text style={styles.onlineBadgeText}>{onlineCount} online</Text>
                </View>
              )}
            </View>
            <TouchableOpacity onPress={onClose} style={styles.membersCloseBtn}>
              <Ionicons name="close" size={24} color={Colors.text} />
            </TouchableOpacity>
          </View>
          <FlatList
            data={members}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.membersList}
            renderItem={({ item }) => {
              const isOnline = onlineUserIds?.has(item.id) ?? false;
              return (
                <View style={styles.memberRow}>
                  <View style={styles.memberAvatarWrapper}>
                    <View style={styles.memberAvatar}>
                      <Text style={styles.memberAvatarText}>
                        {item.nickname?.charAt(0).toUpperCase()}
                      </Text>
                    </View>
                    {isOnline && <View style={styles.presenceDot} />}
                  </View>
                  <View style={styles.memberInfo}>
                    <Text style={styles.memberNickname}>{item.nickname}</Text>
                    <Text style={[styles.memberUserType, isOnline && styles.memberUserTypeOnline]}>
                      {isOnline ? "online" : item.userType}
                    </Text>
                  </View>
                </View>
              );
            }}
            ItemSeparatorComponent={() => <View style={styles.memberSeparator} />}
          />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  membersOverlay: {
    flex: 1,
    justifyContent: "flex-end",
  },
  membersBackdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  membersSheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: "70%",
    paddingBottom: 20,
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
  membersTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  membersTitle: {
    fontSize: 17,
    fontFamily: "Inter_700Bold",
    color: Colors.text,
  },
  onlineBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.success + "22",
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
    gap: 5,
  },
  onlineBadgeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.success,
  },
  onlineBadgeText: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    color: Colors.success,
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
  memberAvatarWrapper: {
    position: "relative",
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
  presenceDot: {
    position: "absolute",
    bottom: 1,
    right: 1,
    width: 11,
    height: 11,
    borderRadius: 6,
    backgroundColor: Colors.success,
    borderWidth: 2,
    borderColor: Colors.surface,
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
  memberUserTypeOnline: {
    color: Colors.success,
    fontFamily: "Inter_600SemiBold",
  },
  memberSeparator: {
    height: 0.5,
    backgroundColor: Colors.border,
    marginLeft: 70,
  },
});
