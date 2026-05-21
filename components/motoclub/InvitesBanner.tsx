import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";

interface InvitesBannerProps {
  count: number;
  onPress: () => void;
}

export const InvitesBanner: React.FC<InvitesBannerProps> = ({
  count,
  onPress,
}) => {
  if (count === 0) return null;
  return (
    <TouchableOpacity style={styles.invitesBanner} onPress={onPress} activeOpacity={0.85}>
      <Ionicons name="mail" size={18} color={Colors.accent} />
      <Text style={styles.invitesText}>
        Hai {count} {count === 1 ? "invito" : "inviti"} in attesa
      </Text>
      <Ionicons name="chevron-forward" size={16} color={Colors.accent} />
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  invitesBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: Colors.accent + "22",
    borderRadius: 12,
    marginHorizontal: 12,
    marginTop: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: Colors.accent + "44",
  },
  invitesText: { flex: 1, fontSize: 14, color: Colors.accent, fontFamily: "Inter_600SemiBold" },
});
