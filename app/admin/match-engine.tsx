import React from "react";
import { StyleSheet } from "react-native";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/lib/theme-context";
import { useT } from "@/lib/language-context";
import { useAuth } from "@/lib/auth-context";

import { MatchingEngineSection } from "@/components/admin/settings/MatchingEngineSection";
import { useAdminSettingsState } from "@/components/admin/settings/useAdminSettingsState";

export default function AdminMatchEngine() {
  const t = useT();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const { setTheme, colors: themeColors } = useTheme();

  const state = useAdminSettingsState({ isAdmin, t, setTheme });

  return (
    <KeyboardAwareScrollViewCompat
      style={[styles.container, { backgroundColor: themeColors.background }]}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 20 }]}
      bottomOffset={20}
    >
      <MatchingEngineSection
        alwaysExpanded
        expanded={state.matchingEngineExpanded}
        onToggle={() => state.setMatchingEngineExpanded((v) => !v)}
        autoMatchEnabled={state.autoMatchEnabled}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- state from useAdminSettingsState
        onAutoMatchToggle={(val) => (state as any).autoMatchMutation.mutate(val)}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- state from useAdminSettingsState
        autoMatchPending={(state as any).autoMatchMutation.isPending}
        showSearchPrefEnabled={state.showSearchPrefEnabled}
        onShowSearchPrefToggle={(val) => state.showSearchPrefMutation.mutate(val)}
        showSearchPrefPending={state.showSearchPrefMutation.isPending}
        matchPrefVisibleEnabled={state.matchPrefVisibleEnabled}
        onMatchPrefVisibleToggle={(val) => state.matchPrefVisibleMutation.mutate(val)}
        matchPrefVisiblePending={state.matchPrefVisibleMutation.isPending}
        searchPrefLockedEnabled={state.searchPrefLockedEnabled}
        onSearchPrefLockedToggle={(val) => state.searchPrefLockedMutation.mutate(val)}
        searchPrefLockedPending={state.searchPrefLockedMutation.isPending}
        refetchIntervalInput={state.refetchIntervalInput}
        setRefetchIntervalInput={state.setRefetchIntervalInput}
        onRefetchIntervalEndEditing={() => {
          const val = parseInt(state.refetchIntervalInput, 10);
          if (!isNaN(val) && val >= 5) {
            state.refetchIntervalMutation.mutate(val);
          } else {
            state.setRefetchIntervalInput(String(state.refetchIntervalData?.seconds ?? 30));
          }
        }}
        coordMaxAgeInput={state.coordMaxAgeInput}
        setCoordMaxAgeInput={state.setCoordMaxAgeInput}
        onCoordMaxAgeEndEditing={() => {
          const val = parseInt(state.coordMaxAgeInput, 10);
          if (!isNaN(val) && val >= 10) {
            state.coordMaxAgeMutation.mutate(val);
          } else {
            state.setCoordMaxAgeInput(String(state.coordMaxAgeData?.value ?? 300));
          }
        }}
        motoclubCreationEnabled={state.motoclubCreationEnabled}
        onMotoclubCreationToggle={(val) => state.motoclubCreationMutation.mutate(val)}
        motoclubCreationPending={state.motoclubCreationMutation.isPending}
        matchingTriggerFeedback={state.matchingTriggerFeedback}
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
