import React, { useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import Colors from "@/constants/colors";

interface MatchTypeSection {
  typeKey: string;
  typeName: string;
  count: number;
  disabled: boolean;
  insufficientData: boolean;
}

interface PreferencesDiffCardProps {
  sections: MatchTypeSection[];
  userId: string;
  nickname: string;
}

export const PreferencesDiffCard: React.FC<PreferencesDiffCardProps> = ({
  sections,
  userId,
  nickname,
}) => {
  const [expanded, setExpanded] = useState(false);
  const router = useRouter();
  const disabled = sections.filter((s) => s.disabled);
  const hasCustom = disabled.length > 0;

  const handleEditPress = () => {
    router.push({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic route path
      pathname: "/admin/match-preferences-edit" as any,
      params: { userId, nickname },
    });
  };

  return (
    <View style={styles.prefsCard}>
      <TouchableOpacity
        style={styles.prefsHeader}
        onPress={() => setExpanded((v) => !v)}
        activeOpacity={0.7}
        testID="prefs-diff-header"
      >
        <View style={styles.prefsHeaderLeft}>
          <View style={styles.prefsTitleRow}>
            <MaterialCommunityIcons
              name="tune-variant"
              size={16}
              color={hasCustom ? Colors.warning ?? "#FF9800" : Colors.success}
            />
            <Text style={styles.prefsTitle}>Preferenze</Text>
            {hasCustom ? (
              <View style={styles.prefsDiffBadge}>
                <Text style={styles.prefsDiffBadgeText}>
                  {disabled.length}/{sections.length} OFF
                </Text>
              </View>
            ) : (
              <View style={[styles.prefsDiffBadge, styles.prefsDiffBadgeOk]}>
                <Text style={[styles.prefsDiffBadgeText, styles.prefsDiffBadgeTextOk]}>
                  DEFAULT
                </Text>
              </View>
            )}
          </View>
          {hasCustom ? (
            <Text style={styles.prefsSubtitle}>
              {disabled.map((s) => s.typeName).join(" · ")}
            </Text>
          ) : (
            <Text style={styles.prefsSubtitle}>
              Tutte le preferenze attive (default)
            </Text>
          )}
        </View>
        <Ionicons
          name={expanded ? "chevron-up" : "chevron-down"}
          size={18}
          color={Colors.textSecondary}
        />
      </TouchableOpacity>

      {expanded && (
        <View style={styles.prefsList}>
          {sections.map((s) => (
            <View key={s.typeKey} style={styles.prefsRow}>
              <Ionicons
                name={s.disabled ? "close-circle" : "checkmark-circle"}
                size={14}
                color={s.disabled ? Colors.error : Colors.success}
              />
              <Text
                style={[
                  styles.prefsRowLabel,
                  s.disabled && styles.prefsRowLabelOff,
                ]}
              >
                {s.typeName}
              </Text>
              <Text
                style={[
                  styles.prefsRowState,
                  { color: s.disabled ? Colors.error : Colors.success },
                ]}
              >
                {s.disabled ? "OFF" : "ON"}
              </Text>
            </View>
          ))}
          <TouchableOpacity
            style={styles.editPrefsBtn}
            onPress={handleEditPress}
            activeOpacity={0.7}
            testID="edit-prefs-btn"
          >
            <Ionicons name="create-outline" size={14} color={Colors.accent} />
            <Text style={styles.editPrefsBtnText}>Modifica preferenze</Text>
          </TouchableOpacity>
        </View>
      )}

      {!expanded && (
        <TouchableOpacity
          style={styles.editPrefsBtnCollapsed}
          onPress={handleEditPress}
          activeOpacity={0.7}
          testID="edit-prefs-btn-collapsed"
        >
          <Ionicons name="create-outline" size={13} color={Colors.accent} />
          <Text style={styles.editPrefsBtnText}>Modifica</Text>
        </TouchableOpacity>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  prefsCard: {
    marginHorizontal: 12,
    marginBottom: 16,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: "hidden",
  },
  prefsHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 8,
  },
  prefsHeaderLeft: { flex: 1, gap: 4 },
  prefsTitleRow: { flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" },
  prefsTitle: { fontFamily: "Inter_700Bold", fontSize: 14, color: Colors.text },
  prefsDiffBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: (Colors.warning ?? "#FF9800") + "22",
  },
  prefsDiffBadgeOk: { backgroundColor: Colors.success + "22" },
  prefsDiffBadgeText: {
    fontFamily: "Inter_700Bold",
    fontSize: 10,
    color: Colors.warning ?? "#FF9800",
  },
  prefsDiffBadgeTextOk: { color: Colors.success },
  prefsSubtitle: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: Colors.textSecondary,
  },
  prefsList: {
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingVertical: 4,
  },
  prefsRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 6,
    gap: 8,
  },
  prefsRowLabel: {
    flex: 1,
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: Colors.text,
  },
  prefsRowLabelOff: { color: Colors.textSecondary },
  prefsRowState: { fontFamily: "Inter_700Bold", fontSize: 10 },
  editPrefsBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  editPrefsBtnCollapsed: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  editPrefsBtnText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
    color: Colors.accent,
  },
});
