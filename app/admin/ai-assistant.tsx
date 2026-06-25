// Task #2698 — Pannello admin "AI Assistant Utenti". Tabs Android/iOS,
// configurazione master + modes + actions + proactive rules + telemetria.
import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Switch, Pressable, ActivityIndicator, Alert } from "react-native";
import { Stack } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { apiRequest } from "@/lib/query-client";

const AI_ASSISTANT_SCREEN_OPTIONS = { headerShown: false } as const;

type Platform = "android" | "ios";

interface PlatformConfig {
  enabled: boolean;
  modes: { fab: boolean; selective: boolean; onboarding: boolean };
  actions: Record<string, boolean>;
  proactive: Record<string, boolean>;
  customFaqKeys: string[];
}

interface AdminConfig {
  android: PlatformConfig;
  ios: PlatformConfig;
}

interface AdminMeta {
  actions: Array<{ id: string; description: string }>;
  proactiveRules: Array<{ id: string; description: string }>;
}

interface TelemetrySummary {
  messages: number;
  actions: number;
  tipsShown: number;
}

// Combina le due risposte per-piattaforma dell'endpoint admin ({ platform,
// config }) in un unico AdminConfig { android, ios }. La GET admin restituisce
// UNA piattaforma per volta, quindi ogni risposta espone la propria `config`.
// Mappare la config sbagliata sulla piattaforma sbagliata, o restituire un
// oggetto senza `android`/`ios`, faceva diventare `cur` undefined → spinner
// infinito (schermata bianca). Esportata per essere coperta da test.
export function combineAssistantAdminConfig(
  android: { config: PlatformConfig },
  ios: { config: PlatformConfig },
): { config: AdminConfig } {
  return { config: { android: android.config, ios: ios.config } };
}

// Costruisce le richieste PUT di salvataggio: una per piattaforma, con la
// config di piattaforma come body DIRETTO (non wrappato in { config }). Il
// server PUT salva una piattaforma per volta e si aspetta il body grezzo;
// wrapparlo in { config } salverebbe una struttura errata. Esportata per test.
export function buildAssistantSaveRequests(
  cfg: AdminConfig,
): Array<{ platform: Platform; body: PlatformConfig }> {
  return [
    { platform: "android", body: cfg.android },
    { platform: "ios", body: cfg.ios },
  ];
}

export default function AiAssistantAdminScreen() {
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const [tab, setTab] = useState<Platform>("android");

  // L'endpoint admin restituisce la config di UNA piattaforma per volta
  // ({ platform, config }). La UI invece ragiona su entrambe (tab Android/iOS),
  // quindi carichiamo le due piattaforme in parallelo e le combiniamo in un
  // unico AdminConfig. Senza questo, `config.android`/`config.ios` erano
  // undefined → `cur` undefined → spinner infinito (schermata bianca).
  const cfgQ = useQuery<{ config: AdminConfig }>({
    queryKey: ["/api/admin/ai/assistant/config"],
    queryFn: async () => {
      const [android, ios] = await Promise.all([
        apiRequest("GET", "/api/admin/ai/assistant/config?platform=android").then((r) => r.json()),
        apiRequest("GET", "/api/admin/ai/assistant/config?platform=ios").then((r) => r.json()),
      ]);
      return combineAssistantAdminConfig(android, ios);
    },
    staleTime: 15_000,
  });
  const metaQ = useQuery<AdminMeta>({
    queryKey: ["/api/admin/ai/assistant/meta"],
    queryFn: async () => (await apiRequest("GET", "/api/admin/ai/assistant/meta")).json(),
    staleTime: 5 * 60_000,
  });
  const telQ = useQuery<TelemetrySummary>({
    queryKey: ["/api/admin/ai/assistant/telemetry"],
    queryFn: async () => (await apiRequest("GET", "/api/admin/ai/assistant/telemetry")).json(),
    staleTime: 30_000,
  });

  const [draft, setDraft] = useState<AdminConfig | null>(null);
  useEffect(() => { if (cfgQ.data?.config && !draft) setDraft(cfgQ.data.config); }, [cfgQ.data?.config, draft]);

  const save = useMutation({
    mutationFn: async (cfg: AdminConfig) => {
      // L'endpoint PUT salva UNA piattaforma per volta: il body è la config di
      // piattaforma (non { config }) e la piattaforma va nel query param.
      for (const { platform, body } of buildAssistantSaveRequests(cfg)) {
        await apiRequest("PUT", `/api/admin/ai/assistant/config?platform=${platform}`, body);
      }
      return { ok: true };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/ai/assistant/config"] });
      qc.invalidateQueries({ queryKey: ["/api/ai/assistant/config"] });
      Alert.alert("OK", "Configurazione salvata.");
    },
    onError: (e: Error) => Alert.alert("Errore", e.message),
  });

  const cur = draft?.[tab];
  const setPlatform = (patch: Partial<PlatformConfig>) => {
    if (!draft) return;
    setDraft({ ...draft, [tab]: { ...draft[tab], ...patch } });
  };
  const setMode = (key: keyof PlatformConfig["modes"], v: boolean) => {
    if (!cur) return;
    setPlatform({ modes: { ...cur.modes, [key]: v } });
  };
  const setAction = (id: string, v: boolean) => {
    if (!cur) return;
    setPlatform({ actions: { ...cur.actions, [id]: v } });
  };
  const setProactive = (id: string, v: boolean) => {
    if (!cur) return;
    setPlatform({ proactive: { ...cur.proactive, [id]: v } });
  };

  const isLoading = cfgQ.isLoading || metaQ.isLoading || !cur;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <Stack.Screen options={AI_ASSISTANT_SCREEN_OPTIONS} />
      <View style={styles.header}>
        <Text style={styles.title}>AI Assistant Utenti</Text>
        <Text style={styles.subtitle}>Config per piattaforma (Android / iOS).</Text>
      </View>

      <View style={styles.tabs}>
        {(["android", "ios"] as Platform[]).map((p) => (
          <Pressable
            key={p}
            testID={`admin-aia-tab-${p}`}
            onPress={() => setTab(p)}
            style={[styles.tab, tab === p && styles.tabActive]}
          >
            <Ionicons name={p === "ios" ? "logo-apple" : "logo-android"} size={16} color={tab === p ? Colors.background : Colors.text} />
            <Text style={[styles.tabText, tab === p && styles.tabTextActive]}>{p === "ios" ? "iOS" : "Android"}</Text>
          </Pressable>
        ))}
      </View>

      {isLoading ? (
        <View style={styles.loader}><ActivityIndicator /></View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 80 }}>
          <Section title="Master switch">
            <Row
              label="Assistente abilitato"
              hint="Master switch: spento, nessun utente vedrà l'assistente."
              value={cur!.enabled}
              onChange={(v) => setPlatform({ enabled: v })}
              testID="admin-aia-master"
            />
          </Section>

          <Section title="Modalità di presentazione">
            <Row label="FAB globale fluttuante" value={cur!.modes.fab} onChange={(v) => setMode("fab", v)} testID="admin-aia-mode-fab" />
            <Row label="Solo schermate chiave" hint="Home, mappa, profilo." value={cur!.modes.selective} onChange={(v) => setMode("selective", v)} testID="admin-aia-mode-selective" />
            <Row label="Tour onboarding al primo avvio" value={cur!.modes.onboarding} onChange={(v) => setMode("onboarding", v)} testID="admin-aia-mode-onboarding" />
          </Section>

          <Section title="Azioni whitelisted">
            {(metaQ.data?.actions ?? []).map((a) => (
              <Row
                key={a.id}
                label={a.id}
                hint={a.description}
                value={cur!.actions[a.id] ?? false}
                onChange={(v) => setAction(a.id, v)}
                testID={`admin-aia-action-${a.id}`}
              />
            ))}
          </Section>

          <Section title="Suggerimenti proattivi">
            {(metaQ.data?.proactiveRules ?? []).map((r) => (
              <Row
                key={r.id}
                label={r.id}
                hint={r.description}
                value={cur!.proactive[r.id] ?? false}
                onChange={(v) => setProactive(r.id, v)}
                testID={`admin-aia-proactive-${r.id}`}
              />
            ))}
          </Section>

          <Section title="Telemetria (30 giorni)">
            {telQ.isLoading ? <ActivityIndicator /> : (
              <View style={styles.telRow}>
                <TelCell label="Messaggi" value={telQ.data?.messages ?? 0} />
                <TelCell label="Azioni" value={telQ.data?.actions ?? 0} />
                <TelCell label="Tips" value={telQ.data?.tipsShown ?? 0} />
              </View>
            )}
          </Section>

          <Pressable
            testID="admin-aia-save"
            disabled={save.isPending}
            onPress={() => draft && save.mutate(draft)}
            style={[styles.saveBtn, save.isPending && { opacity: 0.6 }]}
          >
            {save.isPending ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveText}>Salva configurazione</Text>}
          </Pressable>
        </ScrollView>
      )}
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function Row({ label, hint, value, onChange, testID }: { label: string; hint?: string; value: boolean; onChange: (v: boolean) => void; testID?: string }) {
  return (
    <View style={styles.row}>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowLabel}>{label}</Text>
        {hint ? <Text style={styles.rowHint}>{hint}</Text> : null}
      </View>
      <Switch value={value} onValueChange={onChange} testID={testID} />
    </View>
  );
}

function TelCell({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.telCell}>
      <Text style={styles.telValue}>{value}</Text>
      <Text style={styles.telLabel}>{label}</Text>
    </View>
  );
}

const C = Colors as unknown as { background: string; surface: string; text: string; textSecondary: string; primary: string; accent: string; border: string };
// Colors export typed alias for stylesheet
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.background ?? "#0D0D0D" },
  header: { padding: 16 },
  title: { fontSize: 22, fontWeight: "700", color: C.text ?? "#fff" },
  subtitle: { fontSize: 13, color: C.textSecondary ?? "#aaa", marginTop: 4 },
  tabs: { flexDirection: "row", paddingHorizontal: 16, gap: 8, marginBottom: 8 },
  tab: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 16,
    backgroundColor: C.surface ?? "#1E1E1E",
  },
  tabActive: { backgroundColor: C.accent ?? "#FF6600" },
  tabText: { color: C.text ?? "#fff", fontWeight: "600" },
  tabTextActive: { color: C.background ?? "#0D0D0D" },
  loader: { flex: 1, alignItems: "center", justifyContent: "center" },
  section: {
    backgroundColor: C.surface ?? "#1E1E1E",
    padding: 14, borderRadius: 12, marginBottom: 14,
  },
  sectionTitle: { fontSize: 15, fontWeight: "700", color: C.text ?? "#fff", marginBottom: 8 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 8 },
  rowLabel: { fontSize: 14, color: C.text ?? "#fff", fontWeight: "500" },
  rowHint: { fontSize: 12, color: C.textSecondary ?? "#888", marginTop: 2 },
  telRow: { flexDirection: "row", gap: 12, justifyContent: "space-around" },
  telCell: { alignItems: "center", padding: 8 },
  telValue: { fontSize: 22, fontWeight: "700", color: C.accent ?? "#FF6600" },
  telLabel: { fontSize: 12, color: C.textSecondary ?? "#aaa", marginTop: 4 },
  saveBtn: {
    backgroundColor: C.accent ?? "#FF6600",
    padding: 14, borderRadius: 10, alignItems: "center", marginTop: 8,
  },
  saveText: { color: "#fff", fontWeight: "700", fontSize: 15 },
});
