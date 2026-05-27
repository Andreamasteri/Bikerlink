// Task #2603 — estratto da components/match/MatchCard.tsx (mechanical split)
import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Pressable,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { getTargetLabel, getCompatibilityExplanation } from "./constants";

function CompatibilitySheet({
  visible,
  onClose,
  label,
  explanation,
  t
}: {
  visible: boolean;
  onClose: () => void;
  label: string;
  explanation: string;
  t: (k: string) => string;
}) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <Pressable style={sheetStyles.backdrop} onPress={onClose}>
        <Pressable style={sheetStyles.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={sheetStyles.grabber} />

          <View style={sheetStyles.iconRow}>
            <View style={sheetStyles.iconCircle}>
              <Ionicons name="git-compare-outline" size={28} color={Colors.accent} />
            </View>
          </View>

          <Text style={sheetStyles.title}>{t("compatibility.sheetTitle")}</Text>

          <View style={sheetStyles.badgeRow}>
            <Ionicons name="git-compare-outline" size={14} color={Colors.accent} />
            <Text style={sheetStyles.badgeLabel}>{label}</Text>
          </View>

          <Text style={sheetStyles.explanation}>{explanation}</Text>

          <TouchableOpacity style={sheetStyles.closeBtn} onPress={onClose} activeOpacity={0.8}>
            <Text style={sheetStyles.closeBtnText}>{t("compatibility.closeBtn")}</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const sheetStyles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "flex-end"
  },
  sheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 24,
    paddingBottom: 40,
    paddingTop: 12,
    alignItems: "center"
  },
  grabber: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.border,
    marginBottom: 20
  },
  iconRow: {
    marginBottom: 12
  },
  iconCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: Colors.accent + "18",
    alignItems: "center",
    justifyContent: "center"
  },
  title: {
    fontSize: 20,
    fontFamily: "Inter_700Bold",
    color: Colors.text,
    marginBottom: 14,
    textAlign: "center"
  },
  badgeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: Colors.accent + "14",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    marginBottom: 16
  },
  badgeLabel: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: Colors.accent
  },
  explanation: {
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 24
  },
  closeBtn: {
    backgroundColor: Colors.accent,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 40
  },
  closeBtnText: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    color: Colors.background
  }
});

export function CompatibilityBadge({ myTargets, theirTargets, t }: {
  myTargets: string[] | null | undefined;
  theirTargets: string[] | null | undefined;
  t: (k: string) => string;
}) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const myLabel = getTargetLabel(myTargets, t);
  const theirLabel = getTargetLabel(theirTargets, t);
  if (!myLabel && !theirLabel) return null;

  const label =
    myLabel && theirLabel
      ? `${myLabel} ↔ ${theirLabel}`
      : myLabel || theirLabel || "";

  const explanation = getCompatibilityExplanation(myTargets, theirTargets, t);

  return (
    <>
      <TouchableOpacity
        style={compatBadgeStyles.row}
        onPress={() => setSheetOpen(true)}
        activeOpacity={0.7}
        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
      >
        <Ionicons name="git-compare-outline" size={12} color={Colors.accent} />
        <Text style={compatBadgeStyles.text} numberOfLines={1}>
          {label}
        </Text>
        <Ionicons name="information-circle-outline" size={13} color={Colors.accent} style={{ opacity: 0.7 }} />
      </TouchableOpacity>

      <CompatibilitySheet
        visible={sheetOpen}
        onClose={() => setSheetOpen(false)}
        label={label}
        explanation={explanation}
        t={t}
      />
    </>
  );
}

const compatBadgeStyles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginTop: 6,
    marginBottom: 2,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: Colors.accent + "14",
    borderRadius: 8,
    alignSelf: "flex-start"
  },
  text: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    color: Colors.accent,
    flexShrink: 1
  }
});
