/**
 * Task #2664 — Hub AI.
 *
 * Dashboard di ingresso al gruppo "AI" del pannello admin: raccoglie in
 * un'unica schermata tutte le viste AI sparse (Console, Pinned, Layer,
 * Watchdog, Co-Pilot moderazione, Integrity). Stile e layout sulla falsariga
 * di `reports-hub.tsx` / `matching-hub.tsx`. Badge contatori riutilizzano
 * gli hooks esistenti senza nuove API.
 */
import React from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import type { Href } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import Colors from "@/constants/colors";
import { apiRequest, getApiUrl, authFetchHeaders } from "@/lib/query-client";
import { useAiActionQueue } from "@/hooks/admin/ai-console/useAiActionQueue";
import { useAiAlertsState } from "@/hooks/admin/ai-console/useAiAlerts";
import { useAiPinned } from "@/hooks/admin/ai-console/useAiPinned";

interface OllamaTestResult {
  configured: boolean;
  model: string;
  url: string | null;
  token_configured: boolean;
  latency_ms: number | null;
  ok: boolean;
  reply?: string | null;
  error?: string;
}

function OllamaStatusCard() {
  const [result, setResult] = React.useState<OllamaTestResult | null>(null);
  const [loading, setLoading] = React.useState(false);

  const runTest = async () => {
    setLoading(true);
    try {
      const url = new URL("/api/admin/ai/test-ollama", getApiUrl()).toString();
      const res = await fetch(url, {
        headers: authFetchHeaders(),
        credentials: "include",
      });
      const data: OllamaTestResult = await res.json();
      setResult(data);
    } catch {
      setResult(null);
    } finally {
      setLoading(false);
    }
  };

  const badgeColor = !result
    ? Colors.textSecondary
    : !result.configured
      ? Colors.textSecondary
      : result.ok
        ? Colors.success
        : Colors.error;

  const badgeLabel = !result
    ? "—"
    : !result.configured
      ? "NON CONFIG."
      : result.ok
        ? "ONLINE"
        : "OFFLINE";

  const badgeIcon: keyof typeof MaterialCommunityIcons.glyphMap = !result
    ? "circle-outline"
    : !result.configured
      ? "circle-off-outline"
      : result.ok
        ? "check-circle-outline"
        : "alert-circle-outline";

  return (
    <View style={ollamaStyles.card}>
      <View style={ollamaStyles.header}>
        <View style={ollamaStyles.headerLeft}>
          <MaterialCommunityIcons name="brain" size={20} color="#FF6600" />
          <Text style={ollamaStyles.title}>Ollama AI Server</Text>
        </View>
        <View style={ollamaStyles.headerRight}>
          {result && (
            <View style={[ollamaStyles.badge, { borderColor: badgeColor, backgroundColor: badgeColor + "22" }]}>
              <MaterialCommunityIcons name={badgeIcon} size={12} color={badgeColor} />
              <Text style={[ollamaStyles.badgeText, { color: badgeColor }]}>{badgeLabel}</Text>
            </View>
          )}
          <TouchableOpacity
            style={[ollamaStyles.testBtn, loading && ollamaStyles.testBtnDisabled]}
            onPress={runTest}
            disabled={loading}
            activeOpacity={0.7}
          >
            {loading ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <MaterialCommunityIcons name="play-circle-outline" size={14} color="#fff" />
                <Text style={ollamaStyles.testBtnText}>Test</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </View>

      {result && (
        <View style={ollamaStyles.body}>
          <View style={ollamaStyles.row}>
            <Text style={ollamaStyles.label}>Modello</Text>
            <Text style={ollamaStyles.value}>{result.model}</Text>
          </View>
          {result.url && (
            <View style={ollamaStyles.row}>
              <Text style={ollamaStyles.label}>URL</Text>
              <Text style={ollamaStyles.value}>{result.url}</Text>
            </View>
          )}
          <View style={ollamaStyles.row}>
            <Text style={ollamaStyles.label}>Token</Text>
            <Text style={ollamaStyles.value}>{result.token_configured ? "Configurato" : "Assente"}</Text>
          </View>
          {result.latency_ms != null && (
            <View style={ollamaStyles.row}>
              <Text style={ollamaStyles.label}>Latenza</Text>
              <Text style={[ollamaStyles.value, { color: result.ok ? Colors.success : Colors.error }]}>
                {result.latency_ms} ms
              </Text>
            </View>
          )}
          {!result.configured && (
            <Text style={ollamaStyles.hint}>
              Imposta OLLAMA_URL nelle variabili d'ambiente per abilitare il provider AI self-hosted.
            </Text>
          )}
          {result.configured && !result.ok && result.error && (
            <View style={ollamaStyles.errorBox}>
              <MaterialCommunityIcons name="alert-circle-outline" size={13} color={Colors.error} />
              <Text style={ollamaStyles.errorText} numberOfLines={3}>{result.error}</Text>
            </View>
          )}
          {result.configured && result.ok && result.reply && (
            <View style={ollamaStyles.replyBox}>
              <MaterialCommunityIcons name="message-check-outline" size={13} color={Colors.success} />
              <Text style={ollamaStyles.replyText}>{result.reply}</Text>
            </View>
          )}
        </View>
      )}

      {!result && (
        <Text style={ollamaStyles.hint}>
          Premi Test per verificare la raggiungibilità del server Ollama (route parsing + traduzioni).
        </Text>
      )}
    </View>
  );
}

const ollamaStyles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 16,
    overflow: "hidden",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 14,
  },
  headerLeft: { flexDirection: "row", alignItems: "center", gap: 8, flex: 1 },
  headerRight: { flexDirection: "row", alignItems: "center", gap: 8 },
  title: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: Colors.text },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  badgeText: { fontFamily: "Inter_700Bold", fontSize: 10, letterSpacing: 0.3 },
  testBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: Colors.accent,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    minWidth: 62,
    justifyContent: "center",
  },
  testBtnDisabled: { opacity: 0.6 },
  testBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 12, color: "#fff" },
  body: {
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    padding: 14,
    gap: 8,
  },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  label: { fontFamily: "Inter_400Regular", fontSize: 13, color: Colors.textSecondary },
  value: { fontFamily: "Inter_500Medium", fontSize: 13, color: Colors.text, flexShrink: 1, textAlign: "right" },
  hint: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: Colors.textSecondary,
    paddingHorizontal: 14,
    paddingBottom: 12,
    lineHeight: 18,
  },
  errorBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
    backgroundColor: Colors.error + "15",
    borderRadius: 8,
    padding: 8,
    marginTop: 4,
  },
  errorText: { fontFamily: "Inter_400Regular", fontSize: 12, color: Colors.error, flex: 1, lineHeight: 17 },
  replyBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: Colors.success + "15",
    borderRadius: 8,
    padding: 8,
    marginTop: 4,
  },
  replyText: { fontFamily: "Inter_400Regular", fontSize: 12, color: Colors.success, flex: 1 },
});

interface AiHubCardData {
  state: "ok" | "warn" | "frozen";
  budgetPct: number;
}

interface AiHubCard {
  key: string;
  label: string;
  subtitle: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  route: string;
  color: string;
  badge?: number;
}

export default function AiHubScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const actions = useAiActionQueue();
  const alerts = useAiAlertsState();
  const pinned = useAiPinned();

  const budgetCard = useQuery<AiHubCardData>({
    queryKey: ["/api/admin/ai/hub-card"],
    queryFn: async () => (await apiRequest("GET", "/api/admin/ai/hub-card")).json(),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  const budgetState = budgetCard.data?.state;
  const budgetPct = budgetCard.data?.budgetPct ?? 0;
  const showBudgetBanner = budgetState === "warn" || budgetState === "frozen";
  const budgetBannerColor = budgetState === "frozen" ? Colors.error : Colors.warning;
  const budgetBannerIcon: keyof typeof MaterialCommunityIcons.glyphMap =
    budgetState === "frozen" ? "alert-octagon" : "alert";
  const budgetBannerTitle = budgetState === "frozen"
    ? "Budget AI mensile esaurito"
    : `Budget AI mensile al ${Math.round(budgetPct * 100)}%`;
  const budgetBannerSubtitle = budgetState === "frozen"
    ? "Le AI sono in pausa fino al reset. Tocca per vedere i dettagli."
    : "Sopra la soglia dell'80%. Tocca per vedere i dettagli.";

  const pendingActions = actions.data?.total ?? 0;
  const unreadAlerts = alerts.unread ?? 0;
  const pinnedCount = pinned.data?.pinned?.length ?? 0;

  const cards: AiHubCard[] = [
    {
      key: "ai-console",
      label: "AI Console",
      subtitle: "Chat unificata con tutte le AI",
      icon: "robot-outline",
      route: "/admin/ai-console",
      color: "#FF6600",
      badge: pendingActions > 0 ? pendingActions : undefined,
    },
    {
      key: "ai-pinned",
      label: "Insight Pinnati",
      subtitle: "Knowledge base condivisa",
      icon: "bookmark-multiple-outline",
      route: "/admin/ai-pinned",
      color: "#F59E0B",
      badge: pinnedCount > 0 ? pinnedCount : undefined,
    },
    {
      key: "ai-layer",
      label: "AI Layer",
      subtitle: "Policies, conflitti, audit",
      icon: "layers-outline",
      route: "/admin/ai-layer",
      color: "#8B5CF6",
    },
    {
      key: "system-health",
      label: "System Watchdog",
      subtitle: "Stato, problemi, proposte AI",
      icon: "shield-check",
      route: "/admin/system-health",
      color: "#22C55E",
      badge: unreadAlerts > 0 ? unreadAlerts : undefined,
    },
    {
      key: "ai-moderation-stats",
      label: "Co-Pilot — Stats",
      subtitle: "Budget, code, anomalie",
      icon: "chart-box-outline",
      route: "/admin/ai-moderation-stats",
      color: "#0EA5E9",
    },
    {
      key: "ai-moderation-settings",
      label: "Co-Pilot — Settings",
      subtitle: "Provider, sigma, budget",
      icon: "tune-variant",
      route: "/admin/ai-moderation-settings",
      color: "#10B981",
    },
    {
      key: "ai-moderation-digest",
      label: "Co-Pilot — Digest",
      subtitle: "Brief mattutino moderatori",
      icon: "email-newsletter",
      route: "/admin/ai-moderation-digest",
      color: "#6366F1",
    },
    {
      key: "db-integrity",
      label: "AI DB Integrity",
      subtitle: "Controllo integrità DB",
      icon: "database-check-outline",
      route: "/admin/db-integrity",
      color: "#E91E63",
    },
    {
      key: "app-integrity",
      label: "AI App Integrity",
      subtitle: "Controllo integrità app",
      icon: "cellphone-check",
      route: "/admin/app-integrity",
      color: "#FF3B30",
    },
  ];

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24 }}
    >
      <Text style={styles.subtitle}>
        Tutti gli strumenti AI in un unico posto.
      </Text>
      {showBudgetBanner ? (
        <TouchableOpacity
          style={[
            styles.budgetBanner,
            { borderColor: budgetBannerColor, backgroundColor: budgetBannerColor + "1A" },
          ]}
          onPress={() => router.push("/admin/ai-moderation-stats" as Href)}
          activeOpacity={0.8}
          testID="ai-hub-budget-banner"
        >
          <MaterialCommunityIcons
            name={budgetBannerIcon}
            size={22}
            color={budgetBannerColor}
          />
          <View style={styles.budgetBannerTextWrap}>
            <Text style={[styles.budgetBannerTitle, { color: budgetBannerColor }]}>
              {budgetBannerTitle}
            </Text>
            <Text style={styles.budgetBannerSubtitle}>{budgetBannerSubtitle}</Text>
          </View>
          <MaterialCommunityIcons
            name="chevron-right"
            size={22}
            color={budgetBannerColor}
          />
        </TouchableOpacity>
      ) : null}
      <OllamaStatusCard />
      <View style={styles.grid}>
        {cards.map((card) => (
          <TouchableOpacity
            key={card.key}
            style={styles.card}
            onPress={() => router.push(card.route as Href)}
            activeOpacity={0.7}
          >
            <View style={[styles.cardIcon, { backgroundColor: card.color + "22" }]}>
              <MaterialCommunityIcons name={card.icon} size={26} color={card.color} />
              {card.badge != null && card.badge > 0 ? (
                <View style={[styles.badge, { backgroundColor: card.color }]}>
                  <Text style={styles.badgeText}>{card.badge > 99 ? "99+" : card.badge}</Text>
                </View>
              ) : null}
            </View>
            <Text style={styles.cardLabel}>{card.label}</Text>
            <Text style={styles.cardSubtitle} numberOfLines={2}>{card.subtitle}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  subtitle: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    color: Colors.textSecondary,
    marginBottom: 16,
  },
  budgetBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 16,
  },
  budgetBannerTextWrap: { flex: 1 },
  budgetBannerTitle: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
  },
  budgetBannerSubtitle: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  card: {
    width: "47%",
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 16,
    alignItems: "center",
    borderWidth: 1,
    borderColor: Colors.border,
  },
  cardIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
  },
  badge: {
    position: "absolute",
    top: -4,
    right: -4,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 6,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: Colors.surface,
  },
  badgeText: {
    color: "#fff",
    fontFamily: "Inter_700Bold",
    fontSize: 10,
  },
  cardLabel: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
    color: Colors.text,
    textAlign: "center",
  },
  cardSubtitle: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    color: Colors.textSecondary,
    textAlign: "center",
    marginTop: 4,
  },
});
