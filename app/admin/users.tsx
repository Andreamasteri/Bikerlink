import React, { useState } from "react";
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Alert, Modal, TextInput, Platform, ScrollView } from "react-native";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Ionicons, MaterialIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Constants from "expo-constants";
import Colors from "@/constants/colors";
import { apiRequest, queryClient, getApiUrl } from "@/lib/query-client";
import { CURRENT_OTA_NUMBER } from "@/lib/ota";

interface AdminUser {
  id: string;
  nickname: string;
  email: string;
  phone?: string;
  userType: string;
  role: string;
  status: string;
  createdAt: string;
  lastLoginAt?: string | null;
  lastAppVersion?: string | null;
  lastOtaNumber?: number | null;
  isFake?: boolean;
  isPrimal?: boolean;
  hasLastfmData?: boolean;
}

interface UserSummaryStats {
  totale: { real: number; fake: number };
  biker: {
    total: { real: number; fake: number };
    M: { real: number; fake: number };
    F: { real: number; fake: number };
  };
  zavorrina: {
    total: { real: number; fake: number };
    M: { real: number; fake: number };
    F: { real: number; fake: number };
  };
  coppia: {
    total: { real: number; fake: number };
  };
}

interface UserStats {
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
}

function formatDateIT(dateStr: string | null): string {
  if (!dateStr) return "Mai";
  const d = new Date(dateStr);
  return d.toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}


export default function AdminUsers() {
  const rawInsets = useSafeAreaInsets();
  const insets = Platform.OS === "web"
    ? { top: 67, bottom: 34, left: rawInsets.left, right: rawInsets.right }
    : rawInsets;

  const [editModalVisible, setEditModalVisible] = useState(false);
  const [statsModalVisible, setStatsModalVisible] = useState(false);
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);
  const [editEmail, setEditEmail] = useState("");
  const [editPassword, setEditPassword] = useState("");
  const [searchText, setSearchText] = useState("");
  const [hideFake, setHideFake] = useState(true);

  const { data: users = [], isLoading } = useQuery<AdminUser[]>({
    queryKey: ["/api/admin/users"],
  });

  const { data: summary } = useQuery<UserSummaryStats>({
    queryKey: ["/api/admin/users/stats/summary"],
  });

  const statsQuery = useQuery<UserStats>({
    queryKey: ["/api/admin/users", selectedUser?.id, "stats"],
    enabled: statsModalVisible && !!selectedUser,
    queryFn: async () => {
      const url = new URL(`/api/admin/users/${selectedUser!.id}/stats`, getApiUrl());
      const res = await fetch(url.toString(), { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch stats");
      return res.json();
    },
  });

  const statusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const res = await apiRequest("PUT", `/api/admin/users/${id}/status`, { status });
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] }),
  });

  const roleMutation = useMutation({
    mutationFn: async ({ id, role }: { id: string; role: string }) => {
      const res = await apiRequest("PUT", `/api/admin/users/${id}/role`, { role });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users/stats/summary"] });
    },
  });

  const emailMutation = useMutation({
    mutationFn: async ({ id, email }: { id: string; email: string }) => {
      const res = await apiRequest("PUT", `/api/admin/users/${id}/email`, { email });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      Alert.alert("Successo", "Email aggiornata");
    },
    onError: () => Alert.alert("Errore", "Impossibile aggiornare l'email"),
  });

  const passwordMutation = useMutation({
    mutationFn: async ({ id, password }: { id: string; password: string }) => {
      const res = await apiRequest("PUT", `/api/admin/users/${id}/password`, { password });
      return res.json();
    },
    onSuccess: () => {
      Alert.alert("Successo", "Password aggiornata");
      setEditPassword("");
    },
    onError: () => Alert.alert("Errore", "Impossibile aggiornare la password"),
  });

  const deleteMutation = useMutation({
    mutationFn: async ({ id }: { id: string }) => {
      const res = await apiRequest("DELETE", `/api/admin/users/${id}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users/stats/summary"] });
      Alert.alert("Successo", "Profilo eliminato");
    },
    onError: () => Alert.alert("Errore", "Impossibile eliminare il profilo"),
  });

  const primalMutation = useMutation({
    mutationFn: async ({ id, isPrimal }: { id: string; isPrimal: boolean }) => {
      const res = await apiRequest("PUT", `/api/admin/users/${id}/primal`, { isPrimal });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
    },
    onError: () => Alert.alert("Errore", "Impossibile aggiornare stato Primal"),
  });

  const clearLastfmMutation = useMutation({
    mutationFn: async ({ id }: { id: string }) => {
      const res = await apiRequest("DELETE", `/api/admin/users/${id}/lastfm`);
      return res.json() as Promise<{ message: string; deleted: { tracks: number; sessions: number; snapshots: number } }>;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      const { tracks, sessions, snapshots } = data.deleted;
      Alert.alert("Last.fm cancellato", `Rimossi: ${tracks} brani, ${sessions} sessioni, ${snapshots} snapshot`);
    },
    onError: () => Alert.alert("Errore", "Impossibile cancellare i dati Last.fm"),
  });

  const filteredUsers = users.filter((u) => {
    if (hideFake && u.isFake === true) return false;
    if (!searchText) return true;
    const q = searchText.toLowerCase();
    return u.nickname.toLowerCase().includes(q) || u.email.toLowerCase().includes(q) || (u.phone?.toLowerCase().includes(q) ?? false);
  });

  function openEditModal(user: AdminUser) {
    setSelectedUser(user);
    setEditEmail(user.email);
    setEditPassword("");
    setEditModalVisible(true);
  }

  function openStatsModal(user: AdminUser) {
    setSelectedUser(user);
    setStatsModalVisible(true);
  }

  function handleSaveEmail() {
    if (!selectedUser) return;
    if (!editEmail || !editEmail.includes("@")) {
      Alert.alert("Errore", "Inserisci un'email valida");
      return;
    }
    emailMutation.mutate({ id: selectedUser.id, email: editEmail });
  }

  function handleSavePassword() {
    if (!selectedUser) return;
    if (!editPassword || editPassword.length < 6) {
      Alert.alert("Errore", "La password deve avere almeno 6 caratteri");
      return;
    }
    passwordMutation.mutate({ id: selectedUser.id, password: editPassword });
  }

  function handleStatusChange(user: AdminUser) {
    const options = ["active", "suspended", "blocked"].filter((s) => s !== user.status);
    Alert.alert("Cambia stato", `Utente: ${user.nickname}`, [
      ...options.map((status) => ({
        text: status.charAt(0).toUpperCase() + status.slice(1),
        onPress: () => statusMutation.mutate({ id: user.id, status }),
      })),
      { text: "Annulla", style: "cancel" as const },
    ]);
  }

  function handleMakeModerator(user: AdminUser) {
    Alert.alert(
      "Rendi Moderatore",
      `Vuoi rendere ${user.nickname} un moderatore?`,
      [
        { text: "Annulla", style: "cancel" as const },
        {
          text: "Conferma",
          onPress: () => roleMutation.mutate({ id: user.id, role: "moderator" }),
        },
      ]
    );
  }

  function handleDeleteUser(user: AdminUser) {
    Alert.alert(
      "Elimina profilo",
      `Sei sicuro di voler eliminare il profilo di ${user.nickname}?`,
      [
        { text: "Annulla", style: "cancel" as const },
        {
          text: "Elimina",
          style: "destructive" as const,
          onPress: () => {
            Alert.alert(
              "Conferma eliminazione",
              "Questa azione è irreversibile. Procedere?",
              [
                { text: "Annulla", style: "cancel" as const },
                {
                  text: "Elimina definitivamente",
                  style: "destructive" as const,
                  onPress: () => deleteMutation.mutate({ id: user.id }),
                },
              ]
            );
          },
        },
      ]
    );
  }

  function handleClearLastfm(user: AdminUser) {
    Alert.alert(
      "Clear Last.fm",
      `Cancellare tutti i dati Last.fm di ${user.nickname}? (brani, sessione, snapshot)`,
      [
        { text: "Annulla", style: "cancel" as const },
        {
          text: "Cancella",
          style: "destructive" as const,
          onPress: () => clearLastfmMutation.mutate({ id: user.id }),
        },
      ]
    );
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

  function renderUser({ item }: { item: AdminUser }) {
    return (
      <TouchableOpacity style={styles.card} onPress={() => openStatsModal(item)} activeOpacity={0.7}>
        <View style={styles.userInfo}>
          {item.isFake === true && (
            <Text style={{ fontSize: 10, fontWeight: "bold" as const, color: "#FF00FF" }}>FAKE</Text>
          )}
          {item.isPrimal === true && (
            <Text style={{ fontSize: 10, fontWeight: "bold" as const, color: "#FF3B30" }}>PRIMAL</Text>
          )}
          <Text style={styles.nickname}>{item.nickname}</Text>
          <Text style={styles.email}>{item.email}</Text>
          <View style={styles.badges}>
            <View style={[styles.badge, { backgroundColor: getStatusColor(item.status) + "33" }]}>
              <Text style={[styles.badgeText, { color: getStatusColor(item.status) }]}>{item.status}</Text>
            </View>
            <View style={[styles.badge, { backgroundColor: getRoleColor(item.role) + "33" }]}>
              <Text style={[styles.badgeText, { color: getRoleColor(item.role) }]}>{item.role}</Text>
            </View>
            <View style={[styles.badge, { backgroundColor: Colors.surfaceLight }]}>
              <Text style={[styles.badgeText, { color: Colors.textSecondary }]}>{item.userType}</Text>
            </View>
          </View>
          <Text style={styles.lastLogin}>
            {item.lastLoginAt
              ? `Ultimo accesso: ${new Date(item.lastLoginAt).toLocaleString("it-IT", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}`
              : "Mai connesso"}
          </Text>
          {(() => {
            const hasVer = !!item.lastAppVersion && item.lastAppVersion !== "unknown";
            const hasOta = item.lastOtaNumber != null;
            if (!hasVer && !hasOta) {
              return <Text style={styles.versionMissing}>v— / OTA —</Text>;
            }
            const verOk = item.lastAppVersion === CURRENT_APP_VERSION;
            const otaOk = item.lastOtaNumber === CURRENT_OTA_NUMBER;
            const allOk = verOk && otaOk;
            const color = allOk ? Colors.success : Colors.error;
            return (
              <Text style={[styles.versionBadge, { color, textDecorationLine: allOk ? "none" : "underline" as const }]}>
                {hasVer ? `v${item.lastAppVersion}` : "v—"} / {hasOta ? `OTA-${item.lastOtaNumber}` : "OTA —"}
              </Text>
            );
          })()}
        </View>
        <View style={styles.actions}>
          <TouchableOpacity onPress={() => openEditModal(item)} style={styles.actionBtn}>
            <Ionicons name="create-outline" size={22} color={Colors.accent} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => handleStatusChange(item)} style={styles.actionBtn}>
            <Ionicons name="ban-outline" size={22} color={Colors.textSecondary} />
          </TouchableOpacity>
          {item.role === "user" && (
            <TouchableOpacity onPress={() => handleMakeModerator(item)} style={styles.actionBtn}>
              <Ionicons name="shield-checkmark-outline" size={22} color={Colors.maleIcon} />
            </TouchableOpacity>
          )}
          {item.hasLastfmData && (
            <TouchableOpacity
              onPress={() => handleClearLastfm(item)}
              style={styles.actionBtn}
              disabled={clearLastfmMutation.isPending}
            >
              <Ionicons
                name="musical-notes-outline"
                size={22}
                color={clearLastfmMutation.isPending ? Colors.border : "#E31005"}
              />
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={() => handleDeleteUser(item)} style={styles.actionBtn}>
            <Ionicons name="trash-outline" size={22} color={Colors.error} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => primalMutation.mutate({ id: item.id, isPrimal: !item.isPrimal })}
            style={styles.actionBtn}
          >
            <Ionicons name="star" size={22} color={item.isPrimal ? "#FF3B30" : Colors.border} />
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    );
  }

  function renderStatsModal() {
    const s = statsQuery.data;
    if (!s) return null;

    const u = s.user;
    return (
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }}>
        <View style={statsStyles.section}>
          <Text style={statsStyles.sectionTitle}>Informazioni</Text>
          <View style={statsStyles.row}>
            <Text style={statsStyles.label}>Nickname</Text>
            <Text style={statsStyles.value}>{u.nickname}</Text>
          </View>
          <View style={statsStyles.row}>
            <Text style={statsStyles.label}>Email</Text>
            <Text style={statsStyles.value}>{u.email}</Text>
          </View>
          <View style={statsStyles.row}>
            <Text style={statsStyles.label}>Tipo</Text>
            <Text style={statsStyles.value}>{u.userType}</Text>
          </View>
          <View style={statsStyles.row}>
            <Text style={statsStyles.label}>Ruolo</Text>
            <Text style={[statsStyles.value, { color: getRoleColor(u.role) }]}>{u.role}</Text>
          </View>
          <View style={statsStyles.row}>
            <Text style={statsStyles.label}>Stato</Text>
            <Text style={[statsStyles.value, { color: getStatusColor(u.status) }]}>{u.status}</Text>
          </View>
          {u.bio && (
            <View style={statsStyles.row}>
              <Text style={statsStyles.label}>Bio</Text>
              <Text style={[statsStyles.value, { flex: 1, textAlign: "right" as const }]} numberOfLines={3}>{u.bio}</Text>
            </View>
          )}
        </View>

        <View style={statsStyles.section}>
          <Text style={statsStyles.sectionTitle}>Connessione</Text>
          <View style={statsStyles.row}>
            <Text style={statsStyles.label}>Registrazione</Text>
            <Text style={statsStyles.value}>{formatDateIT(u.createdAt)}</Text>
          </View>
          <View style={statsStyles.row}>
            <Text style={statsStyles.label}>Data e ora ultimo log in</Text>
            <Text style={statsStyles.value}>{formatDateIT(u.lastLoginAt)}</Text>
          </View>
          <View style={statsStyles.row}>
            <Text style={statsStyles.label}>Data e ora ultimo log out</Text>
            <Text style={statsStyles.value}>{formatDateIT(u.lastLogoutAt)}</Text>
          </View>
          <View style={statsStyles.row}>
            <Text style={statsStyles.label}>Data e ora chiusura app</Text>
            <Text style={statsStyles.value}>{formatDateIT(u.lastAppCloseAt)}</Text>
          </View>
          <View style={statsStyles.row}>
            <Text style={statsStyles.label}>Status</Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
              <MaterialIcons name={u.isOnline ? "wifi" : "wifi-off"} size={16} color={u.isOnline ? Colors.success : Colors.error} />
              <Text style={[statsStyles.value, { color: u.isOnline ? Colors.success : Colors.error }]}>{u.isOnline ? "Online" : "Offline"}</Text>
            </View>
          </View>
          <View style={statsStyles.row}>
            <Text style={statsStyles.label}>Disponibile</Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
              <MaterialIcons name={u.isAvailable ? "check-circle" : "cancel"} size={16} color={u.isAvailable ? Colors.success : Colors.error} />
              <Text style={[statsStyles.value, { color: u.isAvailable ? Colors.success : Colors.error }]}>{u.isAvailable ? "Sì" : "No"}</Text>
            </View>
          </View>
          <View style={statsStyles.row}>
            <Text style={statsStyles.label}>Ghost mode all'uscita app</Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
              <MaterialIcons name={u.ghostMode ? "check-circle" : "cancel"} size={16} color={u.ghostMode ? Colors.warning : Colors.textSecondary} />
              <Text style={[statsStyles.value, { color: u.ghostMode ? Colors.warning : Colors.textSecondary }]}>{u.ghostMode ? "Sì" : "No"}</Text>
            </View>
          </View>
        </View>

        <View style={statsStyles.section}>
          <Text style={statsStyles.sectionTitle}>Attivit&agrave;</Text>
          <View style={statsStyles.statsGrid}>
            <View style={statsStyles.statBox}>
              <Text style={statsStyles.statNumber}>{s.stats.proposalsCreated}</Text>
              <Text style={statsStyles.statLabel}>Proposte</Text>
            </View>
            <View style={statsStyles.statBox}>
              <Text style={statsStyles.statNumber}>{s.stats.conversationsCount}</Text>
              <Text style={statsStyles.statLabel}>Conversazioni</Text>
            </View>
            <View style={statsStyles.statBox}>
              <Text style={statsStyles.statNumber}>{s.stats.messagesSent}</Text>
              <Text style={statsStyles.statLabel}>Messaggi</Text>
            </View>
            <View style={statsStyles.statBox}>
              <Text style={statsStyles.statNumber}>{s.stats.reportsFiled}</Text>
              <Text style={statsStyles.statLabel}>Segnalazioni fatte</Text>
            </View>
            <View style={statsStyles.statBox}>
              <Text style={statsStyles.statNumber}>{s.stats.reportsReceived}</Text>
              <Text style={statsStyles.statLabel}>Segnalazioni ricevute</Text>
            </View>
            <View style={statsStyles.statBox}>
              <Text style={statsStyles.statNumber}>{u.totalRides ?? 0}</Text>
              <Text style={statsStyles.statLabel}>Percorsi</Text>
            </View>
          </View>
          {(u.totalKm ?? 0) > 0 && (
            <View style={statsStyles.row}>
              <Text style={statsStyles.label}>Km totali</Text>
              <Text style={statsStyles.value}>{u.totalKm} km</Text>
            </View>
          )}
        </View>

        {s.motorcycles.length > 0 && (
          <View style={statsStyles.section}>
            <Text style={statsStyles.sectionTitle}>Moto</Text>
            {s.motorcycles.map((m, i) => (
              <View key={i} style={statsStyles.motoCard}>
                <Text style={statsStyles.motoTitle}>{m.brand} {m.model}</Text>
                <Text style={statsStyles.motoSub}>{m.year} - {m.displacement}cc - {m.motorcycleType} - {m.ridingStyle}</Text>
              </View>
            ))}
          </View>
        )}

        {s.adClicks.length > 0 && (
          <View style={statsStyles.section}>
            <Text style={statsStyles.sectionTitle}>Click Ads ({s.adClicks.length})</Text>
            {s.adClicks.map((click) => (
              <View key={click.id} style={statsStyles.logItem}>
                <Text style={statsStyles.logText}>{click.adTitle || "N/A"}</Text>
                <Text style={statsStyles.logDate}>{formatDateIT(click.clickedAt)}</Text>
              </View>
            ))}
          </View>
        )}

        {s.moderatorLogs.length > 0 && (
          <View style={statsStyles.section}>
            <Text style={statsStyles.sectionTitle}>Log moderazione</Text>
            {s.moderatorLogs.map((log, i) => (
              <View key={i} style={statsStyles.logItem}>
                <Text style={statsStyles.logText}>{log.action} (da {log.moderatorNickname || "sistema"})</Text>
                <Text style={statsStyles.logDate}>{formatDateIT(log.createdAt)}</Text>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    );
  }

  const CURRENT_APP_VERSION = Constants.expoConfig?.version ?? "0.0.0";

  const n = (slot: { real: number; fake: number }) =>
    hideFake ? slot.real : slot.real + slot.fake;

  return (
    <View style={styles.container}>
      {summary && (
        <View style={summaryStyles.wrapper}>
          <Text style={summaryStyles.title}>ISCRITTI</Text>
          <View style={summaryStyles.grid}>
            <View style={[summaryStyles.card, { borderColor: Colors.accent + "66" }]}>
              <Text style={[summaryStyles.num, { color: Colors.accent }]}>{n(summary.totale).toLocaleString("it-IT")}</Text>
              <Text style={summaryStyles.lbl}>Totale</Text>
            </View>
            <View style={summaryStyles.card}>
              <Text style={summaryStyles.num}>{n(summary.biker.total).toLocaleString("it-IT")}</Text>
              <Text style={summaryStyles.lbl}>Biker</Text>
            </View>
            <View style={summaryStyles.card}>
              <Text style={[summaryStyles.num, { color: Colors.maleIcon }]}>{n(summary.biker.M).toLocaleString("it-IT")}</Text>
              <Text style={summaryStyles.lbl}>Biker ♂</Text>
            </View>
            <View style={summaryStyles.card}>
              <Text style={[summaryStyles.num, { color: Colors.femaleIcon }]}>{n(summary.biker.F).toLocaleString("it-IT")}</Text>
              <Text style={summaryStyles.lbl}>Biker ♀</Text>
            </View>
            <View style={summaryStyles.card}>
              <Text style={summaryStyles.num}>{n(summary.zavorrina.total).toLocaleString("it-IT")}</Text>
              <Text style={summaryStyles.lbl}>Zavorrine</Text>
            </View>
            <View style={summaryStyles.card}>
              <Text style={[summaryStyles.num, { color: Colors.maleIcon }]}>{n(summary.zavorrina.M).toLocaleString("it-IT")}</Text>
              <Text style={summaryStyles.lbl}>Zav ♂</Text>
            </View>
            <View style={summaryStyles.card}>
              <Text style={[summaryStyles.num, { color: Colors.femaleIcon }]}>{n(summary.zavorrina.F).toLocaleString("it-IT")}</Text>
              <Text style={summaryStyles.lbl}>Zav ♀</Text>
            </View>
            <View style={summaryStyles.card}>
              <Text style={[summaryStyles.num, { color: Colors.coupleIcon }]}>{n(summary.coppia.total).toLocaleString("it-IT")}</Text>
              <Text style={summaryStyles.lbl}>Coppie</Text>
            </View>
          </View>
          {!hideFake && (
            <Text style={summaryStyles.fakeNote}>
              Incl. fake: {summary.totale.fake.toLocaleString("it-IT")}
            </Text>
          )}
        </View>
      )}
      <View style={styles.searchRow}>
        <View style={[styles.searchContainer, { flex: 1, margin: 0 }]}>
          <Ionicons name="search" size={18} color={Colors.textSecondary} />
          <TextInput
            style={styles.searchInput}
            placeholder="Cerca per nickname, email o telefono..."
            placeholderTextColor="#666"
            value={searchText}
            onChangeText={setSearchText}
          />
          {!!searchText && (
            <TouchableOpacity onPress={() => setSearchText("")}>
              <Ionicons name="close-circle" size={18} color={Colors.textSecondary} />
            </TouchableOpacity>
          )}
        </View>
        <TouchableOpacity
          style={[styles.fakeToggle, hideFake && { backgroundColor: "#FF00FF33", borderColor: "#FF00FF" }]}
          onPress={() => setHideFake(!hideFake)}
        >
          <Text style={[styles.fakeToggleText, hideFake && { color: "#FF00FF" }]}>
            {hideFake ? "Mostra fake" : "Nascondi fake"}
          </Text>
        </TouchableOpacity>
      </View>

      {isLoading ? (
        <Text style={styles.loadingText}>Caricamento...</Text>
      ) : (
        <FlatList
          data={filteredUsers}
          keyExtractor={(item) => item.id}
          renderItem={renderUser}
          contentContainerStyle={{ paddingBottom: insets.bottom + 20, paddingHorizontal: 16 }}
          ListEmptyComponent={<Text style={styles.emptyText}>Nessun utente</Text>}
        />
      )}

      <Modal visible={statsModalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[statsStyles.modalContainer, { paddingTop: insets.top + 10, paddingBottom: insets.bottom + 10 }]}>
            <View style={statsStyles.modalHeader}>
              <Text style={statsStyles.modalTitle}>{selectedUser?.nickname}</Text>
              <View style={{ flexDirection: "row" as const, gap: 12 }}>
                <TouchableOpacity onPress={() => { setStatsModalVisible(false); if (selectedUser) openEditModal(selectedUser); }}>
                  <Ionicons name="create-outline" size={22} color={Colors.accent} />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setStatsModalVisible(false)}>
                  <Ionicons name="close" size={24} color={Colors.text} />
                </TouchableOpacity>
              </View>
            </View>
            {statsQuery.isLoading ? (
              <Text style={styles.loadingText}>Caricamento statistiche...</Text>
            ) : statsQuery.isError ? (
              <Text style={styles.loadingText}>Errore nel caricamento</Text>
            ) : (
              renderStatsModal()
            )}
          </View>
        </View>
      </Modal>

      <Modal visible={editModalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { paddingTop: insets.top + 10, paddingBottom: insets.bottom + 10 }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                Modifica: {selectedUser?.nickname}
              </Text>
              <TouchableOpacity onPress={() => setEditModalVisible(false)}>
                <Ionicons name="close" size={24} color={Colors.text} />
              </TouchableOpacity>
            </View>

            <View style={styles.modalBody}>
              <Text style={styles.fieldLabel}>Email</Text>
              <View style={styles.fieldRow}>
                <TextInput
                  style={[styles.input, { flex: 1 }]}
                  value={editEmail}
                  onChangeText={setEditEmail}
                  placeholder="Email"
                  placeholderTextColor="#666"
                  keyboardType="email-address"
                  autoCapitalize="none"
                />
                <TouchableOpacity
                  style={styles.saveBtn}
                  onPress={handleSaveEmail}
                  disabled={emailMutation.isPending}
                >
                  <Text style={styles.saveBtnText}>
                    {emailMutation.isPending ? "..." : "Salva"}
                  </Text>
                </TouchableOpacity>
              </View>

              <Text style={[styles.fieldLabel, { marginTop: 20 }]}>Nuova Password</Text>
              <View style={styles.fieldRow}>
                <TextInput
                  style={[styles.input, { flex: 1 }]}
                  value={editPassword}
                  onChangeText={setEditPassword}
                  placeholder="Min. 6 caratteri"
                  placeholderTextColor="#666"
                  secureTextEntry
                />
                <TouchableOpacity
                  style={styles.saveBtn}
                  onPress={handleSavePassword}
                  disabled={passwordMutation.isPending}
                >
                  <Text style={styles.saveBtnText}>
                    {passwordMutation.isPending ? "..." : "Imposta"}
                  </Text>
                </TouchableOpacity>
              </View>

              <View style={styles.infoSection}>
                <Text style={styles.infoLabel}>Ruolo attuale</Text>
                <Text style={[styles.infoValue, { color: getRoleColor(selectedUser?.role || "") }]}>
                  {selectedUser?.role}
                </Text>
              </View>

              <View style={styles.infoSection}>
                <Text style={styles.infoLabel}>Stato attuale</Text>
                <Text style={[styles.infoValue, { color: getStatusColor(selectedUser?.status || "") }]}>
                  {selectedUser?.status}
                </Text>
              </View>

              <View style={styles.infoSection}>
                <Text style={styles.infoLabel}>Tipo</Text>
                <Text style={styles.infoValue}>{selectedUser?.userType}</Text>
              </View>

              <View style={styles.quickActions}>
                {selectedUser?.role === "user" && (
                  <TouchableOpacity
                    style={styles.quickActionBtn}
                    onPress={() => { setEditModalVisible(false); if (selectedUser) handleMakeModerator(selectedUser); }}
                  >
                    <Ionicons name="shield-checkmark-outline" size={20} color={Colors.maleIcon} />
                    <Text style={styles.quickActionText}>Rendi Moderatore</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  style={styles.quickActionBtn}
                  onPress={() => { setEditModalVisible(false); if (selectedUser) handleStatusChange(selectedUser); }}
                >
                  <Ionicons name="ban-outline" size={20} color={Colors.warning} />
                  <Text style={styles.quickActionText}>Cambia Stato</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.quickActionBtn, { borderColor: Colors.error }]}
                  onPress={() => { setEditModalVisible(false); if (selectedUser) handleDeleteUser(selectedUser); }}
                >
                  <Ionicons name="trash-outline" size={20} color={Colors.error} />
                  <Text style={[styles.quickActionText, { color: Colors.error }]}>Elimina</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const statsStyles = StyleSheet.create({
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

const summaryStyles = StyleSheet.create({
  wrapper: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  title: {
    fontFamily: "Inter_700Bold",
    fontSize: 11,
    color: Colors.accent,
    letterSpacing: 1.5,
    marginBottom: 10,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    alignItems: "center",
    borderWidth: 1,
    borderColor: Colors.border,
    minWidth: 72,
    flex: 1,
  },
  num: {
    fontFamily: "Inter_700Bold",
    fontSize: 18,
    color: Colors.text,
  },
  lbl: {
    fontFamily: "Inter_400Regular",
    fontSize: 10,
    color: Colors.textSecondary,
    marginTop: 2,
    textAlign: "center",
  },
  fakeNote: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    color: Colors.textSecondary,
    marginTop: 8,
    textAlign: "right",
  },
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
    gap: 8,
  },
  fakeToggle: {
    backgroundColor: Colors.surface,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  fakeToggleText: {
    fontFamily: "Inter_500Medium",
    fontSize: 11,
    color: Colors.textSecondary,
  },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.surface,
    margin: 16,
    marginBottom: 8,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    color: Colors.text,
  },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: Colors.border,
  },
  userInfo: { flex: 1 },
  nickname: { fontFamily: "Inter_600SemiBold", fontSize: 16, color: Colors.text },
  email: { fontFamily: "Inter_400Regular", fontSize: 13, color: Colors.textSecondary, marginTop: 2 },
  badges: { flexDirection: "row", gap: 6, marginTop: 8, flexWrap: "wrap" },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  badgeText: { fontFamily: "Inter_500Medium", fontSize: 11 },
  lastLogin: { fontFamily: "Inter_400Regular", fontSize: 11, color: Colors.textSecondary, marginTop: 6 },
  versionBadge: { fontFamily: "Inter_500Medium", fontSize: 11, marginTop: 3 },
  versionMissing: { fontFamily: "Inter_400Regular", fontSize: 11, color: Colors.textSecondary, marginTop: 3 },
  actions: { flexDirection: "column", gap: 10 },
  actionBtn: { padding: 4 },
  loadingText: { fontFamily: "Inter_400Regular", fontSize: 14, color: Colors.textSecondary, textAlign: "center", marginTop: 40 },
  emptyText: { fontFamily: "Inter_400Regular", fontSize: 14, color: Colors.textSecondary, textAlign: "center", marginTop: 40 },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "center",
    padding: 20,
  },
  modalContent: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 20,
    maxHeight: "90%",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },
  modalTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 18,
    color: Colors.text,
  },
  modalBody: {
    gap: 4,
  },
  fieldLabel: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
    color: Colors.textSecondary,
    marginBottom: 6,
  },
  fieldRow: {
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
  },
  input: {
    backgroundColor: Colors.background,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    color: Colors.text,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  saveBtn: {
    backgroundColor: Colors.accent,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  saveBtnText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
    color: "#0D0D0D",
  },
  infoSection: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    marginTop: 4,
  },
  infoLabel: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    color: Colors.textSecondary,
  },
  infoValue: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
    color: Colors.text,
  },
  quickActions: {
    flexDirection: "row",
    gap: 12,
    marginTop: 20,
  },
  quickActionBtn: {
    flex: 1,
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    backgroundColor: Colors.background,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  quickActionText: {
    fontFamily: "Inter_500Medium",
    fontSize: 11,
    color: Colors.text,
    textAlign: "center" as const,
  },
});
