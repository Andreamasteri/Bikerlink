import React from "react";
import {
  View,
  Text,
  Modal,
  TextInput,
  TouchableOpacity,
  Pressable,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";

interface PublishModalProps {
  visible: boolean;
  onClose: () => void;
  publishCaption: string;
  setPublishCaption: (c: string) => void;
  isPending: boolean;
  onPublish: () => void;
  t: (key: string) => string;
}

export function PublishModal({
  visible,
  onClose,
  publishCaption,
  setPublishCaption,
  isPending,
  onPublish,
  t,
}: PublishModalProps) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={styles.modalOverlay} onPress={onClose}>
        <Pressable style={styles.publishModal} onPress={() => {}}>
          <Text style={styles.publishTitle}>{t("tracking.publish")}</Text>
          <Text style={styles.publishSubtitle}>
            {t("tracking.publishDesc")}
          </Text>
          <TextInput
            style={styles.publishInput}
            placeholder={t("tracking.publishPlaceholder")}
            placeholderTextColor={Colors.textSecondary}
            value={publishCaption}
            onChangeText={setPublishCaption}
            maxLength={200}
            multiline
          />
          <View style={styles.publishActions}>
            <TouchableOpacity
              style={styles.publishCancelBtn}
              onPress={onClose}
              activeOpacity={0.7}
            >
              <Text style={styles.publishCancelText}>{t("common.cancel")}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.publishConfirmBtn,
                isPending && { opacity: 0.5 },
              ]}
              onPress={onPublish}
              disabled={isPending}
              activeOpacity={0.7}
            >
              {isPending ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Ionicons name="share-outline" size={16} color="#fff" />
                  <Text style={styles.publishConfirmText}>{t("tracking.publishBtn")}</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
    padding: 20,
  },
  publishModal: {
    backgroundColor: Colors.background,
    borderRadius: 20,
    padding: 24,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  publishTitle: {
    fontSize: 20,
    fontFamily: "Inter_700Bold",
    color: Colors.text,
    marginBottom: 8,
  },
  publishSubtitle: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
    marginBottom: 20,
    lineHeight: 20,
  },
  publishInput: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 16,
    color: Colors.text,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    height: 100,
    textAlignVertical: "top",
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 24,
  },
  publishActions: {
    flexDirection: "row",
    gap: 12,
  },
  publishCancelBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  publishCancelText: {
    color: Colors.textSecondary,
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
  publishConfirmBtn: {
    flex: 1.5,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: Colors.accent,
    paddingVertical: 14,
    borderRadius: 12,
  },
  publishConfirmText: {
    color: "#fff",
    fontSize: 15,
    fontFamily: "Inter_700Bold",
  },
});
