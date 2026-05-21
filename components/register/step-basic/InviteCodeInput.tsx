import React from "react";
import { View, Text, TextInput, ActivityIndicator, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { t } from "@/lib/i18n";

interface InviteCodeInputProps {
  inviteCode: string;
  setInviteCode: (v: string) => void;
  invitePreview: { code: string; label: string | null; giftMessage: string | null } | null;
  invitePreviewLoading: boolean;
}

export const InviteCodeInput: React.FC<InviteCodeInputProps> = ({
  inviteCode,
  setInviteCode,
  invitePreview,
  invitePreviewLoading,
}) => {
  return (
    <View style={styles.inviteSection}>
      <View style={styles.inputWrapper}>
        <Ionicons name="gift-outline" size={22} color={Colors.textSecondary} style={styles.inputIcon} />
        <TextInput
          style={styles.input}
          placeholder={t("register.step3.inviteCodePlaceholder")}
          placeholderTextColor={Colors.textSecondary}
          value={inviteCode}
          onChangeText={setInviteCode}
          autoCapitalize="characters"
          testID="input-invite-code"
        />
        {invitePreviewLoading && <ActivityIndicator size="small" color={Colors.accent} />}
      </View>

      {invitePreview && (
        <View style={styles.inviteBanner}>
          <Ionicons name="sparkles" size={20} color={Colors.accent} />
          <View style={styles.inviteBannerText}>
            <Text style={styles.inviteBannerTitle}>Codice valido!</Text>
            {invitePreview.label && <Text style={styles.inviteBannerLabel}>{invitePreview.label}</Text>}
            {invitePreview.giftMessage && <Text style={styles.inviteBannerMessage}>{invitePreview.giftMessage}</Text>}
          </View>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  inviteSection: {
    marginTop: 8,
    gap: 8,
  },
  inputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 14,
    height: 58,
  },
  inputIcon: {
    marginRight: 10,
  },
  input: {
    flex: 1,
    color: Colors.text,
    fontSize: 19,
    fontFamily: "Inter_400Regular",
    height: "100%",
  },
  inviteBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: "rgba(255, 152, 0, 0.12)",
    borderWidth: 1,
    borderColor: Colors.accent,
    borderRadius: 12,
    padding: 14,
    gap: 12,
  },
  inviteBannerText: {
    flex: 1,
    gap: 3,
  },
  inviteBannerTitle: {
    color: Colors.accent,
    fontSize: 15,
    fontFamily: "Inter_700Bold",
  },
  inviteBannerLabel: {
    color: Colors.textSecondary,
    fontSize: 12,
    fontFamily: "Inter_500Medium",
  },
  inviteBannerMessage: {
    color: Colors.text,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    lineHeight: 18,
  },
});
