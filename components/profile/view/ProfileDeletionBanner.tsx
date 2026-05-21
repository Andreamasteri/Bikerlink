import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";

interface ProfileDeletionBannerProps {
  deletionRequestedAt?: string;
  locale: string;
  onCancelDeletion: () => void;
  t: (key: string) => string;
}

export const ProfileDeletionBanner: React.FC<ProfileDeletionBannerProps> = ({
  deletionRequestedAt,
  locale,
  onCancelDeletion,
  t,
}) => {
  if (!deletionRequestedAt) return null;

  return (
    <View style={styles.deletionBanner}>
      <Ionicons name="warning" size={20} color="#000" />
      <Text style={styles.deletionBannerText}>
        {t("profile.deletionScheduled")} {new Date(new Date(deletionRequestedAt).getTime() + 30 * 24 * 60 * 60 * 1000).toLocaleDateString(locale)}.
      </Text>
      <Pressable style={styles.deletionCancelBtn} onPress={onCancelDeletion}>
        <Text style={styles.deletionCancelBtnText}>{t("profile.cancelDeletion")}</Text>
      </Pressable>
    </View>
  );
};

const styles = StyleSheet.create({
  deletionBanner: {
    marginHorizontal: 16,
    marginTop: 8,
    backgroundColor: Colors.warning,
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
    gap: 8,
  },
  deletionBannerText: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    color: "#000",
    textAlign: "center",
  },
  deletionCancelBtn: {
    backgroundColor: "#000",
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    marginTop: 4,
  },
  deletionCancelBtnText: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: "#fff",
  },
});
