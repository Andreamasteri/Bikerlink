import React from "react";
import { View, Text, Modal, KeyboardAvoidingView, Pressable, Image, TextInput, ActivityIndicator, Platform, StyleSheet } from "react-native";
import { useColors } from "@/hooks/useColors";
import type { ThemeColors } from "@/constants/colors";

const sosLaunchIcon = require("@/assets/images/sos-launch-icon.png");

export function SosModal({
  visible,
  onClose,
  sosReason,
  setSosReason,
  sosRadiusKm,
  setSosRadiusKm,
  customRadius,
  setCustomRadius,
  onSubmit,
  isPending,
}: {
  visible: boolean;
  onClose: () => void;
  sosReason: string;
  setSosReason: (v: string) => void;
  sosRadiusKm: number;
  setSosRadiusKm: (v: number) => void;
  customRadius: string;
  setCustomRadius: (v: string) => void;
  onSubmit: (finalRadius: number) => void;
  isPending: boolean;
  location: { latitude: number; longitude: number } | null;
  t: (key: string) => string;
}) {
  const colors = useColors();
  const styles = makeStyles(colors);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
      >
        <Pressable style={styles.modalOverlay} onPress={onClose}>
          <Pressable style={styles.sosSheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.handle} />
            <View style={{ alignItems: "center", marginBottom: 16 }}>
              <Image source={sosLaunchIcon} style={{ width: 80, height: 60 }} resizeMode="contain" />
              <Text style={styles.sosSheetTitle}>Richiesta SOS</Text>
              <Text style={styles.sosSheetSubtitle}>Descrivi il problema</Text>
            </View>
            <TextInput
              style={styles.sosInput}
              placeholder="Foratura, batteria, sequestro mezzo..."
              placeholderTextColor={colors.textSecondary + "80"}
              value={sosReason}
              onChangeText={setSosReason}
              multiline
              maxLength={500}
            />
            <Text style={styles.sosRadiusLabel}>Raggio d'azione</Text>
            <View style={styles.sosRadiusRow}>
              {[10, 20, 50].map((km) => (
                <Pressable
                  key={km}
                  style={[styles.sosRadiusChip, sosRadiusKm === km && !customRadius && styles.sosRadiusChipActive]}
                  onPress={() => { setSosRadiusKm(km); setCustomRadius(""); }}
                >
                  <Text style={[styles.sosRadiusChipText, sosRadiusKm === km && !customRadius && styles.sosRadiusChipTextActive]}>
                    {km} km
                  </Text>
                </Pressable>
              ))}
              <TextInput
                style={[styles.sosRadiusCustom, customRadius ? styles.sosRadiusCustomActive : null]}
                placeholder="Altro"
                placeholderTextColor={colors.textSecondary + "80"}
                value={customRadius}
                onChangeText={(text) => {
                  const num = text.replace(/[^0-9]/g, "");
                  setCustomRadius(num);
                  if (num) {
                    setSosRadiusKm(parseInt(num, 10));
                  } else {
                    setSosRadiusKm(10);
                  }
                }}
                keyboardType="numeric"
                maxLength={4}
              />
            </View>
            <Pressable
              style={[styles.sosSubmitBtn, (!sosReason.trim() || isPending) && { opacity: 0.5 }]}
              disabled={!sosReason.trim() || isPending}
              onPress={() => {
                const finalRadius = customRadius ? parseInt(customRadius, 10) || 10 : sosRadiusKm;
                onSubmit(finalRadius);
              }}
            >
              {isPending ? (
                <ActivityIndicator color={colors.background} />
              ) : (
                <Text style={styles.sosSubmitText}>Invia SOS</Text>
              )}
            </Pressable>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    modalOverlay: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.6)",
      justifyContent: "flex-start",
    },
    handle: {
      width: 40,
      height: 4,
      borderRadius: 2,
      backgroundColor: colors.border,
      alignSelf: "center",
      marginBottom: 16,
    },
    sosSheet: {
      backgroundColor: colors.surface,
      borderBottomLeftRadius: 20,
      borderBottomRightRadius: 20,
      padding: 20,
      paddingBottom: 24,
    },
    sosSheetTitle: {
      fontSize: 20,
      fontFamily: "Inter_700Bold",
      color: colors.accent,
      marginTop: 8,
    },
    sosSheetSubtitle: {
      fontSize: 14,
      fontFamily: "Inter_400Regular",
      color: colors.textSecondary,
      marginTop: 4,
    },
    sosInput: {
      backgroundColor: colors.background,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 14,
      fontSize: 15,
      fontFamily: "Inter_400Regular",
      color: colors.text,
      minHeight: 80,
      textAlignVertical: "top" as const,
      marginBottom: 16,
    },
    sosRadiusLabel: {
      fontSize: 14,
      fontFamily: "Inter_600SemiBold",
      color: colors.text,
      marginTop: 12,
      marginBottom: 8,
    },
    sosRadiusRow: {
      flexDirection: "row" as const,
      gap: 8,
      marginBottom: 16,
    },
    sosRadiusChip: {
      flex: 1,
      paddingVertical: 10,
      borderRadius: 10,
      backgroundColor: colors.background,
      borderWidth: 1.5,
      borderColor: colors.border,
      alignItems: "center" as const,
    },
    sosRadiusChipActive: {
      backgroundColor: colors.accent,
      borderColor: colors.accent,
    },
    sosRadiusChipText: {
      fontSize: 14,
      fontFamily: "Inter_600SemiBold",
      color: colors.textSecondary,
    },
    sosRadiusChipTextActive: {
      color: colors.background,
    },
    sosRadiusCustom: {
      flex: 1,
      paddingVertical: 8,
      paddingHorizontal: 10,
      borderRadius: 10,
      backgroundColor: colors.background,
      borderWidth: 1.5,
      borderColor: colors.border,
      fontSize: 14,
      fontFamily: "Inter_600SemiBold",
      color: colors.text,
      textAlign: "center" as const,
    },
    sosRadiusCustomActive: {
      backgroundColor: colors.accent,
      borderColor: colors.accent,
      color: colors.background,
    },
    sosSubmitBtn: {
      backgroundColor: colors.accent,
      padding: 16,
      borderRadius: 12,
      alignItems: "center" as const,
    },
    sosSubmitText: {
      fontSize: 16,
      fontFamily: "Inter_700Bold",
      color: colors.background,
    },
  });
}
