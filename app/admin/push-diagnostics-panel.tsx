import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  FlatList,
} from "react-native";
import { useQuery } from "@tanstack/react-query";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import { apiRequest, getApiUrl } from "@/lib/query-client";

// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────
export interface ByPlatform {
  ios: number;
  android: number;
  web: number;
  unknown: number;
}

export interface CauseRow {
  cause: string;
  count: number;
  lastAt: string | null;
  byPlatform: ByPlatform;
}

export interface PushTokenStatsResponse {
  summary: {
    totalReal: number;
    withToken: number;
    withoutToken: number;
  };
  causes: CauseRow[];
}

export interface AdminTokenRow {
  id: string;
  nickname: string;
  role: string;
  hasToken: boolean;
  tokenCount: number;
  lastRegisteredAt: string | null;
  error: string | null;
}

export interface AdminPushTokenStatsResponse {
  summary: {
    totalAdmins: number;
    withToken: number;
    withoutToken: number;
  };
  admins: AdminTokenRow[];
}

export interface PushUserRow {
  id: string;
  nickname: string;
  platform: string | null;
  detail: string | null;
  errorAt: string | null;
}

export interface PushUsersResponse {
  cause: string;
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  users: PushUserRow[];
}

export interface CauseMeta {
  label: string;
  description: string;
  icon: React.ComponentProps<typeof MaterialCommunityIcons>["name"];
  color: string;
}

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────
export function causeMeta(cause: string): CauseMeta {
  const map: Record<string, CauseMeta> = {
    PERMESSI_NEGATI: {
      label: "Permessi negati",
      description: "L'utente ha rifiutato i permessi notifiche",
      icon: "bell-off",
      color: "#ef4444",
    },
    PROJECT_ID_MANCANTE: {
      label: "Project ID mancante",
      description: "Configurazione FCM/APNs assente nel build",
      icon: "cog-off",
      color: "#f59e0b",
    },
    TOKEN_NON_OTTENUTO: {
      label: "Token non ottenuto",
      description: "Il servizio push non ha restituito un token",
      icon: "key-remove",
      color: "#f97316",
    },
    TOKEN_VUOTO: {
      label: "Token vuoto",
      description: "Token restituito vuoto dal servizio push",
      icon: "key-alert",
      color: "#eab308",
    },
    ERRORE_REGISTRAZIONE: {
      label: "Errore registrazione",
      description: "Eccezione durante la registrazione del token",
      icon: "alert-circle",
      color: "#dc2626",
    },
    NESSUNA_CAUSA: {
      label: "Causa sconosciuta",
      description: "Nessun token e nessun errore registrato (offline / mai aperta l'app)",
      icon: "help-circle",
      color: "#6b7280",
    },
  };
  return (
    map[cause] ?? {
      label: cause,
      description: "Causa non classificata",
      icon: "help-circle",
      color: "#6b7280",
    }
  );
}

export function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function platformIcon(
  platform: string | null
): React.ComponentProps<typeof MaterialCommunityIcons>["name"] {
  if (!platform) return "devices";
  const p = platform.toLowerCase();
  if (p === "ios") return "apple";
  if (p === "android") return "android";
  return "devices";
}

// ──────────────────────────────────────────────
// PlatformBadge
// ──────────────────────────────────────────────
interface PlatformBadgeProps {
  label: string;
  count: number;
  color: string;
  icon: React.ComponentProps<typeof MaterialCommunityIcons>["name"];
}

export function PlatformBadge({ label, count, color, icon }: PlatformBadgeProps) {
  const colors = useColors();
  if (count === 0) return null;
  return (
    <View style={[pb.badge, { backgroundColor: color + "18", borderColor: color + "44" }]}>
      <MaterialCommunityIcons name={icon} size={11} color={color} />
      <Text style={[pb.label, { color }]}>{label}</Text>
      <Text style={[pb.count, { color: colors.text }]}>{count.toLocaleString("it-IT")}</Text>
    </View>
  );
}

const pb = StyleSheet.create({
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
  },
  label: { fontFamily: "Inter_600SemiBold", fontSize: 10 },
  count: { fontFamily: "Inter_700Bold", fontSize: 10 },
});

// ──────────────────────────────────────────────
// CauseUsersPanel — drill-down utenti per causa
// ──────────────────────────────────────────────
export function CauseUsersPanel({
  cause,
  onClose,
}: {
  cause: string;
  onClose: () => void;
}) {
  const colors = useColors();
  const [page, setPage] = useState(1);
  const limit = 20;
  const meta = causeMeta(cause);

  const { data, isLoading, isError, refetch } = useQuery<PushUsersResponse>({
    queryKey: ["/api/admin/users/stats/push-tokens/users", cause, page],
    queryFn: async () => {
      const url = new URL(`/api/admin/users/stats/push-tokens/users`, getApiUrl());
      url.searchParams.set("cause", cause);
      url.searchParams.set("page", String(page));
      url.searchParams.set("limit", String(limit));
      const res = await apiRequest("GET", url.pathname + url.search);
      return res.json() as Promise<PushUsersResponse>;
    },
    staleTime: 30_000,
  });

  const users = data?.users ?? [];
  const totalPages = data?.totalPages ?? 1;
  const total = data?.total ?? 0;

  return (
    <View style={[ud.panel, { backgroundColor: colors.background }]}>
      <View style={[ud.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={onClose} style={ud.backBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <MaterialCommunityIcons name="arrow-left" size={22} color={colors.accent} />
        </TouchableOpacity>
        <View style={[ud.causeIconSmall, { backgroundColor: meta.color + "22" }]}>
          <MaterialCommunityIcons name={meta.icon} size={16} color={meta.color} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[ud.headerTitle, { color: colors.text }]} numberOfLines={1}>
            {meta.label}
          </Text>
          {!isLoading && (
            <Text style={[ud.headerSub, { color: colors.textSecondary }]}>
              {total.toLocaleString("it-IT")} utenti
            </Text>
          )}
        </View>
      </View>

      {isLoading && (
        <View style={ud.centered}>
          <ActivityIndicator size="large" color={colors.accent} />
        </View>
      )}

      {isError && !isLoading && (
        <View style={ud.centered}>
          <MaterialCommunityIcons name="alert-circle-outline" size={32} color="#ef4444" />
          <Text style={[ud.errorText, { color: colors.textSecondary }]}>Errore nel caricamento</Text>
          <TouchableOpacity onPress={() => refetch()} style={[ud.retryBtn, { borderColor: colors.accent }]}>
            <Text style={[ud.retryBtnText, { color: colors.accent }]}>Riprova</Text>
          </TouchableOpacity>
        </View>
      )}

      {!isLoading && !isError && users.length === 0 && (
        <View style={ud.centered}>
          <MaterialCommunityIcons name="check-circle-outline" size={32} color="#22c55e" />
          <Text style={[ud.errorText, { color: colors.textSecondary }]}>Nessun utente trovato</Text>
        </View>
      )}

      {!isLoading && !isError && users.length > 0 && (
        <FlatList
          data={users}
          keyExtractor={(u) => String(u.id)}
          contentContainerStyle={{ paddingBottom: 16 }}
          ItemSeparatorComponent={() => (
            <View style={[ud.separator, { backgroundColor: colors.border }]} />
          )}
          renderItem={({ item }) => (
            <View style={ud.userRow}>
              <View style={[ud.platformBadge, { backgroundColor: colors.surface }]}>
                <MaterialCommunityIcons
                  name={platformIcon(item.platform)}
                  size={18}
                  color={colors.textSecondary}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[ud.nickname, { color: colors.text }]}>{item.nickname}</Text>
                {item.platform && (
                  <Text style={[ud.meta, { color: colors.textSecondary }]}>
                    {item.platform.toUpperCase()}
                    {item.detail ? ` · ${item.detail}` : ""}
                  </Text>
                )}
                {!item.platform && item.detail && (
                  <Text style={[ud.meta, { color: colors.textSecondary }]} numberOfLines={2}>
                    {item.detail}
                  </Text>
                )}
                <Text style={[ud.ts, { color: colors.textSecondary }]}>{formatDate(item.errorAt)}</Text>
              </View>
              <Text style={[ud.userId, { color: colors.textSecondary }]}>#{item.id}</Text>
            </View>
          )}
          ListFooterComponent={
            totalPages > 1 ? (
              <View style={ud.pagination}>
                <TouchableOpacity
                  onPress={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  style={[ud.pageBtn, { borderColor: colors.border, opacity: page <= 1 ? 0.35 : 1 }]}
                >
                  <MaterialCommunityIcons name="chevron-left" size={18} color={colors.accent} />
                </TouchableOpacity>
                <Text style={[ud.pageLabel, { color: colors.textSecondary }]}>
                  {page} / {totalPages}
                </Text>
                <TouchableOpacity
                  onPress={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  style={[ud.pageBtn, { borderColor: colors.border, opacity: page >= totalPages ? 0.35 : 1 }]}
                >
                  <MaterialCommunityIcons name="chevron-right" size={18} color={colors.accent} />
                </TouchableOpacity>
              </View>
            ) : null
          }
        />
      )}
    </View>
  );
}

const ud = StyleSheet.create({
  panel: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  backBtn: { marginRight: 2 },
  causeIconSmall: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: { fontFamily: "Inter_700Bold", fontSize: 15 },
  headerSub: { fontFamily: "Inter_400Regular", fontSize: 12, marginTop: 1 },
  centered: {
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 60,
    gap: 12,
  },
  errorText: { fontFamily: "Inter_400Regular", fontSize: 14 },
  retryBtn: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  retryBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 14 },
  separator: { height: 1, marginHorizontal: 16 },
  userRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  platformBadge: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  nickname: { fontFamily: "Inter_600SemiBold", fontSize: 14 },
  meta: { fontFamily: "Inter_400Regular", fontSize: 12, marginTop: 2 },
  ts: { fontFamily: "Inter_400Regular", fontSize: 11, marginTop: 2 },
  userId: { fontFamily: "Inter_400Regular", fontSize: 11 },
  pagination: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
    paddingVertical: 16,
  },
  pageBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  pageLabel: { fontFamily: "Inter_400Regular", fontSize: 14 },
});
