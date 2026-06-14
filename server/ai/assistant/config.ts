// Task #2698 — Helpers per leggere/scrivere config AI Assistant da app_settings.
// Chiavi namespaced: ai_assistant.<platform>.{enabled,modes.*,actions.<id>,proactive.<ruleId>}
import { storage } from "../../storage";
import { ASSISTANT_ACTIONS, type AssistantActionId } from "./actions";

export type AssistantPlatform = "android" | "ios";
export const PROACTIVE_RULES = [
  "fake-position-long-active",
  "first-map-access",
  "gps-off-during-tracking",
  "long-ride-no-pause",
  "ghost-mode-long-active",
] as const;
export type ProactiveRuleId = typeof PROACTIVE_RULES[number];

export interface AssistantPlatformConfig {
  enabled: boolean;
  modes: {
    fab: boolean;
    selective: boolean;
    onboarding: boolean;
  };
  actions: Record<AssistantActionId, boolean>;
  proactive: Record<ProactiveRuleId, boolean>;
  customFaqKeys: string[]; // chiavi i18n dinamiche per FAQ runtime editabili
}

const DEFAULT_CONFIG: AssistantPlatformConfig = {
  enabled: true,
  modes: { fab: true, selective: false, onboarding: true },
  actions: Object.fromEntries(
    Object.keys(ASSISTANT_ACTIONS).map((id) => [id, true]),
  ) as Record<AssistantActionId, boolean>,
  proactive: Object.fromEntries(
    PROACTIVE_RULES.map((r) => [r, true]),
  ) as Record<ProactiveRuleId, boolean>,
  customFaqKeys: [],
};

export function settingKey(platform: AssistantPlatform): string {
  return `ai_assistant.${platform}`;
}

export async function loadAssistantConfig(platform: AssistantPlatform): Promise<AssistantPlatformConfig> {
  const row = await storage.getAppSetting(settingKey(platform));
  const raw = (row?.valueJson ?? null) as Partial<AssistantPlatformConfig> | null;
  if (!raw) return { ...DEFAULT_CONFIG };
  return {
    enabled: !!raw.enabled,
    modes: { ...DEFAULT_CONFIG.modes, ...(raw.modes ?? {}) },
    actions: { ...DEFAULT_CONFIG.actions, ...(raw.actions ?? {}) },
    proactive: { ...DEFAULT_CONFIG.proactive, ...(raw.proactive ?? {}) },
    customFaqKeys: Array.isArray(raw.customFaqKeys) ? raw.customFaqKeys.slice(0, 50) : [],
  };
}

export async function saveAssistantConfig(
  platform: AssistantPlatform,
  config: AssistantPlatformConfig,
): Promise<AssistantPlatformConfig> {
  await storage.upsertAppSetting(settingKey(platform), undefined, config);
  return config;
}

export function resolveClientPlatform(raw: string | undefined): AssistantPlatform {
  // Web eredita config Android per default.
  if (raw === "ios") return "ios";
  return "android";
}
