import React, { useState } from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { SupportContactModal } from "@/components/SupportContactModal";

export const ProfileSupportSection: React.FC = () => {
  const [showModal, setShowModal] = useState(false);

  return (
    <View style={styles.section}>
      <Pressable style={styles.menuItem} onPress={() => setShowModal(true)} testID="profile-support">
        <Ionicons name="headset-outline" size={22} color={Colors.text} />
        <Text style={styles.menuLabel}>Supporto tecnico</Text>
        <Ionicons name="chevron-forward" size={18} color={Colors.textSecondary} />
      </Pressable>

      <SupportContactModal visible={showModal} onClose={() => setShowModal(false)} />
    </View>
  );
};

const styles = StyleSheet.create({
  section: {
    paddingHorizontal: 16,
    marginTop: 4,
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
  },
  menuLabel: {
    flex: 1,
    fontSize: 16,
    fontFamily: "Inter_500Medium",
    color: Colors.text,
  },
});
