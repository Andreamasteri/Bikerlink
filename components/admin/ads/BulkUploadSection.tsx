import React from "react";
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, TextInput, ActivityIndicator, Platform } from "react-native";
import { MaterialIcons, Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { useT } from "@/lib/language-context";
import { BulkImageAsset } from "@/lib/image-picker-utils";

interface BulkUploadSectionProps {
  bulkBaseName: string;
  onBulkBaseNameChange: (text: string) => void;
  bulkTarget: string;
  onBulkTargetChange: (target: any) => void;
  bulkDuration: string;
  onBulkDurationChange: (text: string) => void;
  bulkLinkUrl: string;
  onBulkLinkUrlChange: (text: string) => void;
  bulkImages: BulkImageAsset[];
  onPickImages: () => void;
  onRemoveImage: (index: number) => void;
  onSubmit: () => void;
  onCancel: () => void;
  isUploading: boolean;
  progress: { current: number; total: number } | null;
  tabs: { key: string; label: string; icon: string; iconSet: string; color: string }[];
}

export function BulkUploadSection({
  bulkBaseName,
  onBulkBaseNameChange,
  bulkTarget,
  onBulkTargetChange,
  bulkDuration,
  onBulkDurationChange,
  bulkLinkUrl,
  onBulkLinkUrlChange,
  bulkImages,
  onPickImages,
  onRemoveImage,
  onSubmit,
  onCancel,
  isUploading,
  progress,
  tabs,
}: BulkUploadSectionProps) {
  const t = useT();

  return (
    <View style={styles.container}>
      <View style={styles.modalHeader}>
        <Text style={styles.modalTitle}>{t("admin.bulkUpload")}</Text>
        <TouchableOpacity onPress={onCancel} disabled={isUploading}>
          <MaterialIcons name="close" size={24} color={Colors.textSecondary} />
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 20 }}>
        <Text style={styles.settingsLabel}>{t("admin.groupBaseName")}</Text>
        <TextInput
          style={styles.input}
          placeholder="es. Promo Estate"
          placeholderTextColor={Colors.textSecondary}
          value={bulkBaseName}
          onChangeText={onBulkBaseNameChange}
          editable={!isUploading}
        />

        <Text style={styles.settingsLabel}>{t("admin.target")}</Text>
        <View style={styles.targetRow}>
          {tabs.map((tab) => (
            <TouchableOpacity
              key={tab.key}
              style={[
                styles.targetChip,
                bulkTarget === tab.key && { borderColor: tab.color, backgroundColor: tab.color + "10" },
              ]}
              onPress={() => onBulkTargetChange(tab.key)}
              disabled={isUploading}
            >
              <Text style={[styles.targetChipText, bulkTarget === tab.key && { color: tab.color }]}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.settingsLabel}>{t("admin.displayDuration")}</Text>
        <TextInput
          style={styles.input}
          placeholder="Secondi (default 10)"
          placeholderTextColor={Colors.textSecondary}
          value={bulkDuration}
          onChangeText={onBulkDurationChange}
          keyboardType="number-pad"
          editable={!isUploading}
        />

        <Text style={styles.settingsLabel}>Link URL (opzionale)</Text>
        <TextInput
          style={styles.input}
          placeholder="https://..."
          placeholderTextColor={Colors.textSecondary}
          value={bulkLinkUrl}
          onChangeText={onBulkLinkUrlChange}
          keyboardType="url"
          autoCapitalize="none"
          editable={!isUploading}
        />

        <Text style={styles.settingsLabel}>Immagini ({bulkImages.length})</Text>
        <TouchableOpacity
          style={styles.imagePickerBtn}
          onPress={onPickImages}
          disabled={isUploading}
        >
          <View style={styles.imagePlaceholder}>
            <MaterialIcons name="add-photo-alternate" size={32} color={Colors.accent} />
            <Text style={styles.imagePlaceholderText}>Seleziona immagini</Text>
          </View>
        </TouchableOpacity>

        {bulkImages.length > 0 && (
          <View style={styles.imagesGrid}>
            {bulkImages.map((img, idx) => (
              <View key={idx} style={styles.imageThumbContainer}>
                <View style={styles.imageThumbWrapper}>
                  <Text style={styles.imageThumbText} numberOfLines={1}>
                    {img.fileName || "Img " + (idx + 1)}
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.removeImageBtn}
                  onPress={() => onRemoveImage(idx)}
                  disabled={isUploading}
                >
                  <Ionicons name="close-circle" size={20} color={Colors.error} />
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}

        <TouchableOpacity
          style={[
            styles.submitBtn,
            { backgroundColor: Colors.accent },
            (!bulkBaseName.trim() || bulkImages.length === 0 || isUploading) && styles.submitBtnDisabled,
          ]}
          onPress={onSubmit}
          disabled={!bulkBaseName.trim() || bulkImages.length === 0 || isUploading}
        >
          {isUploading ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <ActivityIndicator color={Colors.background} size="small" />
              <Text style={styles.submitBtnText}>
                {progress ? `Caricamento ${progress.current}/${progress.total}...` : "Caricamento..."}
              </Text>
            </View>
          ) : (
            <Text style={styles.submitBtnText}>Crea {bulkImages.length} Campagne</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
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
  targetRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 20,
  },
  targetChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.background,
  },
  targetChipText: {
    fontFamily: "Inter_500Medium",
    fontSize: 13,
    color: Colors.textSecondary,
  },
  imagePickerBtn: {
    marginBottom: 16,
    borderRadius: 12,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: Colors.border,
    borderStyle: "dashed",
  },
  imagePlaceholder: {
    width: "100%",
    aspectRatio: 16 / 4,
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
  imagesGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 20,
  },
  imageThumbContainer: {
    width: "48%",
    position: "relative",
  },
  imageThumbWrapper: {
    padding: 10,
    backgroundColor: Colors.background,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  imageThumbText: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    color: Colors.textSecondary,
  },
  removeImageBtn: {
    position: "absolute",
    top: -5,
    right: -5,
    backgroundColor: "#fff",
    borderRadius: 10,
  },
  submitBtn: {
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
    marginTop: 8,
  },
  submitBtnDisabled: {
    opacity: 0.5,
  },
  submitBtnText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 16,
    color: Colors.background,
  },
});
