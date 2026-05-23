import React from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, Switch } from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { useT } from "@/lib/language-context";

interface AdFormProps {
  title: string;
  name: string;
  onNameChange: (text: string) => void;
  linkUrl: string;
  onLinkUrlChange: (text: string) => void;
  description?: string;
  onDescriptionChange?: (text: string) => void;
  isActive?: boolean;
  onIsActiveChange?: (value: boolean) => void;
  onSubmit: () => void;
  onCancel: () => void;
  isPending: boolean;
  submitLabel: string;
  isGroup?: boolean;
}

export function AdForm({
  title,
  name,
  onNameChange,
  linkUrl,
  onLinkUrlChange,
  description,
  onDescriptionChange,
  isActive,
  onIsActiveChange,
  onSubmit,
  onCancel,
  isPending,
  submitLabel,
  isGroup = false,
}: AdFormProps) {
  const t = useT();

  return (
    <View style={styles.overlayCard}>
      <View style={styles.modalHeader}>
        <Text style={styles.modalTitle}>{title}</Text>
        <TouchableOpacity onPress={onCancel}>
          <MaterialIcons name="close" size={22} color={Colors.textSecondary} />
        </TouchableOpacity>
      </View>

      {isGroup && (
        <Text style={[styles.cardDesc, { marginBottom: 12 }]}>
          Rinomina, aggiorna il link e attiva/disattiva tutte le campagne del gruppo in una volta. I numeri (#1, #2...) vengono aggiunti automaticamente.
        </Text>
      )}

      <Text style={styles.settingsLabel}>{isGroup ? "Nome base gruppo" : "Nome"}</Text>
      <TextInput
        style={[styles.input, { marginBottom: 12 }]}
        placeholder={isGroup ? "Nome base (es. Estate 2026)" : t("admin.campaignName")}
        placeholderTextColor={Colors.textSecondary}
        value={name}
        onChangeText={onNameChange}
        autoFocus
      />

      {onDescriptionChange !== undefined && !isGroup && (
        <>
          <Text style={styles.settingsLabel}>{t("admin.description")}</Text>
          <TextInput
            style={[styles.input, { height: 80, textAlignVertical: "top", marginBottom: 12 }]}
            placeholder={t("admin.campaignDesc")}
            placeholderTextColor={Colors.textSecondary}
            value={description}
            onChangeText={onDescriptionChange}
            multiline
          />
        </>
      )}

      <Text style={styles.settingsLabel}>Link URL (opzionale)</Text>
      <TextInput
        style={[styles.input, { marginBottom: isGroup ? 16 : 20 }]}
        placeholder="https://..."
        placeholderTextColor={Colors.textSecondary}
        value={linkUrl}
        onChangeText={onLinkUrlChange}
        keyboardType="url"
        autoCapitalize="none"
        autoCorrect={false}
      />

      {isGroup && onIsActiveChange && (
        <View style={styles.toggleRow}>
          <Text style={styles.settingsLabel}>Attiva tutte le campagne del gruppo</Text>
          <Switch
            value={isActive}
            onValueChange={onIsActiveChange}
            trackColor={{ false: Colors.surface, true: Colors.accent }}
            thumbColor="#fff"
          />
        </View>
      )}

      <TouchableOpacity
        style={[styles.submitBtn, { opacity: (!name.trim() || isPending) ? 0.4 : 1, marginTop: isGroup ? 20 : 8 }]}
        onPress={onSubmit}
        disabled={!name.trim() || isPending}
      >
        {isPending ? (
          <ActivityIndicator color={Colors.background} />
        ) : (
          <Text style={styles.submitBtnText}>{submitLabel}</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  overlayCard: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 20,
    width: "100%",
    maxWidth: 400,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },
  modalTitle: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 18,
    color: Colors.text,
  },
  cardDesc: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: Colors.textSecondary,
    marginTop: 3,
  },
  settingsLabel: {
    fontFamily: "Inter_500Medium",
    fontSize: 14,
    color: Colors.textSecondary,
    marginBottom: 8,
  },
  input: {
    backgroundColor: Colors.background,
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    fontFamily: "Inter_400Regular",
    fontSize: 15,
    color: Colors.text,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 4,
  },
  submitBtn: {
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
  },
  submitBtnText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 16,
    color: Colors.background,
  },
});
