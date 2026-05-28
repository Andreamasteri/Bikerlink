// Task #2698 — Carica config piattaforma per AI Assistant.
import { useQuery } from "@tanstack/react-query";
import { Platform } from "react-native";
import type { AssistantConfigResponse } from "@/lib/ai-assistant/types";

export function currentAssistantPlatform(): "android" | "ios" {
  return Platform.OS === "ios" ? "ios" : "android";
}

export function useAssistantConfig() {
  const platform = currentAssistantPlatform();
  return useQuery<AssistantConfigResponse>({
    queryKey: ["/api/ai/assistant/config", { platform }],
    staleTime: 5 * 60 * 1000,
  });
}
