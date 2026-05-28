// Task #2698 — Telemetria client (best-effort, no throw).
// I beacon UI sono mandati al server via endpoint apposito per consolidare la
// tabella ai_assistant_telemetry con eventi originati dal client.
import { apiRequest } from "@/lib/query-client";
import { currentAssistantPlatform } from "@/hooks/useAssistantConfig";
import { Platform } from "react-native";

export type AssistantClientEvent =
  | "tip_shown"
  | "tip_dismissed"
  | "tip_disabled_permanent"
  | "onboarding_started"
  | "onboarding_completed"
  | "conversation_started";

export async function logAssistantClientEvent(eventType: AssistantClientEvent, payload?: Record<string, unknown>): Promise<void> {
  try {
    const platform = Platform.OS === "web" ? "web" : currentAssistantPlatform();
    await apiRequest("POST", "/api/ai/assistant/telemetry", {
      eventType,
      platform,
      payload: payload ?? {},
    });
  } catch {
    // no-op: telemetry is best-effort
  }
}
