import React, { useState } from "react";
import { View, Text, ScrollView, TouchableOpacity, Alert, Linking, Modal } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { MaterialIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/colors";
import { getApiUrl } from "@/lib/query-client";
import { AnalyticsMetricCard } from "@/components/admin/analytics/AnalyticsMetricCard";
import { AnalyticsExport } from "@/components/admin/analytics/AnalyticsExport";
import { UserListModal } from "@/components/admin/analytics/UserListModal";
import { ActiveUsersModal } from "@/components/admin/analytics/ActiveUsersModal";
import { AdClicksModal } from "@/components/admin/analytics/AdClicksModal";
import { PendingReportsModal } from "@/components/admin/analytics/PendingReportsModal";
import { UserStatsContent } from "@/components/admin/analytics/UserStatsContent";
import { styles } from "@/components/admin/analytics.styles";
import { SessionsSection } from "@/components/admin/analytics/SessionsSection";
import { FunnelContent, SkipCharts } from "./_analytics.part2";

interface Analytics {
  totalUsers: number;
  onlineUsersNow: number;
  activeUsersWeek: number;
  workshopContactsMonth: number;
  totalAdClicks: number;
  activeCampaigns: number;
  pendingReports: number;
}

interface UserItem {
  id: string;
  nickname: string;
  userType: string;
  sex: string;
  region: string;
  createdAt: string;
}

interface ActiveUserItem {
  id: string;
  nickname: string;
  userType: string;
  lastLoginAt: string;
}

interface AdClickItem {
  id: string;
  userId: string;
  nickname: string;
  userType: string;
  adTitle: string;
  clickedAt: string;
}

interface PendingReportItem {
  id: string;
  type: string;
  title: string;
  description: string;
  submittedBy: string;
  createdAt: string;
}

interface UserStatsData {
  user: {
    id: string;
    nickname: string;
    email: string;
    userType: string;
    role: string;
    status: string;
    createdAt: string;
    lastLoginAt: string | null;
    isFake: boolean;
    isPrimal: boolean;
    totalKm: number | null;
    totalRides: number | null;
    isAvailable: boolean;
    bio: string | null;
  };
  stats: {
    proposalsCreated: number;
    conversationsCount: number;
    messagesSent: number;
    reportsFiled: number;
    reportsReceived: number;
  };
  adClicks: { id: string; adTitle: string; clickedAt: string }[];
  motorcycles: { brand: string; model: string; year: number; displacement: number; motorcycleType: string; ridingStyle: string }[];
  moderatorLogs: { action: string; createdAt: string; moderatorNickname: string }[];
}

type ModalType = "users" | "onlineNow" | "active7" | "adClicks" | "pendingReports" | null;

function formatDateIT(dateStr: string | null): string {
  if (!dateStr) return "Mai";
  const d = new Date(dateStr);
  return d.toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return "Mai connesso";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Adesso";
  if (mins < 60) return `${mins} min fa`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h fa`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}gg fa`;
  const months = Math.floor(days / 30);
  return `${months} mesi fa`;
}

function getUserBadge(createdAt: string): { label: string; color: string } | null {
  const now = Date.now();
  const created = new Date(createdAt).getTime();
  const diffH = (now - created) / (1000 * 60 * 60);
  if (diffH <= 24) return { label: "Nuovo 24h", color: Colors.success };
  if (diffH <= 48) return { label: "Nuovo 48h", color: Colors.warning };
  return null;
}

function getStatusColor(status: string) {
  switch (status) {
    case "active": return Colors.success;
    case "suspended": return Colors.warning;
    case "blocked": return Colors.error;
    default: return Colors.textSecondary;
  }
}

function getRoleColor(role: string) {
  switch (role) {
    case "admin": return Colors.accent;
    case "moderator": return Colors.maleIcon;
    default: return Colors.textSecondary;
  }
}

export default function AdminAnalytics() {
  const insets = useSafeAreaInsets();
  const [activeModal, setActiveModal] = useState<ModalType>(null);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

  const { data, isLoading } = useQuery<Analytics>({
    queryKey: ["/api/admin/analytics"],
  });

  const onboardingTagsQuery = useQuery<{
    shown: number;
    saved: number;
    skipped: number;
    conversionRate: number;
    skipRate: number;
    avgTagCount: number;
    funnel?: {
      started: number;
      carouselCompleted: number;
      carouselCompletedFinish: number;
      carouselCompletedSkip: number;
      skipBySlide?: { index: number; count: number }[];
      topSkipSlides?: { index: number; count: number; pct: number }[];
      tagsShown: number;
      tagsSaved: number;
      tagsSkipped: number;
      dropOff: {
        startedToCarousel: number;
        carouselToTagsShown: number;
        tagsShownToSaved: number;
        startedToSaved: number;
      };
    };
  }>({
    queryKey: ["/api/admin/analytics/onboarding-tags"],
  });

  const usersQuery = useQuery<UserItem[]>({
    queryKey: ["/api/admin/analytics/users-list"],
    enabled: activeModal === "users",
  });

  const onlineNowQuery = useQuery<ActiveUserItem[]>({
    queryKey: ["/api/admin/analytics/online-now"],
    enabled: activeModal === "onlineNow",
  });

  const active7Query = useQuery<ActiveUserItem[]>({
    queryKey: ["/api/admin/analytics/active-users?period=7"],
    enabled: activeModal === "active7",
  });

  const adClicksQuery = useQuery<AdClickItem[]>({
    queryKey: ["/api/admin/analytics/ad-clicks"],
    enabled: activeModal === "adClicks",
  });

  const pendingReportsQuery = useQuery<PendingReportItem[]>({
    queryKey: ["/api/admin/analytics/pending-reports"],
    enabled: activeModal === "pendingReports",
  });

  const statsQuery = useQuery<UserStatsData>({
    queryKey: ["/api/admin/users", selectedUserId, "stats"],
    enabled: !!selectedUserId,
    queryFn: async () => {
      const url = new URL(`/api/admin/users/${selectedUserId}/stats`, getApiUrl());
      const res = await fetch(url.toString(), { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  function handleExportCSV() {
    const baseUrl = getApiUrl();
    const url = new URL("/api/admin/analytics/export-csv", baseUrl);
    Linking.openURL(url.toString()).catch(() => {
      Alert.alert("Errore", "Impossibile aprire il link per il download");
    });
  }

  function handleCardPress(label: string) {
    if (label === "Utenti totali") setActiveModal("users");
    else if (label === "Utenti connessi Adesso") setActiveModal("onlineNow");
    else if (label === "Utenti connessi 7gg") setActiveModal("active7");
    else if (label === "Advertisement") setActiveModal("adClicks");
    else if (label === "Segnalazioni pendenti") setActiveModal("pendingReports");
  }

  function handleUserPress(userId: string) {
    setSelectedUserId(userId);
  }

  const tappableLabels = ["Utenti totali", "Utenti connessi Adesso", "Utenti connessi 7gg", "Advertisement", "Segnalazioni pendenti"];

  const stats = [
    { label: "Utenti totali", value: data?.totalUsers ?? 0, icon: "people" as const, color: Colors.maleIcon },
    { label: "Utenti connessi Adesso", value: data?.onlineUsersNow ?? 0, icon: "wifi" as const, color: Colors.success },
    { label: "Utenti connessi 7gg", value: data?.activeUsersWeek ?? 0, icon: "show-chart" as const, color: Colors.accent },
    { label: "Contatti officine (30gg)", value: data?.workshopContactsMonth ?? 0, icon: "store" as const, color: Colors.femaleIcon },
    { label: "Click ads totali", value: data?.totalAdClicks ?? 0, icon: "ads-click" as const, color: Colors.warning },
    { label: "Advertisement", value: data?.activeCampaigns ?? 0, icon: "campaign" as const, color: Colors.accent },
    { label: "Segnalazioni pendenti", value: data?.pendingReports ?? 0, icon: "flag" as const, color: Colors.error },
  ];

  function getModalTitle(): string {
    switch (activeModal) {
      case "users": return "Utenti totali";
      case "onlineNow": return "Utenti connessi Adesso";
      case "active7": return "Utenti connessi 7gg";
      case "adClicks": return "Advertisement - Click";
      case "pendingReports": return "Segnalazioni pendenti";
      default: return "";
    }
  }

  function renderModalContent() {
    switch (activeModal) {
      case "users":
        return (
          <UserListModal
            users={usersQuery.data ?? []}
            onUserPress={handleUserPress}
            formatDate={formatDateIT}
            getUserBadge={getUserBadge}
          />
        );
      case "onlineNow":
        return (
          <ActiveUsersModal
            users={onlineNowQuery.data ?? []}
            onUserPress={handleUserPress}
            formatDate={formatDateIT}
          />
        );
      case "active7":
        return (
          <ActiveUsersModal
            users={active7Query.data ?? []}
            onUserPress={handleUserPress}
            formatDate={formatDateIT}
          />
        );
      case "adClicks":
        return (
          <AdClicksModal
            clicks={adClicksQuery.data ?? []}
            onUserPress={handleUserPress}
            formatDate={formatDateIT}
          />
        );
      case "pendingReports":
        return (
          <PendingReportsModal
            reports={pendingReportsQuery.data ?? []}
            formatDate={formatDateIT}
          />
        );
      default: return null;
    }
  }

  const isModalLoading =
    (activeModal === "users" && usersQuery.isLoading) ||
    (activeModal === "onlineNow" && onlineNowQuery.isLoading) ||
    (activeModal === "active7" && active7Query.isLoading) ||
    (activeModal === "adClicks" && adClicksQuery.isLoading) ||
    (activeModal === "pendingReports" && pendingReportsQuery.isLoading);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 20 }]}
    >
      {isLoading ? (
        <Text style={styles.loadingText}>Caricamento analytics...</Text>
      ) : (
        <>
          <View style={styles.grid}>
            {stats.map((stat) => (
              <AnalyticsMetricCard
                key={stat.label}
                label={stat.label}
                value={stat.value}
                icon={stat.icon}
                color={stat.color}
                isTappable={tappableLabels.includes(stat.label)}
                onPress={() => handleCardPress(stat.label)}
              />
            ))}
          </View>

          <View style={styles.onboardingBlock}>
            <Text style={styles.onboardingTitle}>Onboarding — Funnel completo</Text>
            {onboardingTagsQuery.isLoading ? (
              <Text style={styles.loadingText}>Caricamento...</Text>
            ) : (
              <FunnelContent f={onboardingTagsQuery.data?.funnel} />
            )}
          </View>

          <View style={styles.onboardingBlock}>
            <Text style={styles.onboardingTitle}>Onboarding — Abbandono Carousel per Slide</Text>
            {onboardingTagsQuery.isLoading ? (
              <Text style={styles.loadingText}>Caricamento...</Text>
            ) : (
              <SkipCharts 
                skipBySlide={onboardingTagsQuery.data?.funnel?.skipBySlide ?? []} 
                topSkipSlides={onboardingTagsQuery.data?.funnel?.topSkipSlides ?? []} 
              />
            )}
          </View>

          <View style={styles.onboardingBlock}>
            <Text style={styles.onboardingTitle}>Onboarding — Step Tag</Text>
            {onboardingTagsQuery.isLoading ? (
              <Text style={styles.loadingText}>Caricamento...</Text>
            ) : (
              <View style={styles.onboardingRows}>
                <View style={styles.onboardingRow}>
                  <Text style={styles.onboardingLabel}>Visualizzazioni step</Text>
                  <Text style={styles.onboardingValue}>{onboardingTagsQuery.data?.shown ?? 0}</Text>
                </View>
                <View style={styles.onboardingRow}>
                  <Text style={styles.onboardingLabel}>Salvataggi</Text>
                  <Text style={styles.onboardingValue}>{onboardingTagsQuery.data?.saved ?? 0}</Text>
                </View>
                <View style={styles.onboardingRow}>
                  <Text style={styles.onboardingLabel}>Skip</Text>
                  <Text style={styles.onboardingValue}>{onboardingTagsQuery.data?.skipped ?? 0}</Text>
                </View>
                <View style={styles.onboardingRow}>
                  <Text style={styles.onboardingLabel}>Conversion rate</Text>
                  <Text style={[styles.onboardingValue, { color: Colors.success }]}>
                    {(onboardingTagsQuery.data?.conversionRate ?? 0).toFixed(1)}%
                  </Text>
                </View>
                <View style={styles.onboardingRow}>
                  <Text style={styles.onboardingLabel}>Skip rate</Text>
                  <Text style={styles.onboardingValue}>
                    {(onboardingTagsQuery.data?.skipRate ?? 0).toFixed(1)}%
                  </Text>
                </View>
                <View style={styles.onboardingRow}>
                  <Text style={styles.onboardingLabel}>Tag medi per salvataggio</Text>
                  <Text style={styles.onboardingValue}>
                    {(onboardingTagsQuery.data?.avgTagCount ?? 0).toFixed(1)}
                  </Text>
                </View>
              </View>
            )}
          </View>

          <SessionsSection />

          <AnalyticsExport onExport={handleExportCSV} />
        </>
      )}

      <Modal visible={activeModal !== null} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContainer, { paddingTop: insets.top + 10, paddingBottom: insets.bottom + 10 }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{getModalTitle()}</Text>
              <TouchableOpacity onPress={() => setActiveModal(null)}>
                <MaterialIcons name="close" size={24} color={Colors.text} />
              </TouchableOpacity>
            </View>
            {isModalLoading ? (
              <Text style={styles.loadingText}>Caricamento...</Text>
            ) : (
              renderModalContent()
            )}
          </View>
        </View>
      </Modal>

      <Modal visible={!!selectedUserId} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContainer, { paddingTop: insets.top + 10, paddingBottom: insets.bottom + 10 }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{statsQuery.data?.user?.nickname || "Dettaglio utente"}</Text>
              <TouchableOpacity onPress={() => setSelectedUserId(null)}>
                <MaterialIcons name="close" size={24} color={Colors.text} />
              </TouchableOpacity>
            </View>
            {statsQuery.isLoading ? (
              <Text style={styles.loadingText}>Caricamento statistiche...</Text>
            ) : statsQuery.isError ? (
              <Text style={styles.loadingText}>Errore nel caricamento</Text>
            ) : statsQuery.data ? (
              <UserStatsContent
                stats={statsQuery.data}
                formatDate={formatDateIT}
                timeAgo={timeAgo}
                getRoleColor={getRoleColor}
                getStatusColor={getStatusColor}
              />
            ) : null}
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

