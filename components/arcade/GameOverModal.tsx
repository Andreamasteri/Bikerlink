import React, { useEffect, useRef } from "react";
import { View, Text, StyleSheet, Pressable, Modal, ActivityIndicator, Animated } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";

interface GameOverModalProps {
  score: number;
  personalBest: number;
  isNewRecord: boolean;
  onReplay: () => void;
  onClose: () => void;
  onRetrySave?: () => void;
  scoreLabel: string;
  isSaving: boolean;
  isSaveError: boolean;
}

export const GameOverModal: React.FC<GameOverModalProps> = ({
  score,
  personalBest,
  isNewRecord,
  onReplay,
  onClose,
  onRetrySave,
  scoreLabel,
  isSaving,
  isSaveError,
}) => {
  const bounceAnim = useRef(new Animated.Value(isNewRecord ? 0 : 1)).current;

  useEffect(() => {
    if (isNewRecord) {
      Animated.spring(bounceAnim, {
        toValue: 1,
        friction: 3,
        tension: 200,
        useNativeDriver: true,
      }).start();
    }
  }, [isNewRecord]);

  return (
    <Modal visible animationType="fade" transparent>
      <View style={styles.modalOverlay}>
        <View style={styles.modalCard}>
          {isNewRecord && (
            <Animated.View style={[styles.newRecordBadge, { transform: [{ scale: bounceAnim }] }]}>
              <Text style={styles.newRecordText}>🏆 NUOVO RECORD!</Text>
            </Animated.View>
          )}
          <Text style={styles.gameOverTitle}>Game Over</Text>
          <Text style={styles.gameOverScore}>{score} {scoreLabel}</Text>
          {isNewRecord && personalBest > 0 ? (
            <Text style={styles.gameOverBest}>
              {personalBest} → <Text style={{ color: Colors.accent, fontFamily: "Inter_700Bold" }}>{score}</Text> {scoreLabel} 🎉
            </Text>
          ) : (
            <Text style={styles.gameOverBest}>Personale: {personalBest > 0 ? personalBest : score} {scoreLabel}</Text>
          )}
          {isSaving && <ActivityIndicator size="small" color={Colors.accent} style={{ marginVertical: 8 }} />}
          {isSaveError && (
            <View style={styles.saveErrorRow}>
              <Text style={styles.saveErrorText}>Punteggio non salvato</Text>
              {onRetrySave && (
                <Pressable onPress={onRetrySave} style={styles.retryBtn}>
                  <Ionicons name="refresh-circle" size={18} color={Colors.accent} />
                  <Text style={styles.retryBtnText}>Riprova</Text>
                </Pressable>
              )}
            </View>
          )}
          <View style={styles.modalBtns}>
            <Pressable style={styles.replayBtn} onPress={onReplay}>
              <Ionicons name="refresh" size={18} color="#fff" />
              <Text style={styles.replayBtnText}>Rigioca</Text>
            </Pressable>
            <Pressable style={styles.exitBtn} onPress={onClose}>
              <Text style={styles.exitBtnText}>Esci</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  modalCard: {
    backgroundColor: Colors.surface,
    borderRadius: 20,
    padding: 28,
    width: "100%",
    maxWidth: 340,
    alignItems: "center",
    borderWidth: 1,
    borderColor: Colors.border,
  },
  newRecordBadge: {
    backgroundColor: "#FFD700",
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 6,
    marginBottom: 12,
  },
  newRecordText: { fontSize: 13, fontFamily: "Inter_700Bold", color: "#000" },
  gameOverTitle: { fontSize: 24, fontFamily: "Inter_700Bold", color: Colors.text, marginBottom: 8 },
  gameOverScore: { fontSize: 36, fontFamily: "Inter_700Bold", color: Colors.accent, marginBottom: 4 },
  gameOverBest: { fontSize: 14, fontFamily: "Inter_400Regular", color: Colors.textSecondary, marginBottom: 20 },
  modalBtns: { flexDirection: "row", gap: 12 },
  replayBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: Colors.accent,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 12,
  },
  replayBtnText: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: "#fff" },
  exitBtn: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  exitBtnText: { fontSize: 15, fontFamily: "Inter_500Medium", color: Colors.textSecondary },
  saveErrorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
    paddingHorizontal: 8,
    paddingVertical: 6,
    backgroundColor: "rgba(244,67,54,0.1)",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(244,67,54,0.3)",
  },
  saveErrorText: { fontSize: 13, color: "#F44336", fontFamily: "Inter_500Medium", flex: 1 },
  retryBtn: { flexDirection: "row", alignItems: "center", gap: 4 },
  retryBtnText: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: Colors.accent },
});
