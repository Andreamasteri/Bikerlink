import React from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { useRouter } from "expo-router";
import type { TaskbarStyle } from "@/lib/taskbar-style-context";

interface ProfileActionsBarProps {
  isAdmin: boolean;
  isModerator: boolean;
  taskbarStyle: TaskbarStyle;
  setTaskbarStyle: (style: TaskbarStyle) => void;
  t: (key: string) => string;
}

export const ProfileActionsBar: React.FC<ProfileActionsBarProps> = ({
  isAdmin,
  isModerator,
  taskbarStyle,
  setTaskbarStyle,
  t,
}) => {
  const router = useRouter();

  const MenuItem = ({ icon, label, onPress, color }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void; color?: string }) => (
    <Pressable style={styles.menuItem} onPress={onPress}>
      <Ionicons name={icon} size={22} color={color || Colors.text} />
      <Text style={[styles.menuLabel, color ? { color } : {}]}>{label}</Text>
      <Ionicons name="chevron-forward" size={18} color={Colors.textSecondary} />
    </Pressable>
  );

  return (
    <View>
      {/* ── Edit Profile ───────────────────────────────── */}
      <View style={styles.section}>
        <Pressable style={[styles.menuItem, { justifyContent: "space-between" }]} onPress={() => router.push("/profile/edit" as never)}>
          <Text style={[styles.menuLabel, { fontSize: 20 }]}>{t("profile.editProfile")}</Text>
          <Ionicons name="chevron-forward" size={18} color={Colors.textSecondary} />
        </Pressable>
      </View>

      {/* ── Taskbar ────────────────────────────────────── */}
      <View style={styles.section}>
        <View style={taskbarStyles.inlineRow}>
          <Text style={taskbarStyles.inlineLabel}>Taskbar</Text>
          <View style={taskbarStyles.inlinePills}>
            {([
              { value: "raggruppa" as TaskbarStyle, label: "Raggruppa" },
              { value: "scorri" as TaskbarStyle, label: "Scorri" },
            ]).map((opt) => {
              const isSelected = taskbarStyle === opt.value;
              return (
                <Pressable
                  key={opt.value}
                  style={[taskbarStyles.pill, isSelected && taskbarStyles.pillSelected]}
                  onPress={() => setTaskbarStyle(opt.value)}
                >
                  <Text style={[taskbarStyles.pillLabel, isSelected && { color: Colors.accent }]}>
                    {opt.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      </View>

      {/* ── Feedback / Admin ───────────────────────────── */}
      <View style={styles.section}>
        <MenuItem icon="bug" label={t("profile.reportBug")} onPress={() => router.push("/feedback/bug" as never)} color={Colors.accentRed} />
        <MenuItem icon="bulb" label={t("profile.requestFeature")} onPress={() => router.push("/feedback/feature" as never)} color={Colors.accent} />
        {isAdmin && (
          <MenuItem icon="shield" label="Pannello Admin" onPress={() => router.push("/admin" as never)} color={Colors.accent} />
        )}
        {(isModerator || isAdmin) && (
          <MenuItem icon="eye" label="Pannello Moderatore" onPress={() => router.push("/moderator" as never)} color={Colors.warning} />
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  section: {
    paddingHorizontal: 16,
    marginTop: 4,
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
  },
  menuLabel: {
    flex: 1,
    fontSize: 16,
    fontFamily: "Inter_500Medium",
    color: Colors.text,
  },
});

const taskbarStyles = StyleSheet.create({
  inlineRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 4,
  },
  inlineLabel: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    color: Colors.text,
  },
  inlinePills: {
    flexDirection: "row",
    gap: 8,
  },
  pill: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: Colors.border,
    backgroundColor: "transparent",
  },
  pillSelected: {
    borderColor: Colors.accent,
    backgroundColor: Colors.accent + "14",
  },
  pillLabel: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    color: Colors.textSecondary,
  },
});
