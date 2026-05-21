import React from "react";
import { View, Text, StyleSheet, FlatList } from "react-native";
import Colors from "@/constants/colors";

interface PendingReportItem {
  id: string;
  type: string;
  title: string;
  description: string;
  submittedBy: string;
  createdAt: string;
}

interface PendingReportsModalProps {
  reports: PendingReportItem[];
  formatDate: (date: string) => string;
}

export const PendingReportsModal: React.FC<PendingReportsModalProps> = ({
  reports,
  formatDate,
}) => {
  return (
    <FlatList
      data={reports}
      keyExtractor={(item) => item.id}
      contentContainerStyle={styles.modalList}
      renderItem={({ item }) => (
        <View style={styles.listItem}>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 }}>
              <View
                style={[
                  styles.typeBadge,
                  {
                    backgroundColor: item.type === "bug" ? Colors.error + "22" : Colors.accent + "22",
                  },
                ]}
              >
                <Text
                  style={[
                    styles.typeBadgeText,
                    { color: item.type === "bug" ? Colors.error : Colors.accent },
                  ]}
                >
                  {item.type === "bug" ? "Bug" : "Feature"}
                </Text>
              </View>
              <Text style={styles.listItemTitle} numberOfLines={1}>
                {item.title}
              </Text>
            </View>
            <Text style={styles.listItemSub} numberOfLines={2}>
              {item.description}
            </Text>
            <Text style={styles.listItemDate}>
              Da: {item.submittedBy || "Anonimo"} - {formatDate(item.createdAt)}
            </Text>
          </View>
        </View>
      )}
      ListEmptyComponent={<Text style={styles.emptyText}>Nessuna segnalazione pendente</Text>}
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
  typeBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  typeBadgeText: { fontFamily: "Inter_500Medium", fontSize: 10 },
  emptyText: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: "center",
    marginTop: 40,
  },
});
