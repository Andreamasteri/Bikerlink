// Task #2657 — Pagina admin "AI Layer": overview cards (fixed 6-AI grid),
// kill switch, conflicts, policies editor, health dashboard, audit, timeline
// eventi WS push (cache auto-invalidata <2s).
// Auth lato server (admin/superadmin). Layout responsive desktop/tablet/mobile.
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { apiRequest } from "@/lib/query-client";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Platform,
  useWindowDimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import AiLayerCard from "@/components/admin/ai-layer/AiLayerCard";
import KillSwitchPanel from "@/components/admin/ai-layer/KillSwitchPanel";
import ConflictsList from "@/components/admin/ai-layer/ConflictsList";
import OverrideModal from "@/components/admin/ai-layer/OverrideModal";
import EventTimeline, { type TimelineEvent } from "@/components/admin/ai-layer/EventTimeline";
import HealthCharts from "@/components/admin/ai-layer/HealthCharts";
import PolicyEditor from "@/components/admin/ai-layer/PolicyEditor";
import AuditPanel from "@/components/admin/ai-layer/AuditPanel";
import { useAiOverview, useAiPaused } from "@/hooks/admin/ai-layer/useAiOverview";
import { useAiHealth } from "@/hooks/admin/ai-layer/useAiHealth";
import {
  useAiConflicts, useOverrideConflict, usePauseAi, useResumeAi,
  type AiConflictRow,
} from "@/hooks/admin/ai-layer/useAiConflicts";
import { useAiLayerWs } from "@/hooks/admin/ai-layer/useAiLayerWs";

type Tab = "dashboard" | "conflicts" | "policies" | "health" | "audit" | "timeline";

// Task #2657 — Le 6 AI integrate (#2654) sono mostrate sempre, anche con 0 attività.
const KNOWN_AIS = ["moderation", "watchdog", "ota-orchestrator", "db-integrity", "app-integrity", "console"] as const;

const WEB_TOP = 67;
const WEB_BOTTOM = 34;

export default function AiLayerScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isWide = width >= 900;
  const [tab, setTab] = useState<Tab>("dashboard");
  const [overrideTarget, setOverrideTarget] = useState<AiConflictRow | null>(null);
  const [events, setEvents] = useState<TimelineEvent[]>([]);

  const overview = useAiOverview(24);
  const paused = useAiPaused();
  const health = useAiHealth(24);
  const conflicts = useAiConflicts(true);
  const overrideMut = useOverrideConflict();
  const pauseMut = usePauseAi();
  const resumeMut = useResumeAi();

  // Idratazione iniziale timeline: ultimi 100 eventi da audit (placebo se 0).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await apiRequest("GET", "/api/admin/ai/audit?kind=event&limit=100");
        if (!r.ok) return;
        const j = (await r.json()) as { rows: Array<Record<string, unknown>> };
        if (cancelled) return;
        const hydrated: TimelineEvent[] = (j.rows ?? []).map((row) => ({
          id: row.id as string,
          aiName: row.aiName as string,
          eventType: (row.eventType ?? row.type) as string,
          severity: row.severity as string | undefined,
          correlationId: row.correlationId as string | undefined,
          at: (row.createdAt ?? row.at) as string | undefined,
        }));
        setEvents((prev) => {
          const seen = new Set(prev.map((e) => e.id).filter(Boolean));
          const merged = [...prev, ...hydrated.filter((e) => !e.id || !seen.has(e.id))];
          merged.sort((a, b) => (b.at ?? "").localeCompare(a.at ?? ""));
          return merged.slice(0, 200);
        });
      } catch { /* noop */ }
    })();
    return () => { cancelled = true; };
  }, []);

  // Realtime: invalidazione cache + push timeline (<2s end-to-end).
  useAiLayerWs({
    onEvent: (e) => setEvents((prev) => {
      if (e.id && prev.some((x) => x.id === e.id)) return prev;
      return [e, ...prev].slice(0, 200);
    }),
  });

  const pausedMap = useMemo(() => {
    const m = new Map<string, { ttl?: number }>();
    for (const p of paused.data?.paused ?? []) m.set(p.aiName, { ttl: p.ttl });
    return m;
  }, [paused.data]);
  const layerPaused = pausedMap.has("*");
  const layerTtl = pausedMap.get("*")?.ttl;

  // Fixed 6-AI grid: merge attività con elenco statico noto.
  const cards = useMemo(() => {
    type C = { events: number; decisions: number; criticals: number; conflictsOpen: number; lastActivityAt: string | null; lastEventType: string | null; healthScore: number };
    const byName = new Map<string, C>();
    for (const p of overview.data?.perAi ?? []) byName.set(p.aiName, p);
    return KNOWN_AIS.map((name): C => byName.get(name) ?? {
      events: 0, decisions: 0, criticals: 0, conflictsOpen: 0,
      lastActivityAt: null, lastEventType: null, healthScore: 100,
    });
  }, [overview.data]);

  const onPauseAi = useCallback(async (aiName: string) => {
    const reason = (Platform.OS === "web" && typeof window !== "undefined")
      ? window.prompt(`Motivo pausa "${aiName}" (min 3):`, "manutenzione") ?? ""
      : "pausa-admin";
    if (reason.trim().length < 3) return;
    await pauseMut.mutateAsync({ aiName, reason: reason.trim(), ttlSeconds: 3600 });
  }, [pauseMut]);

  const onResumeAi = useCallback((aiName: string) => resumeMut.mutate({ aiName }), [resumeMut]);

  const applyOverride = useCallback(async (decision: "useEventA" | "useEventB" | "custom", rationale: string) => {
    if (!overrideTarget) return;
    await overrideMut.mutateAsync({ id: overrideTarget.id, decision, rationale });
    setOverrideTarget(null);
  }, [overrideTarget, overrideMut]);

  const headerPadTop = Platform.OS === "web" ? WEB_TOP : insets.top + 8;
  const bottomPad = Platform.OS === "web" ? WEB_BOTTOM : Math.max(insets.bottom, 16);

  return (
    <View style={[styles.root, { backgroundColor: colors.background, paddingTop: headerPadTop }]}>
      <View style={styles.header}>
        <Ionicons name="layers" size={22} color={colors.primary} />
        <Text style={[styles.h1, { color: colors.text }]}>AI Layer</Text>
        <View style={{ flex: 1 }} />
        <Text style={[styles.h1Meta, { color: colors.textSecondary }]}>
          {overview.data?.totals.events ?? 0} eventi · {overview.data?.totals.criticals ?? 0} critici · {overview.data?.totals.conflictsOpen ?? 0} conflitti
        </Text>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={[styles.tabs, { borderBottomColor: colors.border }]}>
        {(["dashboard", "conflicts", "policies", "health", "audit", "timeline"] as Tab[]).map((t) => (
          <TouchableOpacity
            key={t}
            testID={`ai-layer-tab-${t}`}
            onPress={() => setTab(t)}
            style={[styles.tab, tab === t && { borderBottomColor: colors.primary }]}
          >
            <Text style={{ color: tab === t ? colors.primary : colors.textSecondary, fontWeight: "600", textTransform: "capitalize" }}>
              {t}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 14, paddingBottom: bottomPad + 24 }}
      >
        {tab === "dashboard" ? (
          <>
            <KillSwitchPanel
              layerPaused={layerPaused}
              ttl={layerTtl}
              busy={pauseMut.isPending || resumeMut.isPending}
              onPause={(reason, ttlSeconds) => pauseMut.mutate({ aiName: "*", reason, ttlSeconds })}
              onResume={() => resumeMut.mutate({ aiName: "*" })}
            />
            <View style={isWide ? styles.grid : undefined}>
              {KNOWN_AIS.map((aiName, idx) => {
                const p = cards[idx];
                const pinfo = pausedMap.get(aiName);
                return (
                  <View key={aiName} style={isWide ? styles.cell : undefined}>
                    <AiLayerCard
                      aiName={aiName}
                      events={p.events}
                      decisions={p.decisions}
                      criticals={p.criticals}
                      conflictsOpen={p.conflictsOpen}
                      lastActivityAt={p.lastActivityAt}
                      lastEventType={p.lastEventType}
                      healthScore={p.healthScore}
                      paused={Boolean(pinfo) || layerPaused}
                      pausedTtl={pinfo?.ttl}
                      onPause={() => onPauseAi(aiName)}
                      onResume={() => onResumeAi(aiName)}
                    />
                  </View>
                );
              })}
            </View>
          </>
        ) : null}

        {tab === "conflicts" ? (
          <ConflictsList
            conflicts={conflicts.data?.conflicts ?? []}
            loading={conflicts.isLoading}
            onOverride={setOverrideTarget}
          />
        ) : null}

        {tab === "policies" ? <PolicyEditor /> : null}

        {tab === "health" ? <HealthCharts health={health.data} /> : null}

        {tab === "audit" ? <AuditPanel /> : null}

        {tab === "timeline" ? <EventTimeline events={events} /> : null}
      </ScrollView>

      <OverrideModal
        conflict={overrideTarget}
        busy={overrideMut.isPending}
        onClose={() => setOverrideTarget(null)}
        onSubmit={applyOverride}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 8, gap: 8 },
  h1: { fontSize: 20, fontWeight: "700" },
  h1Meta: { fontSize: 11 },
  tabs: { flexGrow: 0, borderBottomWidth: 1, paddingHorizontal: 8 },
  tab: { paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 2, borderBottomColor: "transparent" },
  grid: { flexDirection: "row", flexWrap: "wrap", marginHorizontal: -6 },
  cell: { width: "50%", paddingHorizontal: 6 },
});
