import React from "react";
import { View, Text, StyleSheet, Pressable, Platform } from "react-native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import { useT } from "@/lib/language-context";
import type { ThemeColors } from "@/constants/colors";

interface NavigationInstructionProps {
  step: {
    sign: number;
    text: string;
    streetName?: string;
  } | null;
  nextStep: {
    sign: number;
    text: string;
  } | null;
  distanceToNext: number | null;
  bottomPad: number;
  signToIcon: (sign: number) => keyof typeof Ionicons.glyphMap;
  formatDistance: (m: number) => string;
  handleOpenInGoogleMaps: () => void;
  handleOpenInWaze: () => void;
  handleOpenInAppleMaps: () => void;
}

export function NavigationInstruction({
  step,
  nextStep,
  distanceToNext,
  bottomPad,
  signToIcon,
  formatDistance,
  handleOpenInGoogleMaps,
  handleOpenInWaze,
  handleOpenInAppleMaps,
}: NavigationInstructionProps) {
  const colors = useColors();
  const t = useT();
  const s = styles(colors);

  return (
    <View style={[s.panel, { paddingBottom: bottomPad + 8 }]}>
      {step ? (
        <>
          <View style={s.stepRow}>
            <View style={s.stepIcon}>
              <Ionicons name={signToIcon(step.sign)} size={32} color={colors.accent} />
            </View>
            <View style={s.stepInfo}>
              <Text style={s.stepText} numberOfLines={2}>{step.text}</Text>
              {step.streetName ? (
                <Text style={s.stepStreet} numberOfLines={1}>{step.streetName}</Text>
              ) : null}
              {distanceToNext !== null && (
                <Text style={s.stepDistance}>{formatDistance(distanceToNext)}</Text>
              )}
            </View>
          </View>

          {/* Next step preview */}
          {nextStep && (
            <View style={s.nextStepRow}>
              <Ionicons name={signToIcon(nextStep.sign)} size={14} color={colors.textSecondary} />
              <Text style={s.nextStepText} numberOfLines={1}>
                {t("nav.then")} {nextStep.text}
              </Text>
            </View>
          )}
        </>
      ) : (
        <View style={s.stepRow}>
          <MaterialCommunityIcons name="navigation-outline" size={32} color={colors.accent} />
          <Text style={s.stepText}>{t("nav.in_progress")}</Text>
        </View>
      )}

      {/* Open in external apps */}
      <View style={s.externalRow}>
        <Pressable style={s.externalBtn} onPress={handleOpenInGoogleMaps}>
          <MaterialCommunityIcons name="google-maps" size={16} color={colors.textSecondary} />
          <Text style={s.externalLabel}>Google Maps</Text>
        </Pressable>
        <Pressable style={s.externalBtn} onPress={handleOpenInWaze}>
          <MaterialCommunityIcons name="waze" size={16} color={colors.textSecondary} />
          <Text style={s.externalLabel}>Waze</Text>
        </Pressable>
        {Platform.OS === "ios" && (
          <Pressable style={s.externalBtn} onPress={handleOpenInAppleMaps}>
            <Ionicons name="map-outline" size={16} color={colors.textSecondary} />
            <Text style={s.externalLabel}>Apple Maps</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = (colors: ThemeColors) =>
  StyleSheet.create({
    panel: {
      backgroundColor: colors.surface,
      paddingHorizontal: 16,
      paddingTop: 14,
      gap: 10,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: -2 },
      shadowOpacity: 0.15,
      shadowRadius: 6,
      elevation: 8,
    },
    stepRow: { flexDirection: "row", alignItems: "center", gap: 12 },
    stepIcon: {
      width: 52,
      height: 52,
      borderRadius: 14,
      backgroundColor: colors.accent + "22",
      justifyContent: "center",
      alignItems: "center",
    },
    stepInfo: { flex: 1 },
    stepText: { fontFamily: "Inter_700Bold", fontSize: 17, color: colors.text },
    stepStreet: { fontFamily: "Inter_400Regular", fontSize: 13, color: colors.textSecondary, marginTop: 2 },
    stepDistance: { fontFamily: "Inter_600SemiBold", fontSize: 20, color: colors.accent, marginTop: 4 },
    nextStepRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingTop: 6,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    nextStepText: { fontFamily: "Inter_400Regular", fontSize: 13, color: colors.textSecondary, flex: 1 },
    externalRow: { flexDirection: "row", gap: 8, paddingTop: 4 },
    externalBtn: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      backgroundColor: colors.background,
      borderRadius: 8,
      paddingVertical: 8,
      paddingHorizontal: 10,
      justifyContent: "center",
    },
    externalLabel: { fontFamily: "Inter_500Medium", fontSize: 11, color: colors.textSecondary },
  });
