// Task #2698 — Combina config admin + prefs utente. Admin override priorità.
// Modes admin: fab | selective | onboarding (indipendenti).
// Proattivo è separato: attivo se admin enabled + utente non ha disable totale
// e non ha disable proattivi. Le singole rule on/off restano in config.proactive.
import { useMemo } from "react";
import { useAssistantConfig } from "./useAssistantConfig";
import { useAssistantPrefs } from "./useAssistantPrefs";

export interface AssistantEnabledState {
  loading: boolean;
  adminEnabled: boolean;
  userDisabled: boolean;
  fabEnabled: boolean;
  selectiveEnabled: boolean;
  onboardingEnabled: boolean;
  proactiveEnabled: boolean;
  adminDisabledForPlatform: boolean;
  proactiveRules: Record<string, boolean>;
}

export function useAssistantEnabled(): AssistantEnabledState {
  const cfgQ = useAssistantConfig();
  const prefsQ = useAssistantPrefs();

  return useMemo<AssistantEnabledState>(() => {
    const loading = cfgQ.isLoading || prefsQ.isLoading;
    const adminEnabled = !!cfgQ.data?.config?.enabled;
    const modes = cfgQ.data?.config?.modes ?? { fab: false, selective: false, onboarding: false };
    const proactiveRules = cfgQ.data?.config?.proactive ?? {};
    const prefs = prefsQ.data?.prefs ?? {};
    const userDisabled = !!prefs.disabled;
    const baseOn = adminEnabled && !userDisabled;
    return {
      loading,
      adminEnabled,
      userDisabled,
      fabEnabled: baseOn && modes.fab,
      selectiveEnabled: baseOn && modes.selective,
      onboardingEnabled: baseOn && modes.onboarding && !prefs.onboardingDisabled,
      proactiveEnabled: baseOn && !prefs.proactiveDisabled,
      adminDisabledForPlatform: !adminEnabled,
      proactiveRules,
    };
  }, [cfgQ.data, cfgQ.isLoading, prefsQ.data, prefsQ.isLoading]);
}
