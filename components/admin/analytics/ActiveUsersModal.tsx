import React from "react";
import { View, Text, StyleSheet, TouchableOpacity, FlatList } from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import Colors from "@/constants/colors";

interface ActiveUserItem {
  id: string;
  nickname: string;
  userType: string;
  lastLoginAt: string;
}

interface ActiveUsersModalProps {
  users: ActiveUserItem[];
  onUserPress: (userId: string) => void;
  formatDate: (date: string | null) => string;
}

export const ActiveUsersModal: React.FC<ActiveUsersModalProps> = ({
  users,
  onUserPress,
  formatDate,
}) => {
  return (
    <FlatList
      data={users}
      keyExtractor={(item) => item.id}
      contentContainerStyle={styles.modalList}
      renderItem={({ item }) => (
        <TouchableOpacity
          style={styles.listItem}
          onPress={() => onUserPress(item.id)}
          activeOpacity={0.7}
        >
          <View style={{ flex: 1 }}>
            <Text style={styles.listItemTitle}>{item.nickname}</Text>
            <Text style={styles.listItemSub}>{item.userType}</Text>
            <Text style={styles.listItemDate}>
              Ultimo accesso: {formatDate(item.lastLoginAt)}
            </Text>
          </View>
          <MaterialIcons name="chevron-right" size={20} color={Colors.textSecondary} />
        </TouchableOpacity>
      )}
      ListEmptyComponent={<Text style={styles.emptyText}>Nessun utente attivo</Text>}
    />
  );
};

const styles = StyleSheet.create({
  modalList: { paddingHorizontal: 16, paddingVertical: 8 },
  listItem: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  listItemTitle: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: Colors.text },
  listItemSub: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  listItemDate: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    color: Colors.textSecondary,
    marginTop: 4,
  },
  emptyText: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: "center",
    marginTop: 40,
  },
});
