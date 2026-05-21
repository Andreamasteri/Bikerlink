import React from "react";
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";

function formatSprintTime(ms: number): string {
  return (ms / 1000).toFixed(3) + "s";
}

import { useT } from "@/lib/language-context";

interface SprintResult {
  id: string;
  sprint0to100Ms: number;
  maxAccelerationG: number | null;
  maxDecelerationG: number | null;
  maxTiltDeg: number | null;
  routeId: string | null;
  createdAt: string;
}

interface PublishSprintModalProps {
  publishSprint: SprintResult | null;
  publishCaption: string;
  setPublishCaption: (caption: string) => void;
  onClose: () => void;
  onPublish: () => void;
  isPending: boolean;
  targetLabel: string;
}

export const PublishSprintModal: React.FC<PublishSprintModalProps> = ({
  publishSprint,
  publishCaption,
  setPublishCaption,
  onClose,
  onPublish,
  isPending,
  targetLabel,
}) => {
  const t = useT();

  return (
    <Modal
      visible={!!publishSprint}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={styles.modalOverlay} onPress={onClose}>
        <Pressable style={styles.publishModal} onPress={() => {}}>
          <Text style={styles.publishTitle}>{t("tracking.publish")}</Text>
          <Text style={styles.publishSubtitle}>{t("tracking.publishDesc")}</Text>

          {publishSprint && (
            <View style={styles.publishSummary}>
              <View style={styles.publishSummaryRow}>
                <Ionicons name="speedometer-outline" size={16} color={Colors.accentRed} />
                <Text style={styles.publishSummaryText}>
                  0→{targetLabel}: {formatSprintTime(publishSprint.sprint0to100Ms ?? 0)}
                </Text>
              </View>
              {(publishSprint.maxAccelerationG ?? 0) > 0 && (
                <View style={styles.publishSummaryRow}>
                  <Ionicons name="pulse-outline" size={16} color={Colors.accentRed} />
                  <Text style={styles.publishSummaryText}>
                    {(publishSprint.maxAccelerationG ?? 0).toFixed(2)}G
                  </Text>
                </View>
              )}
              {(publishSprint.maxTiltDeg ?? 0) > 0 && (
                <View style={styles.publishSummaryRow}>
                  <Ionicons name="compass-outline" size={16} color={Colors.accent} />
                  <Text style={styles.publishSummaryText}>
                    {(publishSprint.maxTiltDeg ?? 0).toFixed(1)}°
                  </Text>
                </View>
              )}
            </View>
          )}

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
              style={[styles.publishConfirmBtn, isPending && { opacity: 0.5 }]}
              onPress={onPublish}
              disabled={isPending}
              activeOpacity={0.7}
              testID="publish-sprint-confirm"
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
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  publishModal: {
    width: "100%",
    maxWidth: 400,
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 20,
    gap: 12,
  },
  publishTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: Colors.text,
  },
  publishSubtitle: {
    fontSize: 13,
    color: Colors.textSecondary,
  },
  publishSummary: {
    backgroundColor: Colors.background,
    borderRadius: 10,
    padding: 12,
    gap: 8,
  },
  publishSummaryRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  publishSummaryText: {
    fontSize: 14,
    color: Colors.text,
    fontWeight: "600",
  },
  publishInput: {
    backgroundColor: Colors.background,
    borderRadius: 10,
    padding: 12,
    color: Colors.text,
    fontSize: 14,
    minHeight: 80,
    textAlignVertical: "top",
  },
  publishActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 4,
  },
  publishCancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.background,
  },
  publishCancelText: {
    fontSize: 14,
    fontWeight: "600",
    color: Colors.textSecondary,
  },
  publishConfirmBtn: {
    flex: 1,
    flexDirection: "row",
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.accent,
    gap: 6,
  },
  publishConfirmText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#fff",
  },
});
