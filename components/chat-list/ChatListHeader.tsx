import React from "react";
import { View, Text, TouchableOpacity, StyleSheet, Switch } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";

interface ChatListHeaderProps {
  insets: { top: number };
  colors: any;
  emailNotifEnabled: boolean;
  onToggleEmailNotif: (val: boolean) => void;
  onNewChatPress: () => void;
}

export function ChatListHeader({
  insets,
  colors,
  emailNotifEnabled,
  onToggleEmailNotif,
  onNewChatPress,
}: ChatListHeaderProps) {
  return (
    <View style={[styles.header, { paddingTop: insets.top + 4, backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
      <View style={styles.emailNotifRow}>
        <Ionicons name="mail-outline" size={15} color={colors.textSecondary} style={{ marginRight: 6 }} />
        <Text style={styles.emailNotifLabel}>Invia i messaggi in email quando sono Offline</Text>
        <Switch
          value={emailNotifEnabled}
          onValueChange={onToggleEmailNotif}
          trackColor={{ false: Colors.surfaceLight, true: Colors.accent + "88" }}
          thumbColor={emailNotifEnabled ? Colors.accent : Colors.textSecondary}
          style={{ transform: [{ scaleX: 0.8 }, { scaleY: 0.8 }] }}
        />
      </View>
      <View style={styles.headerRow}>
        <TouchableOpacity onPress={onNewChatPress} style={styles.newChatButton}>
          <Text style={styles.newChatText}>Nuova Chat</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: 20,
    paddingBottom: 12,
    borderBottomWidth: 0.5,
    borderBottomColor: Colors.border,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: Colors.accent,
    paddingVertical: 4,
  },
  newChatButton: {
    padding: 4,
  },
  newChatText: {
    fontSize: 18,
    fontFamily: "Inter_700Bold",
    color: Colors.accent,
  },
  emailNotifRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  emailNotifLabel: {
    flex: 1,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    color: Colors.warning,
  },
});
