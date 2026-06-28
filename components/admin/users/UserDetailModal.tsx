// LARGE-FILE-ALLOW: components/admin/users/UserDetailModal — merge @no-split di file lazy-split
import React, { useState } from "react";
import { View, Text, Modal, TouchableOpacity, ScrollView, Platform, StyleSheet } from "react-native";
import { Ionicons, MaterialIcons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import Colors from "@/constants/colors";
import { getApiUrl } from "@/lib/query-client";
import { AdminUser } from "./UserCard";
import { SessionStats } from "@/components/admin/analytics/UserStatsContent";
import { UserSessionStatsBlock } from "./UserSessionStatsBlock";

/* ===== StyleSheet (ex overflow UserDetailModal) ===== */
export const sessionStyles = StyleSheet.create({
  countBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  countText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
  },
  sessionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 8,
    paddingHorizontal: 10,
    backgroundColor: Colors.surface,
    borderRadius: 8,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  sessionInfo: {
    flex: 1,
    gap: 2,
  },
  sessionSid: {
    fontFamily: "Inter_500Medium",
    fontSize: 13,
    color: Colors.text,
  },
  sessionExpiry: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    color: Colors.textSecondary,
    marginLeft: 20,
  },
  revokeBtn: {
    backgroundColor: Colors.error + "22",
    borderWidth: 1,
    borderColor: Colors.error + "66",
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 5,
    marginLeft: 8,
  },
  revokeBtnText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
    color: Colors.error,
  },
});

export const fzStyles = StyleSheet.create({
  row: {
    flexDirection: "row",
    gap: 8,
    marginTop: 8,
  },
  chip: {
    flex: 1,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.accent + "66",
    backgroundColor: Colors.surface,
  },
  chipDisabled: {
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    opacity: 0.5,
  },
  chipNum: {
    fontFamily: "Inter_700Bold",
    fontSize: 16,
    color: Colors.accent,
  },
  chipType: {
    fontFamily: "Inter_500Medium",
    fontSize: 13,
    color: Colors.textSecondary,
  },
  chipTextDisabled: {
    color: Colors.textSecondary,
  },
  note: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 8,
    textAlign: "center" as const,
  },
});

export const statsStyles = StyleSheet.create({
  modalContainer: {
    flex: 1,
    backgroundColor: Colors.background,
    marginTop: 40,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  modalTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 20,
    color: Colors.text,
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
  label: { fontFamily: "Inter_400Regular", fontSize: 13, color: Colors.textSecondary },
  value: { fontFamily: "Inter_600SemiBold", fontSize: 13, color: Colors.text },
  statsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  statBox: {
    width: "31%",
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 12,
    alignItems: "center",
    borderWidth: 1,
    borderColor: Colors.border,
  },
  statNumber: { fontFamily: "Inter_700Bold", fontSize: 22, color: Colors.text },
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
  motoTitle: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: Colors.text },
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

export const privacyStyles = StyleSheet.create({
  collapseHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 4,
    marginBottom: 4,
  },
  settingRow: {
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border + "33",
  },
  settingTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  settingName: {
    fontFamily: "Inter_500Medium",
    fontSize: 13,
    color: Colors.text,
    flex: 1,
    marginRight: 8,
  },
  badgeOn: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: Colors.success + "22",
    borderWidth: 1,
    borderColor: Colors.success + "66",
  },
  badgeOff: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: Colors.border,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  badgeText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 11,
  },
  badgeParam: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    color: Colors.textSecondary,
    marginLeft: 6,
  },
  timelineItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 2,
    paddingLeft: 4,
  },
  timelineText: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    color: Colors.textSecondary,
    flex: 1,
  },
  noEvents: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    color: Colors.textSecondary,
    fontStyle: "italic" as const,
    paddingLeft: 4,
    marginTop: 2,
  },
});

/* ===== PrivacySection (ex overflow UserDetailModal) ===== */
export interface PrivacyLogEntry { newValue: boolean; changedAt: string }
export interface PrivacyOverview {
  currentSettings: Record<string, boolean | number | string>;
  log: Record<string, PrivacyLogEntry[]>;
}

const PRIVACY_SETTINGS: Array<{ key: string; label: string; paramKey?: string; paramLabel?: string }> = [
  { key: "ghost_mode", label: "Ghost Mode" },
  { key: "hide_from_map", label: "Non visibile sulla mappa" },
  { key: "position_fuzz", label: "Altera Posizione", paramKey: "position_fuzz_km", paramLabel: "km" },
  { key: "fixed_position_enabled", label: "Posizione Fissa" },
  { key: "fake_home_enabled", label: "Fake Home" },
  { key: "fake_work_enabled", label: "Fake Work" },
  { key: "fake_whatever_enabled", label: "Fake Whatever" },
  { key: "offline_position_randomize", label: "Randomizza offline" },
  { key: "continuous_gps", label: "GPS Continuo" },
];

function formatTimelineDate(iso: string): string {
  const d = new Date(iso);
  const day = d.getDate();
  const months = ["gen","feb","mar","apr","mag","giu","lug","ago","set","ott","nov","dic"];
  const month = months[d.getMonth()];
  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");
  return `${day} ${month} alle ${h}:${m}`;
}

export function PrivacySection({ userId }: { userId: string }) {
  const [expanded, setExpanded] = useState(false);

  const { data, isLoading, isError } = useQuery<PrivacyOverview>({
    queryKey: ["/api/admin/users", userId, "privacy-overview"],
    queryFn: async () => {
      const url = new URL(`/api/admin/users/${userId}/privacy-overview`, getApiUrl());
      const res = await fetch(url.toString(), { credentials: "include" });
      if (!res.ok) throw new Error("Errore caricamento dati privacy");
      return res.json();
    },
    enabled: expanded,
    staleTime: 30000,
  });

  return (
    <View style={statsStyles.section}>
      <TouchableOpacity style={privacyStyles.collapseHeader} onPress={() => setExpanded((v) => !v)}>
        <Text style={statsStyles.sectionTitle}>Privacy &amp; Posizione</Text>
        <Ionicons name={expanded ? "chevron-up" : "chevron-down"} size={18} color={Colors.accent} />
      </TouchableOpacity>

      {expanded && (
        <>
          {isLoading && <Text style={{ color: Colors.textSecondary, fontSize: 13, marginTop: 4 }}>Caricamento...</Text>}
          {isError && <Text style={{ color: Colors.error, fontSize: 13, marginTop: 4 }}>Errore caricamento dati privacy</Text>}
          {data && PRIVACY_SETTINGS.map(({ key, label, paramKey, paramLabel }) => {
            const val = data.currentSettings[key] as boolean;
            const param = paramKey ? data.currentSettings[paramKey] : undefined;
            const entries = (data.log[key] ?? []).slice(0, 5);
            return (
              <View key={key} style={privacyStyles.settingRow}>
                <View style={privacyStyles.settingTop}>
                  <Text style={privacyStyles.settingName}>{label}</Text>
                  <View style={{ flexDirection: "row", alignItems: "center" }}>
                    {param !== undefined && <Text style={privacyStyles.badgeParam}>{param}{paramLabel}</Text>}
                    <View style={val ? privacyStyles.badgeOn : privacyStyles.badgeOff}>
                      <Text style={[privacyStyles.badgeText, { color: val ? Colors.success : Colors.textSecondary }]}>
                        {val ? "ON" : "OFF"}
                      </Text>
                    </View>
                  </View>
                </View>
                {entries.length === 0 ? (
                  <Text style={privacyStyles.noEvents}>Nessuna modifica recente</Text>
                ) : (
                  entries.map((e, i) => (
                    <View key={i} style={privacyStyles.timelineItem}>
                      <Ionicons
                        name={e.newValue ? "radio-button-on" : "radio-button-off"}
                        size={12}
                        color={e.newValue ? Colors.success : Colors.textSecondary}
                      />
                      <Text style={privacyStyles.timelineText}>
                        {e.newValue ? "Attivata" : "Disattivata"} il {formatTimelineDate(e.changedAt)}
                      </Text>
                    </View>
                  ))
                )}
              </View>
            );
          })}
        </>
      )}
    </View>
  );
}

/* ===== UserDetailModal ===== */
export interface GeoZone {
  type: "H" | "W" | "P";
  lat: number;
  lng: number;
  visitCount: number;
  totalMinutes: number;
}

export interface SessionItem {
  sid: string;
  displaySid?: string;
  sessionType: string;
  expiry: string | null;
}

export interface SessionsData {
  sessions: SessionItem[];
  webCount: number;
  mobileCount: number;
  total: number;
}

export interface UserStats {
  user: {
    id: string;
    nickname: string;
    email: string;
    userType: string;
    role: string;
    status: string;
    createdAt: string;
    lastLoginAt: string | null;
    lastLogoutAt: string | null;
    lastAppCloseAt: string | null;
    ghostMode: boolean;
    isOnline: boolean;
    isFake: boolean;
    isPrimal: boolean;
    totalKm: number | null;
    totalRides: number | null;
    isAvailable: boolean;
    bio: string | null;
    latitude: number | null;
    longitude: number | null;
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
  devices?: { model: string; platform: string | null; osVersion: string | null; firstSeenAt: string; lastSeenAt: string }[];
  sessionStats?: SessionStats;
}

interface UserDetailModalProps {
  visible: boolean;
  onClose: () => void;
  user: AdminUser | null;
  stats: UserStats | undefined;
  isLoadingStats: boolean;
  fzEnabled: boolean;
  setFzEnabled: (val: boolean) => void;
  fzData: GeoZone[];
  fzLoading: boolean;
  fzError: boolean;
  onZonePress: (zone: GeoZone) => void;
  sessions: SessionsData | undefined;
  onRevokeSession: (sid: string) => void;
  t: (key: string) => string;
  formatDateIT: (dateStr: string | null) => string;
  getRoleColor: (role: string) => string;
  getStatusColor: (status: string) => string;
}

function minutesAgo(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const diff = Date.now() - new Date(dateStr).getTime();
  return Math.floor(diff / 60_000);
}

export const UserDetailModal: React.FC<UserDetailModalProps> = ({
  visible,
  onClose,
  user,
  stats,
  isLoadingStats,
  fzEnabled,
  setFzEnabled,
  fzData,
  fzLoading,
  fzError,
  onZonePress,
  sessions,
  onRevokeSession,
  t,
  formatDateIT,
  getRoleColor,
  getStatusColor,
}) => {
  return (
    <Modal visible={visible} animationType="slide" presentationStyle={Platform.OS === "ios" ? "formSheet" : undefined} onRequestClose={onClose}>
      <View style={statsStyles.modalContainer}>
        <View style={statsStyles.modalHeader}>
          <Text style={statsStyles.modalTitle}>{user?.nickname ?? ""}</Text>
          <TouchableOpacity onPress={onClose}>
            <Ionicons name="close" size={24} color={Colors.text} />
          </TouchableOpacity>
        </View>

        {!visible || !user ? (
          <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
            <Text style={{ color: Colors.textSecondary }}>Nessun utente selezionato</Text>
          </View>
        ) : isLoadingStats ? (
          <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
            <Text style={{ color: Colors.textSecondary }}>Caricamento...</Text>
          </View>
        ) : stats ? (
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }}>
            <View style={statsStyles.section}>
              <Text style={statsStyles.sectionTitle}>Informazioni</Text>
              <View style={statsStyles.row}>
                <Text style={statsStyles.label}>Nickname</Text>
                <Text style={statsStyles.value}>{stats.user.nickname}</Text>
              </View>
              <View style={statsStyles.row}>
                <Text style={statsStyles.label}>Email</Text>
                <Text style={statsStyles.value}>{stats.user.email}</Text>
              </View>
              <View style={statsStyles.row}>
                <Text style={statsStyles.label}>Tipo</Text>
                <Text style={statsStyles.value}>{stats.user.userType}</Text>
              </View>
              <View style={statsStyles.row}>
                <Text style={statsStyles.label}>Ruolo</Text>
                <Text style={[statsStyles.value, { color: getRoleColor(stats.user.role) }]}>{stats.user.role}</Text>
              </View>
              <View style={statsStyles.row}>
                <Text style={statsStyles.label}>Stato</Text>
                <Text style={[statsStyles.value, { color: getStatusColor(stats.user.status) }]}>{stats.user.status}</Text>
              </View>
              {stats.user.bio && (
                <View style={statsStyles.row}>
                  <Text style={statsStyles.label}>Bio</Text>
                  <Text style={[statsStyles.value, { flex: 1, textAlign: "right" as const }]} numberOfLines={3}>{stats.user.bio}</Text>
                </View>
              )}
            </View>

            <View style={statsStyles.section}>
              <Text style={statsStyles.sectionTitle}>Connessione</Text>
              <View style={statsStyles.row}>
                <Text style={statsStyles.label}>Registrazione</Text>
                <Text style={statsStyles.value}>{formatDateIT(stats.user.createdAt)}</Text>
              </View>
              <View style={statsStyles.row}>
                <Text style={statsStyles.label}>Data e ora ultimo log in</Text>
                <Text style={statsStyles.value}>{formatDateIT(stats.user.lastLoginAt)}</Text>
              </View>
              <View style={statsStyles.row}>
                <Text style={statsStyles.label}>Data e ora ultimo log out</Text>
                <Text style={statsStyles.value}>{formatDateIT(stats.user.lastLogoutAt)}</Text>
              </View>
              <View style={statsStyles.row}>
                <Text style={statsStyles.label}>Data e ora chiusura app</Text>
                <Text style={statsStyles.value}>{formatDateIT(stats.user.lastAppCloseAt)}</Text>
              </View>
              <View style={statsStyles.row}>
                <Text style={statsStyles.label}>Status</Text>
                <View style={{ alignItems: "flex-end", gap: 2 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                    <MaterialIcons name={stats.user.isOnline ? "wifi" : "wifi-off"} size={16} color={stats.user.isOnline ? Colors.success : Colors.error} />
                    <Text style={[statsStyles.value, { color: stats.user.isOnline ? Colors.success : Colors.error }]}>{stats.user.isOnline ? "Online" : "Offline"}</Text>
                  </View>
                  {!stats.user.isOnline && (() => {
                    const mins = minutesAgo(stats.user.lastLoginAt);
                    if (mins === null) return null;
                    const label = mins < 60
                      ? `ultimo heartbeat ${mins} min fa`
                      : mins < 24 * 60
                        ? `ultimo heartbeat ${Math.floor(mins / 60)}h fa`
                        : `ultimo heartbeat ${Math.floor(mins / 1440)}gg fa`;
                    const likelybg = mins < 60;
                    return (
                      <Text style={{ fontSize: 10, color: likelybg ? Colors.warning : Colors.textSecondary, textAlign: "right" }}>
                        {label}{likelybg ? " — app in background" : ""}
                      </Text>
                    );
                  })()}
                </View>
              </View>
              <View style={statsStyles.row}>
                <Text style={statsStyles.label}>Disponibile</Text>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                  <MaterialIcons name={stats.user.isAvailable ? "check-circle" : "cancel"} size={16} color={stats.user.isAvailable ? Colors.success : Colors.error} />
                  <Text style={[statsStyles.value, { color: stats.user.isAvailable ? Colors.success : Colors.error }]}>{stats.user.isAvailable ? t("common.siCapital") : t("common.noCapital")}</Text>
                </View>
              </View>
              <View style={statsStyles.row}>
                <Text style={statsStyles.label}>{t("admin.ghostModeLabel")}</Text>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                  <MaterialIcons name={stats.user.ghostMode ? "check-circle" : "cancel"} size={16} color={stats.user.ghostMode ? Colors.warning : Colors.textSecondary} />
                  <Text style={[statsStyles.value, { color: stats.user.ghostMode ? Colors.warning : Colors.textSecondary }]}>{stats.user.ghostMode ? t("common.siCapital") : t("common.noCapital")}</Text>
                </View>
              </View>
              <View style={statsStyles.row}>
                <Text style={statsStyles.label}>Escluso dal matching</Text>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                  <MaterialIcons
                    name={user.matchingDisabled ? "check-circle" : "cancel"}
                    size={16}
                    color={user.matchingDisabled ? "#f97316" : Colors.textSecondary}
                  />
                  <Text style={[statsStyles.value, { color: user.matchingDisabled ? "#f97316" : Colors.textSecondary }]}>
                    {user.matchingDisabled ? "Sì — NON MATCHABILE" : t("common.noCapital")}
                  </Text>
                </View>
              </View>
            </View>

            <View style={statsStyles.section}>
              <Text style={statsStyles.sectionTitle}>{"Attività"}</Text>
              <View style={statsStyles.statsGrid}>
                <View style={statsStyles.statBox}>
                  <Text style={statsStyles.statNumber}>{stats.stats?.proposalsCreated ?? 0}</Text>
                  <Text style={statsStyles.statLabel}>Proposte</Text>
                </View>
                <View style={statsStyles.statBox}>
                  <Text style={statsStyles.statNumber}>{stats.stats?.conversationsCount ?? 0}</Text>
                  <Text style={statsStyles.statLabel}>Chat</Text>
                </View>
                <View style={statsStyles.statBox}>
                  <Text style={statsStyles.statNumber}>{stats.stats?.messagesSent ?? 0}</Text>
                  <Text style={statsStyles.statLabel}>Messaggi</Text>
                </View>
                <View style={statsStyles.statBox}>
                  <Text style={statsStyles.statNumber}>{stats.stats?.reportsReceived ?? 0}</Text>
                  <Text style={[statsStyles.statLabel, { color: Colors.error }]}>Report ricevuti</Text>
                </View>
                <View style={statsStyles.statBox}>
                  <Text style={statsStyles.statNumber}>{stats.user?.totalKm?.toFixed(0) ?? 0}</Text>
                  <Text style={statsStyles.statLabel}>Km totali</Text>
                </View>
                <View style={statsStyles.statBox}>
                  <Text style={statsStyles.statNumber}>{stats.user?.totalRides ?? 0}</Text>
                  <Text style={statsStyles.statLabel}>Giri totali</Text>
                </View>
              </View>
            </View>

            <View style={statsStyles.section}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <Text style={statsStyles.sectionTitle}>Zone di Sosta (AI)</Text>
                <TouchableOpacity onPress={() => setFzEnabled(!fzEnabled)}>
                  <MaterialIcons
                    name={fzEnabled ? "visibility" : "visibility-off"}
                    size={22}
                    color={fzEnabled ? Colors.accent : Colors.textSecondary}
                  />
                </TouchableOpacity>
              </View>
              {!fzEnabled ? (
                <Text style={fzStyles.note}>I dati sono oscurati per privacy. Premi l'icona per visualizzare.</Text>
              ) : fzLoading ? (
                <Text style={fzStyles.note}>Caricamento zone...</Text>
              ) : fzError ? (
                <Text style={[fzStyles.note, { color: Colors.error }]}>Errore durante il caricamento</Text>
              ) : fzData.length === 0 ? (
                <Text style={fzStyles.note}>Nessuna zona rilevata per questo utente.</Text>
              ) : (
                <>
                  <View style={fzStyles.row}>
                    {["H", "W", "P"].map((type) => {
                      const zone = fzData.find((z) => z.type === type);
                      return (
                        <TouchableOpacity
                          key={type}
                          disabled={!zone}
                          style={[fzStyles.chip, !zone && fzStyles.chipDisabled]}
                          onPress={() => zone && onZonePress(zone)}
                        >
                          <Text style={[fzStyles.chipNum, !zone && fzStyles.chipTextDisabled]}>
                            {zone ? zone.visitCount : 0}
                          </Text>
                          <Text style={fzStyles.chipType}>
                            {type === "H" ? "Casa" : type === "W" ? "Lavoro" : "Frequent"}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                  <Text style={fzStyles.note}>Premi una zona per vederla sulla mappa.</Text>
                </>
              )}
            </View>

            {(stats.devices?.length ?? 0) > 0 && (
              <View style={statsStyles.section}>
                <Text style={statsStyles.sectionTitle}>Dispositivi usati</Text>
                {(stats.devices ?? []).map((d, i) => {
                  const osPart = [d.platform, d.osVersion].filter(Boolean).join(" ");
                  return (
                    <View key={i} style={statsStyles.motoCard}>
                      <Text style={statsStyles.motoTitle}>{d.model}</Text>
                      <Text style={statsStyles.motoSub}>
                        {osPart || "—"} · Ultimo: {formatDateIT(d.lastSeenAt)} · Primo: {formatDateIT(d.firstSeenAt)}
                      </Text>
                    </View>
                  );
                })}
              </View>
            )}

            {(stats.motorcycles?.length ?? 0) > 0 && (
              <View style={statsStyles.section}>
                <Text style={statsStyles.sectionTitle}>Garage</Text>
                {(stats.motorcycles ?? []).map((m, i) => (
                  <View key={i} style={statsStyles.motoCard}>
                    <Text style={statsStyles.motoTitle}>{m.brand} {m.model} ({m.year})</Text>
                    <Text style={statsStyles.motoSub}>{m.displacement}cc · {m.motorcycleType} · {m.ridingStyle}</Text>
                  </View>
                ))}
              </View>
            )}

            <View style={statsStyles.section}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <Text style={statsStyles.sectionTitle}>Sessioni Attive</Text>
                {sessions && (
                  <View style={[sessionStyles.countBadge, { backgroundColor: Colors.surfaceLight }]}>
                    <MaterialIcons name="devices" size={14} color={Colors.textSecondary} />
                    <Text style={[sessionStyles.countText, { color: Colors.textSecondary }]}>
                      {sessions.webCount} Web / {sessions.mobileCount} Mobile
                    </Text>
                  </View>
                )}
              </View>

              {!sessions ? (
                <Text style={{ color: Colors.textSecondary, fontSize: 13, marginTop: 4 }}>Caricamento sessioni...</Text>
              ) : (sessions.sessions?.length ?? 0) === 0 ? (
                <Text style={{ color: Colors.textSecondary, fontSize: 13, marginTop: 4 }}>Nessuna sessione attiva</Text>
              ) : (
                <View style={{ marginTop: 8 }}>
                  {(sessions.sessions ?? []).map((sess) => (
                    <View key={sess.sid} style={sessionStyles.sessionRow}>
                      <View style={sessionStyles.sessionInfo}>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                          <MaterialIcons
                            name={sess.sessionType === "web" ? "language" : "phone-iphone"}
                            size={14}
                            color={Colors.textSecondary}
                          />
                          <Text style={sessionStyles.sessionSid} numberOfLines={1}>
                            ID: {sess.displaySid ?? sess.sid}
                          </Text>
                        </View>
                        {sess.expiry && (
                          <Text style={sessionStyles.sessionExpiry}>
                            Scade: {formatDateIT(sess.expiry)}
                          </Text>
                        )}
                      </View>
                      <TouchableOpacity
                        style={sessionStyles.revokeBtn}
                        onPress={() => onRevokeSession(sess.sid)}
                      >
                        <Text style={sessionStyles.revokeBtnText}>Revoca</Text>
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              )}
            </View>

            <View style={statsStyles.section}>
              <Text style={statsStyles.sectionTitle}>Sessioni App</Text>
              <UserSessionStatsBlock sessionStats={stats.sessionStats} />
            </View>

            <PrivacySection userId={user.id} />
          </ScrollView>
        ) : (

          <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
            <Text style={{ color: Colors.error }}>Errore nel caricamento dei dettagli</Text>
          </View>
        )}
      </View>
    </Modal>
  );
};
