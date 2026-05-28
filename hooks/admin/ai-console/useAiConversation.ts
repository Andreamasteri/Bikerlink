// Task #2641 — Carica conversazioni admin + messaggi di una conversazione.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/query-client";

export interface AiConversationSummary {
  id: string;
  title: string | null;
  scopesHint: string[] | null;
  summary: string | null;
  lastMessageAt: string;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AiMessageRow {
  id: string;
  conversationId: string;
  role: "user" | "assistant" | "tool" | "system" | "router";
  content: string;
  scopes: string[] | null;
  toolCalls: Array<{ name: string; args?: unknown; result?: unknown; durationMs?: number }> | null;
  entities: Record<string, string[]> | null;
  model: string | null;
  provider: string | null;
  tokensIn: number;
  tokensOut: number;
  costUsd: string;
  createdAt: string;
}

export function useAiConversations() {
  return useQuery<{ conversations: AiConversationSummary[] }>({
    queryKey: ["/api/admin/ai/console/conversations"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/admin/ai/console/conversations?limit=50");
      return res.json();
    },
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
}

export function useAiConversationMessages(id: string | null) {
  return useQuery<{ conversation: AiConversationSummary; messages: AiMessageRow[] }>({
    queryKey: ["/api/admin/ai/console/conversations", id, "messages"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/admin/ai/console/conversations/${id}/messages`);
      return res.json();
    },
    enabled: !!id,
    staleTime: 5_000,
  });
}

export function useArchiveConversation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("DELETE", `/api/admin/ai/console/conversations/${id}`);
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/ai/console/conversations"] });
    },
  });
}
