// Task #2645 — Hook lista/pin/unpin insight nella knowledge base AI Console.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/query-client";

export interface AiPinnedRow {
  id: string;
  conversationId: string | null;
  messageId: string | null;
  scope: string | null;
  title: string;
  body: string;
  pinnedBy: string | null;
  pinnedByNickname?: string | null;
  createdAt: string;
}

export function useAiPinned() {
  return useQuery<{ pinned: AiPinnedRow[] }>({
    queryKey: ["/api/admin/ai/console/pinned"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/admin/ai/console/pinned?limit=200");
      return res.json();
    },
    staleTime: 30_000,
  });
}

export function usePinMessage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { conversationId: string; messageId: string; title?: string; note?: string }) => {
      const res = await apiRequest(
        "POST",
        `/api/admin/ai/console/conversations/${args.conversationId}/pin/${args.messageId}`,
        { title: args.title, note: args.note },
      );
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/admin/ai/console/pinned"] }),
  });
}

export function useUnpinInsight() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("DELETE", `/api/admin/ai/console/pinned/${id}`);
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/admin/ai/console/pinned"] }),
  });
}
