import React from "react";
import { StyleSheet } from "react-native";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/lib/theme-context";
import { useT } from "@/lib/language-context";
import { useAuth } from "@/lib/auth-context";
import { BackgroundLocationSection } from "@/components/admin/settings/BackgroundLocationSection";
import { useBgLocationState } from "@/components/admin/settings/useBgLocationState";

export default function BackgroundLocationPage() {
  const t = useT();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const { colors: themeColors } = useTheme();

  const bgLocation = useBgLocationState(isAdmin, t);

  return (
    <KeyboardAwareScrollViewCompat
      style={[styles.container, { backgroundColor: themeColors.background }]}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 20 }]}
      bottomOffset={20}
    >
      <BackgroundLocationSection
        expanded={true}
        onToggle={() => {}}
        settings={bgLocation.bgLocationSettings}
        bgIntervalInput={bgLocation.bgIntervalInput}
        setBgIntervalInput={bgLocation.setBgIntervalInput}
        bgNotificationTextInput={bgLocation.bgNotificationTextInput}
        setBgNotificationTextInput={bgLocation.setBgNotificationTextInput}
        onMutation={(body) => bgLocation.bgLocationMutation.mutate(body)}
        isPending={bgLocation.bgLocationMutation.isPending}
      />
    </KeyboardAwareScrollViewCompat>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: 16,
  },
});
