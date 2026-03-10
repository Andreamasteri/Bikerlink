import React, { useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, Linking, Modal, FlatList } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { MaterialIcons, Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/colors";
import { getApiUrl } from "@/lib/query-client";

interface Analytics {
  totalUsers: number;
  activeUsersMonth: number;
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

type ModalType = "users" | "active30" | "active7" | "adClicks" | "pendingReports" | null;

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

  const usersQuery = useQuery<UserItem[]>({
    queryKey: ["/api/admin/analytics/users-list"],
    enabled: activeModal === "users",
  });

  const active30Query = useQuery<ActiveUserItem[]>({
    queryKey: ["/api/admin/analytics/active-users?period=30"],
    enabled: activeModal === "active30",
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
      const res = await fetch(`${getApiUrl()}/api/admin/users/${selectedUserId}/stats`, { credentials: "include" });
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
    else if (label === "Utenti Attivi (30gg)") setActiveModal("active30");
    else if (label === "Utenti Attivi (7gg)") setActiveModal("active7");
    else if (label === "Advertisement") setActiveModal("adClicks");
    else if (label === "Segnalazioni pendenti") setActiveModal("pendingReports");
  }

  function handleUserPress(userId: string) {
    setSelectedUserId(userId);
  }

  const tappableLabels = ["Utenti totali", "Utenti Attivi (30gg)", "Utenti Attivi (7gg)", "Advertisement", "Segnalazioni pendenti"];

  const stats = [
    { label: "Utenti totali", value: data?.totalUsers ?? 0, icon: "people" as const, color: Colors.maleIcon },
    { label: "Utenti Attivi (30gg)", value: data?.activeUsersMonth ?? 0, icon: "trending-up" as const, color: Colors.success },
    { label: "Utenti Attivi (7gg)", value: data?.activeUsersWeek ?? 0, icon: "show-chart" as const, color: Colors.accent },
    { label: "Contatti officine (30gg)", value: data?.workshopContactsMonth ?? 0, icon: "store" as const, color: Colors.femaleIcon },
    { label: "Click ads totali", value: data?.totalAdClicks ?? 0, icon: "ads-click" as const, color: Colors.warning },
    { label: "Advertisement", value: data?.activeCampaigns ?? 0, icon: "campaign" as const, color: Colors.accent },
    { label: "Segnalazioni pendenti", value: data?.pendingReports ?? 0, icon: "flag" as const, color: Colors.error },
  ];

  function renderUsersModal() {
    const users = usersQuery.data ?? [];
    return (
      <FlatList
        data={users}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.modalList}
        renderItem={({ item }) => {
          const badge = getUserBadge(item.createdAt);
          return (
            <TouchableOpacity style={styles.listItem} onPress={() => handleUserPress(item.id)} activeOpacity={0.7}>
              <View style={{ flex: 1 }}>
                <Text style={styles.listItemTitle}>{item.nickname}</Text>
                <Text style={styles.listItemSub}>{item.userType} - {item.region || "N/A"} - {item.sex || "N/A"}</Text>
                <Text style={styles.listItemDate}>{formatDateIT(item.createdAt)}</Text>
              </View>
              {badge && (
                <View style={[styles.badge, { backgroundColor: badge.color + "22", borderColor: badge.color }]}>
                  <Text style={[styles.badgeText, { color: badge.color }]}>{badge.label}</Text>
                </View>
              )}
              <MaterialIcons name="chevron-right" size={20} color={Colors.textSecondary} />
            </TouchableOpacity>
          );
        }}
        ListEmptyComponent={<Text style={styles.emptyText}>Nessun utente</Text>}
      />
    );
  }

  function renderActiveUsersModal(period: number) {
    const activeData = period === 30 ? active30Query.data : active7Query.data;
    const users = activeData ?? [];
    return (
      <FlatList
        data={users}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.modalList}
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.listItem} onPress={() => handleUserPress(item.id)} activeOpacity={0.7}>
            <View style={{ flex: 1 }}>
              <Text style={styles.listItemTitle}>{item.nickname}</Text>
              <Text style={styles.listItemSub}>{item.userType}</Text>
              <Text style={styles.listItemDate}>Ultimo accesso: {formatDateIT(item.lastLoginAt)}</Text>
            </View>
            <MaterialIcons name="chevron-right" size={20} color={Colors.textSecondary} />
          </TouchableOpacity>
        )}
        ListEmptyComponent={<Text style={styles.emptyText}>Nessun utente attivo</Text>}
      />
    );
  }

  function renderAdClicksModal() {
    const clicks = adClicksQuery.data ?? [];
    const bikerCount = clicks.filter((c) => c.userType === "biker").length;
    const zavarrinaCount = clicks.filter((c) => c.userType === "zavorrina").length;
    return (
      <View style={{ flex: 1 }}>
        <View style={styles.adSummary}>
          <Text style={styles.adSummaryText}>Totale click: {clicks.length}</Text>
          <Text style={styles.adSummaryText}>Biker: {bikerCount} | Zavorrina: {zavarrinaCount}</Text>
        </View>
        <FlatList
          data={clicks}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.modalList}
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.listItem} onPress={() => handleUserPress(item.userId)} activeOpacity={0.7}>
              <View style={{ flex: 1 }}>
                <Text style={styles.listItemTitle}>{item.nickname || "Anonimo"}</Text>
                <Text style={styles.listItemSub}>{item.userType} - {item.adTitle || "N/A"}</Text>
                <Text style={styles.listItemDate}>{formatDateIT(item.clickedAt)}</Text>
              </View>
              <MaterialIcons name="chevron-right" size={20} color={Colors.textSecondary} />
            </TouchableOpacity>
          )}
          ListEmptyComponent={<Text style={styles.emptyText}>Nessun click registrato</Text>}
        />
      </View>
    );
  }

  function renderPendingReportsModal() {
    const reports = pendingReportsQuery.data ?? [];
    return (
      <FlatList
        data={reports}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.modalList}
        renderItem={({ item }) => (
          <View style={styles.listItem}>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 }}>
                <View style={[styles.typeBadge, { backgroundColor: item.type === "bug" ? Colors.error + "22" : Colors.accent + "22" }]}>
                  <Text style={[styles.typeBadgeText, { color: item.type === "bug" ? Colors.error : Colors.accent }]}>
                    {item.type === "bug" ? "Bug" : "Feature"}
                  </Text>
                </View>
                <Text style={styles.listItemTitle} numberOfLines={1}>{item.title}</Text>
              </View>
              <Text style={styles.listItemSub} numberOfLines={2}>{item.description}</Text>
              <Text style={styles.listItemDate}>Da: {item.submittedBy || "Anonimo"} - {formatDateIT(item.createdAt)}</Text>
            </View>
          </View>
        )}
        ListEmptyComponent={<Text style={styles.emptyText}>Nessuna segnalazione pendente</Text>}
      />
    );
  }

  function renderUserStatsContent() {
    const s = statsQuery.data;
    if (!s) return null;

    const u = s.user;
    const daysSinceRegistration = Math.floor((Date.now() - new Date(u.createdAt).getTime()) / (1000 * 60 * 60 * 24));

    return (
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }}>
        <View style={sStyles.section}>
          <Text style={sStyles.sectionTitle}>Informazioni</Text>
          <View style={sStyles.row}>
            <Text style={sStyles.label}>Nickname</Text>
            <Text style={sStyles.value}>{u.nickname}</Text>
          </View>
          <View style={sStyles.row}>
            <Text style={sStyles.label}>Email</Text>
            <Text style={sStyles.value}>{u.email}</Text>
          </View>
          <View style={sStyles.row}>
            <Text style={sStyles.label}>Tipo</Text>
            <Text style={sStyles.value}>{u.userType}</Text>
          </View>
          <View style={sStyles.row}>
            <Text style={sStyles.label}>Ruolo</Text>
            <Text style={[sStyles.value, { color: getRoleColor(u.role) }]}>{u.role}</Text>
          </View>
          <View style={sStyles.row}>
            <Text style={sStyles.label}>Stato</Text>
            <Text style={[sStyles.value, { color: getStatusColor(u.status) }]}>{u.status}</Text>
          </View>
          {u.bio && (
            <View style={sStyles.row}>
              <Text style={sStyles.label}>Bio</Text>
              <Text style={[sStyles.value, { flex: 1, textAlign: "right" as const }]} numberOfLines={3}>{u.bio}</Text>
            </View>
          )}
        </View>

        <View style={sStyles.section}>
          <Text style={sStyles.sectionTitle}>Connessione</Text>
          <View style={sStyles.row}>
            <Text style={sStyles.label}>Ultimo accesso</Text>
            <Text style={sStyles.value}>{timeAgo(u.lastLoginAt)}</Text>
          </View>
          <View style={sStyles.row}>
            <Text style={sStyles.label}>Data ultimo accesso</Text>
            <Text style={sStyles.value}>{formatDateIT(u.lastLoginAt)}</Text>
          </View>
          <View style={sStyles.row}>
            <Text style={sStyles.label}>Registrazione</Text>
            <Text style={sStyles.value}>{formatDateIT(u.createdAt)}</Text>
          </View>
          <View style={sStyles.row}>
            <Text style={sStyles.label}>Giorni dall'iscrizione</Text>
            <Text style={sStyles.value}>{daysSinceRegistration}</Text>
          </View>
          <View style={sStyles.row}>
            <Text style={sStyles.label}>Disponibile</Text>
            <MaterialIcons name={u.isAvailable ? "check-circle" : "cancel"} size={18} color={u.isAvailable ? Colors.success : Colors.error} />
          </View>
        </View>

        <View style={sStyles.section}>
          <Text style={sStyles.sectionTitle}>Attivit&agrave;</Text>
          <View style={sStyles.statsGrid}>
            <View style={sStyles.statBox}>
              <Text style={sStyles.statNumber}>{s.stats.proposalsCreated}</Text>
              <Text style={sStyles.statLabel}>Proposte</Text>
            </View>
            <View style={sStyles.statBox}>
              <Text style={sStyles.statNumber}>{s.stats.conversationsCount}</Text>
              <Text style={sStyles.statLabel}>Conversazioni</Text>
            </View>
            <View style={sStyles.statBox}>
              <Text style={sStyles.statNumber}>{s.stats.messagesSent}</Text>
              <Text style={sStyles.statLabel}>Messaggi</Text>
            </View>
            <View style={sStyles.statBox}>
              <Text style={sStyles.statNumber}>{s.stats.reportsFiled}</Text>
              <Text style={sStyles.statLabel}>Segnalazioni fatte</Text>
            </View>
            <View style={sStyles.statBox}>
              <Text style={sStyles.statNumber}>{s.stats.reportsReceived}</Text>
              <Text style={sStyles.statLabel}>Segnalazioni ricevute</Text>
            </View>
            <View style={sStyles.statBox}>
              <Text style={sStyles.statNumber}>{u.totalRides ?? 0}</Text>
              <Text style={sStyles.statLabel}>Percorsi</Text>
            </View>
          </View>
          {(u.totalKm ?? 0) > 0 && (
            <View style={sStyles.row}>
              <Text style={sStyles.label}>Km totali</Text>
              <Text style={sStyles.value}>{u.totalKm} km</Text>
            </View>
          )}
        </View>

        {s.motorcycles.length > 0 && (
          <View style={sStyles.section}>
            <Text style={sStyles.sectionTitle}>Moto</Text>
            {s.motorcycles.map((m, i) => (
              <View key={i} style={sStyles.motoCard}>
                <Text style={sStyles.motoTitle}>{m.brand} {m.model}</Text>
                <Text style={sStyles.motoSub}>{m.year} - {m.displacement}cc - {m.motorcycleType} - {m.ridingStyle}</Text>
              </View>
            ))}
          </View>
        )}

        {s.adClicks.length > 0 && (
          <View style={sStyles.section}>
            <Text style={sStyles.sectionTitle}>Click Ads ({s.adClicks.length})</Text>
            {s.adClicks.map((click) => (
              <View key={click.id} style={sStyles.logItem}>
                <Text style={sStyles.logText}>{click.adTitle || "N/A"}</Text>
                <Text style={sStyles.logDate}>{formatDateIT(click.clickedAt)}</Text>
              </View>
            ))}
          </View>
        )}

        {s.moderatorLogs.length > 0 && (
          <View style={sStyles.section}>
            <Text style={sStyles.sectionTitle}>Log moderazione</Text>
            {s.moderatorLogs.map((log, i) => (
              <View key={i} style={sStyles.logItem}>
                <Text style={sStyles.logText}>{log.action} (da {log.moderatorNickname || "sistema"})</Text>
                <Text style={sStyles.logDate}>{formatDateIT(log.createdAt)}</Text>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    );
  }

  function getModalTitle(): string {
    switch (activeModal) {
      case "users": return "Utenti totali";
      case "active30": return "Utenti Attivi (30gg)";
      case "active7": return "Utenti Attivi (7gg)";
      case "adClicks": return "Advertisement - Click";
      case "pendingReports": return "Segnalazioni pendenti";
      default: return "";
    }
  }

  function renderModalContent() {
    switch (activeModal) {
      case "users": return renderUsersModal();
      case "active30": return renderActiveUsersModal(30);
      case "active7": return renderActiveUsersModal(7);
      case "adClicks": return renderAdClicksModal();
      case "pendingReports": return renderPendingReportsModal();
      default: return null;
    }
  }

  const isModalLoading =
    (activeModal === "users" && usersQuery.isLoading) ||
    (activeModal === "active30" && active30Query.isLoading) ||
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
            {stats.map((stat) => {
              const isTappable = tappableLabels.includes(stat.label);
              const CardWrapper = isTappable ? TouchableOpacity : View;
              return (
                <CardWrapper
                  key={stat.label}
                  style={styles.statCard}
                  {...(isTappable ? { onPress: () => handleCardPress(stat.label), activeOpacity: 0.7 } : {})}
                >
                  <View style={[styles.statIcon, { backgroundColor: stat.color + "22" }]}>
                    <MaterialIcons name={stat.icon} size={24} color={stat.color} />
                  </View>
                  <Text style={styles.statValue}>{stat.value}</Text>
                  <Text style={styles.statLabel}>{stat.label}</Text>
                  {isTappable && (
                    <MaterialIcons name="chevron-right" size={16} color={Colors.textSecondary} style={{ position: "absolute", top: 16, right: 12 }} />
                  )}
                </CardWrapper>
              );
            })}
          </View>

          <TouchableOpacity style={styles.exportBtn} onPress={handleExportCSV}>
            <MaterialIcons name="file-download" size={20} color={Colors.background} />
            <Text style={styles.exportBtnText}>Esporta CSV</Text>
          </TouchableOpacity>
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
          <View style={[sStyles.modalContainer, { paddingTop: insets.top + 10, paddingBottom: insets.bottom + 10 }]}>
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
            ) : (
              renderUserStatsContent()
            )}
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const sStyles = StyleSheet.create({
  modalContainer: {
    flex: 1,
    backgroundColor: Colors.background,
    marginTop: 40,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  section: {
    marginTop: 20,
  },
  sectionTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 15,
    color: Colors.accent,
    marginBottom: 10,
    textTransform: "uppercase" as const,
    letterSpacing: 1,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border + "44",
  },
  label: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: Colors.textSecondary,
  },
  value: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
    color: Colors.text,
  },
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  statBox: {
    width: "31%",
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 12,
    alignItems: "center",
    borderWidth: 1,
    borderColor: Colors.border,
  },
  statNumber: {
    fontFamily: "Inter_700Bold",
    fontSize: 22,
    color: Colors.text,
  },
  statLabel: {
    fontFamily: "Inter_400Regular",
    fontSize: 10,
    color: Colors.textSecondary,
    textAlign: "center",
    marginTop: 4,
  },
  motoCard: {
    backgroundColor: Colors.surface,
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  motoTitle: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
    color: Colors.text,
  },
  motoSub: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  logItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border + "44",
  },
  logText: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: Colors.text,
    flex: 1,
  },
  logDate: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    color: Colors.textSecondary,
    marginLeft: 8,
  },
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: 16 },
  loadingText: { fontFamily: "Inter_400Regular", fontSize: 14, color: Colors.textSecondary, textAlign: "center", marginTop: 40 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  statCard: {
    width: "47%", backgroundColor: Colors.surface, borderRadius: 16, padding: 16,
    borderWidth: 1, borderColor: Colors.border,
  },
  statIcon: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", marginBottom: 12 },
  statValue: { fontFamily: "Inter_700Bold", fontSize: 28, color: Colors.text },
  statLabel: { fontFamily: "Inter_400Regular", fontSize: 12, color: Colors.textSecondary, marginTop: 4 },
  exportBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    backgroundColor: Colors.accent, borderRadius: 12, padding: 16, marginTop: 24,
  },
  exportBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 16, color: Colors.background },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)" },
  modalContainer: { flex: 1, backgroundColor: Colors.background, marginTop: 40, borderTopLeftRadius: 20, borderTopRightRadius: 20 },
  modalHeader: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  modalTitle: { fontFamily: "Inter_700Bold", fontSize: 18, color: Colors.text },
  modalList: { paddingHorizontal: 16, paddingVertical: 8 },
  listItem: {
    flexDirection: "row", alignItems: "center", backgroundColor: Colors.surface,
    borderRadius: 12, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: Colors.border,
  },
  listItemTitle: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: Colors.text },
  listItemSub: { fontFamily: "Inter_400Regular", fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  listItemDate: { fontFamily: "Inter_400Regular", fontSize: 11, color: Colors.textSecondary, marginTop: 4 },
  badge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, borderWidth: 1 },
  badgeText: { fontFamily: "Inter_600SemiBold", fontSize: 10 },
  typeBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  typeBadgeText: { fontFamily: "Inter_500Medium", fontSize: 10 },
  emptyText: { fontFamily: "Inter_400Regular", fontSize: 14, color: Colors.textSecondary, textAlign: "center", marginTop: 40 },
  adSummary: {
    paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  adSummaryText: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: Colors.text, marginBottom: 4 },
});
