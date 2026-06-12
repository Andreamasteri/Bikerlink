// Task #3894 — Hook raccolta bug FAB: fetch consolidato + badge unseen condiviso via React Query.
import { useQuery, useQueryClient } from "@tanstack/react-query";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback } from "react";

const SEEN_STORAGE_KEY = "admin:bug-fab:last-seen";
const SEEN_QUERY_KEY = ["admin:bug-fab:last-seen"] as const;

export interface BugItem {
  id: string;
  source: "crash" | "signal" | "watchdog";
  severity: "high" | "critical";
  title: string;
  message: string;
  detail: string;
  count: number;
  createdAt: string;
}

export interface BugReportData {
  items: BugItem[];
  total: number;
}

/** Condiviso tra FabWidget e FabDrawer tramite React Query cache */
function useLastSeen() {
  const queryClient = useQueryClient();

  const { data: lastSeen } = useQuery<string | null>({
    queryKey: SEEN_QUERY_KEY,
    queryFn: () => AsyncStorage.getItem(SEEN_STORAGE_KEY),
    staleTime: Infinity,
    gcTime: Infinity,
  });

  const markSeen = useCallback(() => {
    const now = new Date().toISOString();
    // setQueryData aggiorna TUTTE le istanze iscritte (FabWidget + FabDrawer)
    queryClient.setQueryData(SEEN_QUERY_KEY, now);
    AsyncStorage.setItem(SEEN_STORAGE_KEY, now).catch(() => {
      /* skip */
    });
  }, [queryClient]);

  return { lastSeen: lastSeen ?? null, markSeen };
}

export function useBugReport() {
  const { lastSeen, markSeen } = useLastSeen();

  const query = useQuery<BugReportData>({
    queryKey: ["/api/admin/bug-report/recent"],
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  const unseenCount = (() => {
    if (lastSeen === undefined) return 0;
    if (!query.data?.items) return 0;
    if (!lastSeen) return query.data.items.length;
    return query.data.items.filter(
      (i) => new Date(i.createdAt) > new Date(lastSeen),
    ).length;
  })();

  return { query, unseenCount, markSeen };
}

/** Timestamp relativo in italiano */
export function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "ora";
  if (mins < 60) return `${mins}m fa`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h fa`;
  const days = Math.floor(hours / 24);
  return `${days}g fa`;
}

/** Tronca a max N caratteri con ellissi */
function trunc(s: string, max = 80): string {
  return s.length > max ? s.slice(0, max) + "…" : s;
}

/** Formato clipboard: raggruppato per sorgente, max 5 per gruppo */
export function formatBugReportClipboard(items: BugItem[]): string {
  const date = new Date().toLocaleDateString("it-IT");
  const lines: string[] = [`[BikerLink Bug Report - ${date}]`, ``];

  const crashes = items.filter((i) => i.source === "crash").slice(0, 5);
  const signals = items.filter((i) => i.source === "signal").slice(0, 5);
  const watchdog = items.filter((i) => i.source === "watchdog").slice(0, 5);

  if (crashes.length) {
    lines.push("## Crash:");
    for (const c of crashes) {
      const countStr = c.count > 1 ? ` (×${c.count})` : "";
      lines.push(`• CRASH [${c.severity.toUpperCase()}]${countStr} ${trunc(c.title)}: ${trunc(c.message)}`);
      if (c.detail) lines.push(`  ${c.detail}`);
    }
    lines.push("");
  }
  if (signals.length) {
    lines.push("## Segnali sistema:");
    for (const s of signals) {
      const countStr = s.count > 1 ? ` (×${s.count})` : "";
      lines.push(`• SERVER [${s.severity.toUpperCase()}]${countStr} ${trunc(s.message)}`);
    }
    lines.push("");
  }
  if (watchdog.length) {
    lines.push("## AI Watchdog:");
    for (const w of watchdog) {
      const countStr = w.count > 1 ? ` (×${w.count})` : "";
      lines.push(`• AI [${w.severity.toUpperCase()}]${countStr} ${trunc(w.title)}: ${trunc(w.message)}`);
    }
    lines.push("");
  }

  if (items.length === 0) lines.push("Nessun errore recente. ✅");

  return lines.join("\n");
}
