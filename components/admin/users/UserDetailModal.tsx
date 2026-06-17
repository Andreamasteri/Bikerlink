import React, { useState } from "react";
import { View, Text, Modal, TouchableOpacity, ScrollView, Platform } from "react-native";
import { Ionicons, MaterialIcons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import Colors from "@/constants/colors";
import { AdminUser } from "./UserCard";
import { SessionStats } from "@/components/admin/analytics/UserStatsContent";
import { UserSessionStatsBlock } from "./UserSessionStatsBlock";
import { sessionStyles, fzStyles, statsStyles, privacyStyles } from "./UserDetailModal.parts";
import { getApiUrl } from "@/lib/query-client";

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

type PrivacyLogEntry = { newValue: boolean; changedAt: string };
type PrivacyOverview = {
  currentSettings: Record<string, boolean | number | string>;
  log: Record<string, PrivacyLogEntry[]>;
};

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

function PrivacySection({ userId }: { userId: string }) {
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
                <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                  <MaterialIcons name={stats.user.isOnline ? "wifi" : "wifi-off"} size={16} color={stats.user.isOnline ? Colors.success : Colors.error} />
                  <Text style={[statsStyles.value, { color: stats.user.isOnline ? Colors.success : Colors.error }]}>{stats.user.isOnline ? "Online" : "Offline"}</Text>
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

            {(stats.moderatorLogs?.length ?? 0) > 0 && (
              <View style={statsStyles.section}>
                <Text style={statsStyles.sectionTitle}>Log Moderazione</Text>
                {(stats.moderatorLogs ?? []).map((l, i) => (
                  <View key={i} style={statsStyles.logItem}>
                    <Text style={statsStyles.logText}>{l.action} (da {l.moderatorNickname})</Text>
                    <Text style={statsStyles.logDate}>{formatDateIT(l.createdAt)}</Text>
                  </View>
                ))}
              </View>
            )}

            {(stats.adClicks?.length ?? 0) > 0 && (
              <View style={statsStyles.section}>
                <Text style={statsStyles.sectionTitle}>Click Pubblicitari</Text>
                {(stats.adClicks ?? []).map((c, i) => (
                  <View key={i} style={statsStyles.logItem}>
                    <Text style={statsStyles.logText}>{c.adTitle}</Text>
                    <Text style={statsStyles.logDate}>{formatDateIT(c.clickedAt)}</Text>
                  </View>
                ))}
              </View>
            )}
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

