import React from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Modal,
  Image,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { getApiUrl } from "@/lib/query-client";
import { InvitationCode } from "./InviteCodeCard";

export type PendingImage = {
  uri: string;
  name: string;
  type: string;
};

export const EMPTY_FORM = { code: "", label: "", giftMessage: "", maxUses: "100", expiresAt: "" };

interface InviteCodeFormProps {
  visible: boolean;
  onClose: () => void;
  editingCode: InvitationCode | null;
  form: typeof EMPTY_FORM;
  setForm: (form: typeof EMPTY_FORM) => void;
  formError: string;
  isSaving: boolean;
  onSave: () => void;
  onPickImage: () => void;
  pendingImage: PendingImage | null;
  setPendingImage: (img: PendingImage | null) => void;
  t: (key: string) => string;
}

export function InviteCodeForm({
  visible,
  onClose,
  editingCode,
  form,
  setForm,
  formError,
  isSaving,
  onSave,
  onPickImage,
  pendingImage,
  setPendingImage,
  t,
}: InviteCodeFormProps) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalCard}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{editingCode ? t("admin.editCode") : t("admin.newCode")}</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={24} color={Colors.text} />
            </TouchableOpacity>
          </View>

          <ScrollView keyboardShouldPersistTaps="handled">
            {!editingCode && (
              <View style={styles.field}>
                <Text style={styles.fieldLabel}>Codice *</Text>
                <TextInput
                  style={styles.fieldInput}
                  value={form.code}
                  onChangeText={(v) => setForm({ ...form, code: v.toUpperCase() })}
                  placeholder="Es. SMILE"
                  placeholderTextColor={Colors.textSecondary}
                  autoCapitalize="characters"
                  autoCorrect={false}
                />
                <Text style={styles.fieldHint}>{t("admin.inviteCodeHint")}</Text>
              </View>
            )}

            <View style={styles.field}>
              <Text style={styles.fieldLabel}>Nome / Esercente</Text>
              <TextInput
                style={styles.fieldInput}
                value={form.label}
                onChangeText={(v) => setForm({ ...form, label: v })}
                placeholder="Es. Pub Rock Roma"
                placeholderTextColor={Colors.textSecondary}
              />
            </View>

            <View style={styles.field}>
              <Text style={styles.fieldLabel}>Messaggio omaggio</Text>
              <TextInput
                style={[styles.fieldInput, styles.fieldTextarea]}
                value={form.giftMessage}
                onChangeText={(v) => setForm({ ...form, giftMessage: v })}
                placeholder={"Es. Grazie per esserti registrato!\nMostra questo schermo al barista per ritirare il tuo drink di benvenuto."}
                placeholderTextColor={Colors.textSecondary}
                multiline
                numberOfLines={4}
              />
              <Text style={styles.fieldHint}>{t("admin.inviteWelcomeHint")}</Text>
            </View>

            <View style={styles.field}>
              <Text style={styles.fieldLabel}>Immagine gadget</Text>
              <TouchableOpacity style={styles.imagePickerBtn} onPress={onPickImage}>
                <Ionicons name="image-outline" size={20} color={Colors.accent} />
                <Text style={styles.imagePickerBtnText}>
                  {pendingImage ? "Cambia immagine" : (editingCode?.imageUrl ? "Sostituisci immagine" : "Carica immagine")}
                </Text>
              </TouchableOpacity>
              <Text style={styles.fieldHint}>Formati supportati: JPG e PNG — max 5 MB</Text>
              {pendingImage ? (
                <View style={styles.imagePreviewRow}>
                  <Image source={{ uri: pendingImage.uri }} style={styles.imagePreview} resizeMode="cover" />
                  <TouchableOpacity onPress={() => setPendingImage(null)} style={styles.imageRemoveBtn}>
                    <Ionicons name="close-circle" size={20} color={Colors.error} />
                  </TouchableOpacity>
                </View>
              ) : editingCode?.imageUrl ? (
                <View style={styles.imagePreviewRow}>
                  <Image
                    source={{ uri: `${getApiUrl().replace(/\/$/, "")}${editingCode.imageUrl}` }}
                    style={styles.imagePreview}
                    resizeMode="cover"
                  />
                  <Text style={styles.imageExistingLabel}>Immagine attuale</Text>
                </View>
              ) : null}
            </View>

            <View style={styles.field}>
              <Text style={styles.fieldLabel}>Numero massimo di usi</Text>
              <TextInput
                style={styles.fieldInput}
                value={form.maxUses}
                onChangeText={(v) => setForm({ ...form, maxUses: v })}
                keyboardType="number-pad"
                placeholder="100"
                placeholderTextColor={Colors.textSecondary}
              />
            </View>

            <View style={styles.field}>
              <Text style={styles.fieldLabel}>Scadenza (opzionale, formato YYYY-MM-DD)</Text>
              <TextInput
                style={styles.fieldInput}
                value={form.expiresAt}
                onChangeText={(v) => setForm({ ...form, expiresAt: v })}
                placeholder="2026-12-31"
                placeholderTextColor={Colors.textSecondary}
                keyboardType="numbers-and-punctuation"
              />
            </View>

            {formError ? <Text style={styles.formError}>{formError}</Text> : null}

            <TouchableOpacity
              style={[styles.saveBtn, isSaving && { opacity: 0.7 }]}
              onPress={onSave}
              disabled={isSaving}
            >
              {isSaving ? (
                <ActivityIndicator color={Colors.background} />
              ) : (
                <Text style={styles.saveBtnText}>{editingCode ? t("admin.saveChanges2") : t("admin.createCode")}</Text>
              )}
            </TouchableOpacity>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "flex-end",
  },
  modalCard: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    maxHeight: "90%",
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 20,
  },
  modalTitle: {
    flex: 1,
    fontSize: 18,
    fontFamily: "Inter_700Bold",
    color: Colors.text,
  },
  field: {
    gap: 6,
    marginBottom: 16,
  },
  fieldLabel: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    color: Colors.textSecondary,
  },
  fieldInput: {
    backgroundColor: Colors.background,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    color: Colors.text,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  fieldTextarea: {
    minHeight: 90,
    textAlignVertical: "top",
  },
  fieldHint: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
    lineHeight: 15,
  },
  imagePickerBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(255,107,53,0.1)",
    borderWidth: 1,
    borderColor: Colors.accent,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  imagePickerBtnText: {
    color: Colors.accent,
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
  imagePreviewRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 8,
  },
  imagePreview: {
    width: 80,
    height: 80,
    borderRadius: 8,
    backgroundColor: Colors.border,
  },
  imageRemoveBtn: {
    padding: 4,
  },
  imageExistingLabel: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
  },
  formError: {
    color: Colors.error,
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    marginBottom: 12,
    textAlign: "center",
  },
  saveBtn: {
    backgroundColor: Colors.accent,
    borderRadius: 12,
    height: 50,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
    marginBottom: 20,
  },
  saveBtnText: {
    color: Colors.background,
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
  },
});
