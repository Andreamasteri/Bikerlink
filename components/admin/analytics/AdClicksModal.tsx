import React from "react";
import { View, Text, StyleSheet, TouchableOpacity, FlatList } from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import Colors from "@/constants/colors";

interface AdClickItem {
  id: string;
  userId: string;
  nickname: string;
  userType: string;
  adTitle: string;
  clickedAt: string;
}

interface AdClicksModalProps {
  clicks: AdClickItem[];
  onUserPress: (userId: string) => void;
  formatDate: (date: string) => string;
}

export const AdClicksModal: React.FC<AdClicksModalProps> = ({
  clicks,
  onUserPress,
  formatDate,
}) => {
  const bikerCount = clicks.filter((c) => c.userType === "biker").length;
  const zavorrinaCount = clicks.filter((c) => c.userType === "zavorrina").length;

  return (
    <View style={{ flex: 1 }}>
      <View style={styles.adSummary}>
        <Text style={styles.adSummaryText}>Totale click: {clicks.length}</Text>
        <Text style={styles.adSummaryText}>
          Biker: {bikerCount} | Zavorrina: {zavorrinaCount}
        </Text>
      </View>
      <FlatList
        data={clicks}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.modalList}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.listItem}
            onPress={() => onUserPress(item.userId)}
            activeOpacity={0.7}
          >
            <View style={{ flex: 1 }}>
              <Text style={styles.listItemTitle}>{item.nickname || "Anonimo"}</Text>
              <Text style={styles.listItemSub}>
                {item.userType} - {item.adTitle || "N/A"}
              </Text>
              <Text style={styles.listItemDate}>{formatDate(item.clickedAt)}</Text>
            </View>
            <MaterialIcons name="chevron-right" size={20} color={Colors.textSecondary} />
          </TouchableOpacity>
        )}
        ListEmptyComponent={<Text style={styles.emptyText}>Nessun click registrato</Text>}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  adSummary: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  adSummaryText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
    color: Colors.text,
    marginBottom: 4,
  },
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
