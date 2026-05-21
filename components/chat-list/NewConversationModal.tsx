import React from "react";
import {
  View,
  Text,
  Modal,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  KeyboardAvoidingView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import FavoriteStar from "@/components/FavoriteStar";
import { getUserTypeColor } from "./ChatListItem";

interface UserSearchResult {
  id: string;
  nickname: string;
  avatarUrl: string | null;
  userType: string;
  sex?: string | null;
  distance?: number | null;
}

interface NewConversationModalProps {
  visible: boolean;
  onClose: () => void;
  insets: { top: number };
  searchQuery: string;
  onSearchQueryChange: (text: string) => void;
  sortOrder: "alpha" | "distance";
  onSortOrderChange: (order: "alpha" | "distance") => void;
  users: UserSearchResult[];
  onUserPress: (userId: string) => void;
  isPending: boolean;
  userId: string;
  t: (key: string) => string;
}

export function NewConversationModal({
  visible,
  onClose,
  insets,
  searchQuery,
  onSearchQueryChange,
  sortOrder,
  onSortOrderChange,
  users,
  onUserPress,
  isPending,
  userId,
  t,
}: NewConversationModalProps) {
  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { paddingTop: insets.top + 12 }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Nuova conversazione</Text>
              <TouchableOpacity onPress={onClose}>
                <Ionicons name="close" size={28} color={Colors.text} />
              </TouchableOpacity>
            </View>

            <View style={styles.searchWrapper}>
              <Ionicons name="search" size={18} color={Colors.textSecondary} />
              <TextInput
                style={styles.searchInput}
                placeholder={t("chat.searchUser")}
                placeholderTextColor={Colors.textSecondary}
                value={searchQuery}
                onChangeText={onSearchQueryChange}
                autoFocus
              />
            </View>

            <View style={styles.sortRow}>
              <TouchableOpacity
                style={[styles.sortOption, sortOrder === "alpha" && styles.sortOptionActive]}
                onPress={() => onSortOrderChange("alpha")}
              >
                <Text style={[styles.sortOptionText, sortOrder === "alpha" && styles.sortOptionTextActive]}>A–Z</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.sortOption, sortOrder === "distance" && styles.sortOptionActive]}
                onPress={() => onSortOrderChange("distance")}
              >
                <Ionicons name="location-outline" size={14} color={sortOrder === "distance" ? Colors.background : Colors.textSecondary} style={{ marginRight: 4 }} />
                <Text style={[styles.sortOptionText, sortOrder === "distance" && styles.sortOptionTextActive]}>Distanza</Text>
              </TouchableOpacity>
            </View>

            <FlatList
              data={users}
              keyExtractor={(item) => item.id}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.userListContent}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.userRow}
                  onPress={() => onUserPress(item.id)}
                  disabled={isPending}
                >
                  <View style={[styles.userAvatar, { backgroundColor: getUserTypeColor(item.userType, item.sex) }]}>
                    <Ionicons name="person" size={18} color="#fff" />
                  </View>
                  <Text style={styles.userNickname}>{item.nickname}</Text>
                  {item.id !== userId && <FavoriteStar targetUserId={item.id} size={14} />}
                  {sortOrder === "distance" && (
                    <Text style={styles.userDistance}>
                      {item.distance != null ? `${item.distance} km` : "–"}
                    </Text>
                  )}
                  <Ionicons name="chatbubble-outline" size={20} color={Colors.accent} />
                </TouchableOpacity>
              )}
              ListEmptyComponent={
                searchQuery.length > 0 ? (
                  <Text style={styles.noUsersText}>{t("chat.noUserFound")}</Text>
                ) : null
              }
            />
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
  },
  modalContent: {
    flex: 1,
    backgroundColor: Colors.background,
    paddingHorizontal: 20,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 22,
    fontFamily: "Inter_700Bold",
    color: Colors.text,
  },
  searchWrapper: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.surface,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 16,
  },
  searchInput: {
    flex: 1,
    marginLeft: 10,
    fontSize: 16,
    fontFamily: "Inter_400Regular",
    color: Colors.text,
  },
  sortRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 12,
  },
  sortOption: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  sortOptionActive: {
    backgroundColor: Colors.accent,
    borderColor: Colors.accent,
  },
  sortOptionText: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    color: Colors.textSecondary,
  },
  sortOptionTextActive: {
    color: Colors.background,
  },
  userListContent: {
    paddingBottom: 40,
  },
  userRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 0.5,
    borderBottomColor: Colors.border,
  },
  userAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  userNickname: {
    flex: 1,
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    color: Colors.text,
    marginRight: 8,
  },
  userDistance: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
    marginRight: 12,
  },
  noUsersText: {
    textAlign: "center",
    marginTop: 20,
    color: Colors.textSecondary,
    fontFamily: "Inter_400Regular",
  },
});
