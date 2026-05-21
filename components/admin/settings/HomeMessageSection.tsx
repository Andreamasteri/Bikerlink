import React from "react";
import { View as RNView, Text as RNText, StyleSheet as RNStyleSheet, Switch as RNSwitch, TextInput as RNTextInput, TouchableOpacity as RNTouchableOpacity } from "react-native";
import { Ionicons as IoniconsSet } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { useT } from "@/lib/language-context";

const styles = RNStyleSheet.create({
  paidCard: {
    backgroundColor: Colors.surface, borderRadius: 12, padding: 16, marginBottom: 16,
    borderWidth: 1, borderColor: Colors.warning,
  },
  synecoHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  synecoInfo: { flexDirection: "row", alignItems: "center", gap: 10 },
  synecoLabel: { fontFamily: "Inter_600SemiBold", fontSize: 16, color: Colors.text },
  synecoDesc: { fontFamily: "Inter_400Regular", fontSize: 13, color: Colors.textSecondary, marginTop: 8 },
  input: {
    backgroundColor: Colors.background, borderRadius: 10, padding: 12,
    fontFamily: "Inter_400Regular", fontSize: 14, color: Colors.text,
    borderWidth: 1, borderColor: Colors.border, textAlignVertical: "top" as const,
  },
  editActions: { flexDirection: "row", gap: 12, marginTop: 12, justifyContent: "flex-end" },
  saveBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8, backgroundColor: Colors.accent },
  saveBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: Colors.background },
});

interface HomeMessageSectionProps {
  homeMessageEnabled: boolean;
  onHomeMessageToggle: (val: boolean) => void;
  homeMessageTogglePending: boolean;
  homeMessageText: string;
  setHomeMessageText: (val: string) => void;
  onSaveHomeMessageText: () => void;
  isSavingHomeMessage: boolean;
}

export function HomeMessageSection({
  homeMessageEnabled,
  onHomeMessageToggle,
  homeMessageTogglePending,
  homeMessageText,
  setHomeMessageText,
  onSaveHomeMessageText,
  isSavingHomeMessage,
}: HomeMessageSectionProps) {
  const t = useT();

  return (
    <RNView style={styles.paidCard}>
      <RNView style={styles.synecoHeader}>
        <RNView style={styles.synecoInfo}>
          <IoniconsSet name="megaphone-outline" size={20} color={Colors.accent} />
          <RNText style={styles.synecoLabel}>Messaggio Home</RNText>
        </RNView>
        <RNSwitch
          value={homeMessageEnabled}
          onValueChange={onHomeMessageToggle}
          trackColor={{ false: Colors.border, true: Colors.accent }}
          thumbColor={homeMessageEnabled ? Colors.text : Colors.textSecondary}
          disabled={homeMessageTogglePending}
        />
      </RNView>
      <RNText style={styles.synecoDesc}>
        {homeMessageEnabled
          ? t("admin.logoMsgActive")
          : t("admin.logoMsgInactive")}
      </RNText>
      <RNView style={{ marginTop: 14 }}>
        <RNTextInput
          style={[styles.input, { minHeight: 100 }]}
          placeholder="Inserisci il messaggio da mostrare agli utenti..."
          placeholderTextColor={Colors.textSecondary}
          value={homeMessageText}
          onChangeText={setHomeMessageText}
          multiline
          numberOfLines={4}
        />
        <RNView style={styles.editActions}>
          <RNTouchableOpacity
            style={styles.saveBtn}
            onPress={onSaveHomeMessageText}
            disabled={isSavingHomeMessage}
          >
            <RNText style={styles.saveBtnText}>{isSavingHomeMessage ? "..." : t("admin.saveBtn")}</RNText>
          </RNTouchableOpacity>
        </RNView>
      </RNView>
    </RNView>
  );
}
