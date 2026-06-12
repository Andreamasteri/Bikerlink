// Task #3894 — Hook raccolta bug FAB: fetch consolidato + badge unseen via AsyncStorage.
import { useQuery } from "@tanstack/react-query";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useState } from "react";

const SEEN_KEY = "admin:bug-fab:last-seen";

export interface BugItem {
  id: string;
  source: "crash" | "signal" | "watchdog";
  severity: "high" | "critical";
  title: string;
  message: string;
  detail: string;
  createdAt: string;
}

export interface BugReportData {
  items: BugItem[];
  total: number;
}

export function useBugReport() {
  const [lastSeen, setLastSeen] = useState<string | null>(null);
  const [seenLoaded, setSeenLoaded] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(SEEN_KEY)
      .then((v) => {
        setLastSeen(v ?? null);
        setSeenLoaded(true);
      })
      .catch(() => setSeenLoaded(true));
  }, []);

  const query = useQuery<BugReportData>({
    queryKey: ["/api/admin/bug-report/recent"],
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  const unseenCount = (() => {
    if (!seenLoaded || !query.data?.items) return 0;
    if (!lastSeen) return query.data.items.length;
    return query.data.items.filter(
      (i) => new Date(i.createdAt) > new Date(lastSeen),
    ).length;
  })();

  const markSeen = useCallback(() => {
    const now = new Date().toISOString();
    setLastSeen(now);
    AsyncStorage.setItem(SEEN_KEY, now).catch(() => {
      /* skip */
    });
  }, []);

  return { query, unseenCount, markSeen };
}

export function formatBugReportClipboard(items: BugItem[]): string {
  const now = new Date().toLocaleString("it-IT", { timeZone: "Europe/Rome" });
  const lines: string[] = [
    `=== BikerLink Bug Report ===`,
    `Generato: ${now}`,
    `Totale errori: ${items.length}`,
    ``,
  ];
  for (const item of items) {
    const src = item.source === "crash"
      ? "CRASH"
      : item.source === "signal"
        ? "SIGNAL"
        : "WATCHDOG";
    const date = new Date(item.createdAt).toLocaleString("it-IT", { timeZone: "Europe/Rome" });
    lines.push(`[${src}] ${item.title}`);
    if (item.detail) lines.push(`  ${item.detail}`);
    lines.push(`  ${item.message}`);
    lines.push(`  Data: ${date}`);
    lines.push(``);
  }
  return lines.join("\n");
}
