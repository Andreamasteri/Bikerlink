import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { Ionicons, MaterialIcons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { useT } from "@/lib/language-context";

interface AdminClubActionsProps {
  onDelete: () => void;
  onSimulateActivity: () => void;
  isDeleting: boolean;
}

export const AdminClubActions: React.FC<AdminClubActionsProps> = ({
  onDelete,
  onSimulateActivity,
  isDeleting,
}) => {
  const t = useT();

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={styles.simulateBtn}
        onPress={onSimulateActivity}
      >
        <Ionicons name="chatbubbles-outline" size={18} color={Colors.accent} />
        <Text style={styles.simulateBtnText}>{t("admin.simulateChatActivity")}</Text>
      </TouchableOpacity>

      <View style={styles.dangerZone}>
        <Text style={styles.dangerTitle}>Zona pericolosa</Text>
        <TouchableOpacity
          style={styles.deleteBtn}
          onPress={onDelete}
          disabled={isDeleting}
        >
          <MaterialIcons name="delete-forever" size={20} color="#fff" />
          <Text style={styles.deleteBtnText}>
            {isDeleting ? t("admin.deleteClubPending") : t("admin.deleteClubBtn")}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginHorizontal: 14,
    gap: 16,
    marginTop: 4,
  },
  simulateBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.accent + "55",
    backgroundColor: Colors.accent + "11",
    marginTop: 16,
  },
  simulateBtnText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
    color: Colors.accent,
  },
  dangerZone: {
    padding: 16,
    backgroundColor: Colors.error + "10",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.error + "40",
  },
  dangerTitle: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
    color: Colors.error,
    marginBottom: 12,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  deleteBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: Colors.error,
    borderRadius: 12,
    paddingVertical: 14,
  },
  deleteBtnText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 15,
    color: "#fff",
  },
});
