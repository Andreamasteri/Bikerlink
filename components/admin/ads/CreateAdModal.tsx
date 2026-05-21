import React from "react";
import { View, Text, TouchableOpacity, Image, TextInput, ActivityIndicator, StyleSheet, Modal } from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import Colors from "@/constants/colors";
import { useT } from "@/lib/language-context";

interface CreateAdModalProps {
  visible: boolean;
  onClose: () => void;
  title: string;
  imageUri: string | null;
  onPickImage: () => void;
  name: string;
  onNameChange: (text: string) => void;
  linkUrl: string;
  onLinkUrlChange: (text: string) => void;
  description: string;
  onDescriptionChange: (text: string) => void;
  onSubmit: () => void;
  isPending: boolean;
  insets: { top: number; bottom: number };
}

export function CreateAdModal({
  visible,
  onClose,
  title,
  imageUri,
  onPickImage,
  name,
  onNameChange,
  linkUrl,
  onLinkUrlChange,
  description,
  onDescriptionChange,
  onSubmit,
  isPending,
  insets,
}: CreateAdModalProps) {
  const t = useT();

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom + 20 }]}>
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>{title}</Text>
          <TouchableOpacity onPress={onClose}>
            <MaterialIcons name="close" size={24} color={Colors.textSecondary} />
          </TouchableOpacity>
        </View>
        <KeyboardAwareScrollViewCompat bottomOffset={20} keyboardShouldPersistTaps="handled">
          <TouchableOpacity style={styles.imagePickerBtn} onPress={onPickImage}>
            {imageUri ? (
              <Image source={{ uri: imageUri }} style={styles.imagePreview} resizeMode="cover" />
            ) : (
              <View style={styles.imagePlaceholder}>
                <MaterialIcons name="add-photo-alternate" size={36} color={Colors.textSecondary} />
                <Text style={styles.imagePlaceholderText}>{t("admin.uploadImage")}</Text>
              </View>
            )}
          </TouchableOpacity>

          <TextInput
            style={styles.input}
            placeholder={t("admin.campaignNamePlaceholder")}
            placeholderTextColor={Colors.textSecondary}
            value={name}
            onChangeText={onNameChange}
          />
          <TextInput
            style={styles.input}
            placeholder="URL Link (es. https://...)"
            placeholderTextColor={Colors.textSecondary}
            value={linkUrl}
            onChangeText={onLinkUrlChange}
            keyboardType="url"
            autoCapitalize="none"
          />
          <TextInput
            style={[styles.input, { minHeight: 80 }]}
            placeholder="Descrizione"
            placeholderTextColor={Colors.textSecondary}
            value={description}
            onChangeText={onDescriptionChange}
            multiline
            textAlignVertical="top"
          />

          <TouchableOpacity
            style={[styles.submitBtn, { backgroundColor: Colors.accent, opacity: (!name.trim() || !imageUri) ? 0.4 : 1 }]}
            disabled={!name.trim() || !imageUri || isPending}
            onPress={onSubmit}
          >
            {isPending ? (
              <ActivityIndicator color={Colors.background} />
            ) : (
              <Text style={styles.submitBtnText}>{t("admin.createCampaign")}</Text>
            )}
          </TouchableOpacity>
        </KeyboardAwareScrollViewCompat>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
    padding: 20,
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
  imagePickerBtn: {
    marginBottom: 16,
    borderRadius: 12,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: Colors.border,
    borderStyle: "dashed",
  },
  imagePreview: {
    width: "100%",
    aspectRatio: 16 / 11,
  },
  imagePlaceholder: {
    width: "100%",
    aspectRatio: 16 / 11,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.background,
    gap: 6,
  },
  imagePlaceholderText: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: Colors.textSecondary,
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
  submitBtn: {
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
    marginTop: 8,
  },
  submitBtnText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 16,
    color: Colors.background,
  },
});
