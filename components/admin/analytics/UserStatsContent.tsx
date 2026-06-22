import React from "react";
import { View, Text, StyleSheet, ScrollView } from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import Colors from "@/constants/colors";

export interface SessionStats {
  avgDurationSeconds: number;
  totalSessions: number;
  exitBreakdown: {
    background: number;
    logout: number;
    crash: number;
    unknown: number;
  };
  platformBreakdown?: Record<string, { sessions: number; avgDuration: number }>;
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
  motorcycles: {
    brand: string;
    model: string;
    year: number;
    displacement: number;
    motorcycleType: string;
    ridingStyle: string;
  }[];
  moderatorLogs: { action: string; createdAt: string; moderatorNickname: string }[];
  sessionStats?: SessionStats;
}

function formatDuration(seconds: number): string {
  if (seconds <= 0) return "0s";
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m < 60) return s > 0 ? `${m}m ${s}s` : `${m}m`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return rm > 0 ? `${h}h ${rm}m` : `${h}h`;
}

const EXIT_ICON_MAP: Record<string, { name: keyof typeof MaterialIcons.glyphMap; color: string }> = {
  background: { name: "pause-circle-outline", color: Colors.textSecondary },
  logout: { name: "logout", color: Colors.accent },
  crash: { name: "warning", color: Colors.error },
  unknown: { name: "help-outline", color: Colors.textSecondary },
};

const PLATFORM_CONFIG: Record<string, { label: string; icon: keyof typeof MaterialIcons.glyphMap; color: string }> = {
  ios: { label: "iOS", icon: "phone-iphone", color: "#007AFF" },
  android: { label: "Android", icon: "android", color: "#3DDC84" },
};

function SessionStatsBlock({ sessionStats }: { sessionStats: SessionStats }) {
  const { avgDurationSeconds, totalSessions, exitBreakdown, platformBreakdown } = sessionStats;
  const safeTotal = totalSessions > 0 ? totalSessions : 1;

  const exitEntries = [
    { key: "background", label: "Background", count: exitBreakdown.background },
    { key: "logout", label: "Logout", count: exitBreakdown.logout },
    { key: "crash", label: "Crash", count: exitBreakdown.crash },
    { key: "unknown", label: "Sconosciuto", count: exitBreakdown.unknown },
  ];

  const platformEntries = Object.entries(platformBreakdown ?? {})
    .filter(([key]) => key !== "unknown")
    .sort(([a], [b]) => a.localeCompare(b));

  return (
    <View>
      <View style={sessionStyles.kpiRow}>
        <View style={sessionStyles.kpiBox}>
          <Text style={sessionStyles.kpiNumber}>{totalSessions}</Text>
          <Text style={sessionStyles.kpiLabel}>Sessioni totali</Text>
        </View>
        <View style={sessionStyles.kpiBox}>
          <Text style={sessionStyles.kpiNumber}>{formatDuration(avgDurationSeconds)}</Text>
          <Text style={sessionStyles.kpiLabel}>Durata media</Text>
        </View>
      </View>
      {platformEntries.length > 0 && (
        <View style={sessionStyles.platformBlock}>
          <Text style={sessionStyles.exitTitle}>Piattaforma</Text>
          <View style={sessionStyles.platformRow}>
            {platformEntries.map(([key, data]) => {
              const cfg = PLATFORM_CONFIG[key] ?? { label: key, icon: "devices" as keyof typeof MaterialIcons.glyphMap, color: Colors.textSecondary };
              return (
                <View key={key} style={sessionStyles.platformChip}>
                  <MaterialIcons name={cfg.icon} size={16} color={cfg.color} />
                  <Text style={[sessionStyles.platformLabel, { color: cfg.color }]}>{cfg.label}</Text>
                  <Text style={sessionStyles.platformSessions}>{data.sessions} sess.</Text>
                  <Text style={sessionStyles.platformDuration}>{formatDuration(data.avgDuration)} media</Text>
                </View>
              );
            })}
          </View>
        </View>
      )}
      {totalSessions > 0 ? (
        <View style={sessionStyles.exitBlock}>
          <Text style={sessionStyles.exitTitle}>Tipo di uscita</Text>
          {exitEntries.filter((e) => e.count > 0).map(({ key, label, count }) => {
            const icon = EXIT_ICON_MAP[key] ?? EXIT_ICON_MAP.unknown;
            const pct = ((count / safeTotal) * 100).toFixed(1);
            return (
              <View key={key} style={sessionStyles.exitRow}>
                <MaterialIcons name={icon.name} size={14} color={icon.color} />
                <Text style={[sessionStyles.exitLabel, { color: icon.color }]}>{label}</Text>
                <View style={sessionStyles.barTrack}>
                  <View style={[sessionStyles.barFill, { width: `${(count / safeTotal) * 100}%` as `${number}%`, backgroundColor: icon.color }]} />
                </View>
                <Text style={sessionStyles.exitCount}>{count} <Text style={sessionStyles.exitPct}>({pct}%)</Text></Text>
              </View>
            );
          })}
        </View>
      ) : (
        <Text style={sessionStyles.emptyNote}>Nessuna sessione registrata.</Text>
      )}
    </View>
  );
}

interface UserStatsContentProps {
  stats: UserStatsData;
  formatDate: (date: string | null) => string;
  timeAgo: (date: string | null) => string;
  getRoleColor: (role: string) => string;
  getStatusColor: (status: string) => string;
}

export const UserStatsContent: React.FC<UserStatsContentProps> = ({
  stats: s,
  formatDate,
  timeAgo,
  getRoleColor,
  getStatusColor,
}) => {
  const u = s.user;
  const daysSinceRegistration = Math.floor(
    (Date.now() - new Date(u.createdAt).getTime()) / (1000 * 60 * 60 * 24)
  );

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }}>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Informazioni</Text>
        <View style={styles.row}>
          <Text style={styles.label}>Nickname</Text>
          <Text style={styles.value}>{u.nickname}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Email</Text>
          <Text style={styles.value}>{u.email}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Tipo</Text>
          <Text style={styles.value}>{u.userType}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Ruolo</Text>
          <Text style={[styles.value, { color: getRoleColor(u.role) }]}>{u.role}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Stato</Text>
          <Text style={[styles.value, { color: getStatusColor(u.status) }]}>{u.status}</Text>
        </View>
        {u.bio && (
          <View style={styles.row}>
            <Text style={styles.label}>Bio</Text>
            <Text style={[styles.value, { flex: 1, textAlign: "right" as const }]} numberOfLines={3}>
              {u.bio}
            </Text>
          </View>
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Connessione</Text>
        <View style={styles.row}>
          <Text style={styles.label}>Ultimo accesso</Text>
          <Text style={styles.value}>{timeAgo(u.lastLoginAt)}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Data ultimo accesso</Text>
          <Text style={styles.value}>{formatDate(u.lastLoginAt)}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Registrazione</Text>
          <Text style={styles.value}>{formatDate(u.createdAt)}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Giorni dall'iscrizione</Text>
          <Text style={styles.value}>{daysSinceRegistration}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Disponibile</Text>
          <MaterialIcons
            name={u.isAvailable ? "check-circle" : "cancel"}
            size={18}
            color={u.isAvailable ? Colors.success : Colors.error}
          />
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Attivit&agrave;</Text>
        <View style={styles.statsGrid}>
          <View style={styles.statBox}>
            <Text style={styles.statNumber}>{s.stats.proposalsCreated}</Text>
            <Text style={styles.statLabel}>Proposte</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statNumber}>{s.stats.conversationsCount}</Text>
            <Text style={styles.statLabel}>Conversazioni</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statNumber}>{s.stats.messagesSent}</Text>
            <Text style={styles.statLabel}>Messaggi</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statNumber}>{s.stats.reportsFiled}</Text>
            <Text style={styles.statLabel}>Segnalazioni fatte</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statNumber}>{s.stats.reportsReceived}</Text>
            <Text style={styles.statLabel}>Segnalazioni ricevute</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statNumber}>{u.totalRides ?? 0}</Text>
            <Text style={styles.statLabel}>Percorsi</Text>
          </View>
        </View>
        {(u.totalKm ?? 0) > 0 && (
          <View style={styles.row}>
            <Text style={styles.label}>Km totali</Text>
            <Text style={styles.value}>{u.totalKm} km</Text>
          </View>
        )}
      </View>

      {s.motorcycles.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Moto</Text>
          {s.motorcycles.map((m, i) => (
            <View key={i} style={styles.motoCard}>
              <Text style={styles.motoTitle}>
                {m.brand} {m.model}
              </Text>
              <Text style={styles.motoSub}>
                {m.year} - {m.displacement}cc - {m.motorcycleType} - {m.ridingStyle}
              </Text>
            </View>
          ))}
        </View>
      )}

      {s.adClicks.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Click Ads ({s.adClicks.length})</Text>
          {s.adClicks.map((click) => (
            <View key={click.id} style={styles.logItem}>
              <Text style={styles.logText}>{click.adTitle || "N/A"}</Text>
              <Text style={styles.logDate}>{formatDate(click.clickedAt)}</Text>
            </View>
          ))}
        </View>
      )}

      {s.moderatorLogs.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Log moderazione</Text>
          {s.moderatorLogs.map((log, i) => (
            <View key={i} style={styles.logItem}>
              <Text style={styles.logText}>
                {log.action} (da {log.moderatorNickname || "sistema"})
              </Text>
              <Text style={styles.logDate}>{formatDate(log.createdAt)}</Text>
            </View>
          ))}
        </View>
      )}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Sessioni App</Text>
        {s.sessionStats ? (
          <SessionStatsBlock sessionStats={s.sessionStats} />
        ) : (
          <Text style={styles.logText}>Dati sessione non disponibili.</Text>
        )}
      </View>
    </ScrollView>
  );
};

import { styles, sessionStyles } from "./UserStatsContent.styles";
