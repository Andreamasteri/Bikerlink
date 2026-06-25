// Task #2698 — Carica config piattaforma per AI Assistant.
import { useQuery } from "@tanstack/react-query";
import { Platform } from "react-native";
import { apiRequest } from "@/lib/query-client";
import type { AssistantConfigResponse } from "@/lib/ai-assistant/types";

export function currentAssistantPlatform(): "android" | "ios" {
  return Platform.OS === "ios" ? "ios" : "android";
}

export function useAssistantConfig() {
  const platform = currentAssistantPlatform();
  return useQuery<AssistantConfigResponse>({
    // queryKey con stringa (non oggetto) — il fetcher default fa queryKey.join("/")
    // quindi { platform } diventava "[object Object]" → URL sbagliato → 404.
    // Con platform come stringa il prefix-match di invalidateQueries funziona ancora:
    //   invalidateQueries({ queryKey: ["/api/ai/assistant/config"] })
    //   matcha ["/api/ai/assistant/config", "android"] e ["/api/ai/assistant/config", "ios"].
    queryKey: ["/api/ai/assistant/config", platform],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/ai/assistant/config?platform=${platform}`);
      return res.json() as Promise<AssistantConfigResponse>;
    },
    staleTime: 5 * 60 * 1000,
  });
}
