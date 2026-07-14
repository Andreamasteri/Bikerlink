// Task #8 — Consuma il roster server (agenti configurati/raggiungibili). L'elenco
// mostrato/usato dalla UI dipende da questo, NON da una lista hardcoded nel
// componente. Se l'endpoint non è ancora disponibile (#4 non ancora rilasciato)
// o non risponde, degrada all'elenco noto senza crashare. Nessun contratto
// server è definito qui: la UI lo consuma soltanto.
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/query-client";
import { KNOWN_ASSISTANT_PERSONAS, type AssistantRosterEntry } from "@/lib/ai-assistant/roster";

interface RosterResponse {
  personas?: AssistantRosterEntry[];
}

function normalize(json: unknown): AssistantRosterEntry[] {
  const list = Array.isArray(json) ? json : (json as RosterResponse | null)?.personas;
  if (!Array.isArray(list)) return [];
  return list.filter(
    (p): p is AssistantRosterEntry =>
      !!p && typeof p.id === "string" && typeof p.name === "string",
  );
}

export function useAssistantRoster(enabled = true): {
  personas: AssistantRosterEntry[];
  isFallback: boolean;
} {
  const q = useQuery<AssistantRosterEntry[]>({
    queryKey: ["/api/ai/assistant/roster"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/ai/assistant/roster");
      const parsed = normalize(await res.json());
      if (parsed.length === 0) throw new Error("roster vuoto o non valido");
      return parsed;
    },
    enabled,
    retry: false,
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
  const hasData = !!q.data && q.data.length > 0;
  return {
    personas: hasData ? (q.data as AssistantRosterEntry[]) : KNOWN_ASSISTANT_PERSONAS,
    isFallback: !hasData,
  };
}
