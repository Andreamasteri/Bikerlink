import React from "react";
import { View, Text, FlatList, TouchableOpacity, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import FavoriteStar from "@/components/FavoriteStar";
import { getUserTypeColor } from "./ChatListItem";

interface FriendItem {
  id: string;
  nickname: string;
  userType: string;
  gender: string | null;
}

interface FriendsSectionProps {
  friends: FriendItem[];
  userId: string;
  onFriendPress: (friend: FriendItem) => void;
  t: (key: string) => string;
}

export function FriendsSection({
  friends,
  userId,
  onFriendPress,
  t,
}: FriendsSectionProps) {
  if (!friends || friends.length === 0) return null;

  return (
    <View style={styles.friendsSection}>
      <Text style={styles.friendsSectionTitle}>{t("chat.friends")}</Text>
      <FlatList
        horizontal
        data={friends}
        keyExtractor={(item) => item.id}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.friendsListContent}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.friendItem}
            onPress={() => onFriendPress(item)}
            activeOpacity={0.7}
          >
            <View style={[styles.friendAvatar, { backgroundColor: getUserTypeColor(item.userType, item.gender) }]}>
              <Ionicons name="person" size={20} color="#fff" />
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 2 }}>
              <Text style={styles.friendNickname} numberOfLines={1}>{item.nickname}</Text>
              {item.id !== userId && <FavoriteStar targetUserId={item.id} size={12} />}
            </View>
          </TouchableOpacity>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  friendsSection: {
    paddingVertical: 12,
    borderBottomWidth: 0.5,
    borderBottomColor: "#ccc",
  },
  friendsSectionTitle: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: "#666",
    paddingHorizontal: 20,
    marginBottom: 10,
    textTransform: "uppercase",
  },
  friendsListContent: {
    paddingHorizontal: 16,
  },
  friendItem: {
    alignItems: "center",
    width: 80,
    marginHorizontal: 4,
  },
  friendAvatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 6,
  },
  friendNickname: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    color: "#333",
    textAlign: "center",
    maxWidth: 70,
  },
});
