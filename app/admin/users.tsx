import React, { useState, useEffect } from "react";
import { View, Text, StyleSheet, FlatList, Alert } from "react-native";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/colors";
import { apiRequest, queryClient, getApiUrl } from "@/lib/query-client";
import { useT } from "@/lib/language-context";

// Local components
import { AdminUser, UserCard } from "@/components/admin/users/UserCard";
import { UserFilters } from "@/components/admin/users/UserFilters";
import { UserSummary } from "@/components/admin/users/UserSummary";
import { UserDetailModal, UserStats, SessionsData, GeoZone } from "@/components/admin/users/UserDetailModal";
import { UserEditModal } from "@/components/admin/users/UserEditModal";
import { CreateUserModal, CreateUserPayload } from "@/components/admin/users/CreateUserModal";
import { ZoneMapModal } from "@/components/admin/users/ZoneMapModal";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import AiCopilotDrawer from "@/components/admin/ai/AiCopilotDrawer";
import { MaterialCommunityIcons, Ionicons } from "@expo/vector-icons";
import { TouchableOpacity } from "react-native";

const CURRENT_APP_VERSION = "1.0.0"; // Should be imported if available elsewhere

function formatDateIT(dateStr: string | null): string {
  if (!dateStr) return "Mai";
  const d = new Date(dateStr);
  return d.toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function AdminUsers() {
  const t = useT();
  const insets = useSafeAreaInsets();

  const [editModalVisible, setEditModalVisible] = useState(false);
  const [statsModalVisible, setStatsModalVisible] = useState(false);
  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);
  const [editEmail, setEditEmail] = useState("");
  const [editPassword, setEditPassword] = useState("");
  const [searchText, setSearchText] = useState("");
  const [hideFake, setHideFake] = useState(true);
  // Task #2532 — Co-Pilot AI scope=user: chat contestuale all'utente selezionato.
  const [aiUserDrawer, setAiUserDrawer] = useState<{ visible: boolean; userId?: string }>({ visible: false });

  // Geo-insight effimero
  const [fzEnabled, setFzEnabled] = useState(false);
  const [fzMapZone, setFzMapZone] = useState<GeoZone | null>(null);
  const [fzData, setFzData] = useState<GeoZone[]>([]);
  const [fzLoading, setFzLoading] = useState(false);
  const [fzError, setFzError] = useState(false);

  // Reset totale quando la scheda utente viene chiusa (dati ephemeri).
  useEffect(() => {
    if (!statsModalVisible) {
      setFzEnabled(false);
      setFzMapZone(null);
      setFzData([]);
      setFzLoading(false);
      setFzError(false);
    }
  }, [statsModalVisible]);

  // Quando il toggle viene attivato → fetch on-demand.
  useEffect(() => {
    if (!fzEnabled || !selectedUser) {
      setFzData([]);
      setFzLoading(false);
      setFzError(false);
      return;
    }
    let cancelled = false;
    setFzLoading(true);
    setFzError(false);
    (async () => {
      try {
        const url = new URL(`/api/admin/users/${selectedUser.id}/geo-insights`, getApiUrl());
        const res = await fetch(url.toString(), { credentials: "include" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as GeoZone[];
        if (!cancelled) {
          setFzData(Array.isArray(json) ? json : []);
          setFzLoading(false);
        }
      } catch {
        if (!cancelled) {
          setFzError(true);
          setFzLoading(false);
          setFzData([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [fzEnabled, selectedUser]);

  const { data: users = [], isLoading } = useQuery<AdminUser[]>({
    queryKey: ["/api/admin/users"],
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- users summary from API
  const { data: summary } = useQuery<any>({
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

  const createUserMutation = useMutation({
    mutationFn: async (payload: CreateUserPayload) => {
      const res = await apiRequest("POST", "/api/admin/users", payload);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { message?: string }).message ?? `HTTP ${res.status}`);
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users/stats/summary"] });
      setCreateModalVisible(false);
      Alert.alert("Utente creato", "L'utente è stato creato con successo e può accedere subito.");
    },
    onError: (err: Error) => Alert.alert("Errore creazione", err.message || "Impossibile creare l'utente"),
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

  const mapTesterMutation = useMutation({
    mutationFn: async ({ id, enabled }: { id: string; enabled: boolean }) => {
      const res = await apiRequest("PUT", `/api/admin/maps/users/${id}/map-tester`, { enabled });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
    },
    onError: () => Alert.alert("Errore", "Impossibile aggiornare flag Map Tester"),
  });

  const telemetryDisabledMutation = useMutation({
    mutationFn: async ({ id, disabled }: { id: string; disabled: boolean }) => {
      const res = await apiRequest("PUT", `/api/admin/users/${id}/telemetry-disabled`, { disabled });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
    },
    onError: () => Alert.alert("Errore", "Impossibile aggiornare stato sensori utente"),
  });

  const matchingDisabledMutation = useMutation({
    mutationFn: async ({ id, matchingDisabled }: { id: string; matchingDisabled: boolean }) => {
      const res = await apiRequest("PUT", `/api/admin/users/${id}/matching-disabled`, { matchingDisabled });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
    },
    onError: () => Alert.alert("Errore", "Impossibile aggiornare flag matching"),
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

  const sessionsQuery = useQuery<SessionsData>({
    queryKey: ["/api/admin/users", selectedUser?.id, "sessions"],
    enabled: statsModalVisible && !!selectedUser,
    queryFn: async () => {
      const url = new URL(`/api/admin/users/${selectedUser!.id}/sessions`, getApiUrl());
      const res = await fetch(url.toString(), { credentials: "include" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
  });

  const revokeSessionMutation = useMutation({
    mutationFn: async ({ userId, sid }: { userId: string; sid: string }) => {
      const res = await apiRequest("DELETE", `/api/admin/users/${userId}/sessions/${encodeURIComponent(sid)}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { message?: string }).message ?? `HTTP ${res.status}`);
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users", selectedUser?.id, "sessions"] });
    },
    onError: (err: Error) => Alert.alert("Errore revoca", (err as Error).message || "Impossibile revocare la sessione"),
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
      Alert.alert(t("common.error"), t("admin.emailRequired"));
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
      { text: t("common.cancel"), style: "cancel" as const },
    ]);
  }

  function handleMakeModerator(user: AdminUser) {
    Alert.alert(
      "Rendi Moderatore",
      `Vuoi rendere ${user.nickname} un moderatore?`,
      [
        { text: t("common.cancel"), style: "cancel" as const },
        {
          text: t("common.confirm"),
          onPress: () => roleMutation.mutate({ id: user.id, role: "moderator" }),
        },
      ]
    );
  }

  function handleDeleteUser(user: AdminUser) {
    Alert.alert(
      t("admin.deleteProfile"),
      `Sei sicuro di voler eliminare il profilo di ${user.nickname}?`,
      [
        { text: t("common.cancel"), style: "cancel" as const },
        {
          text: t("admin.deleteUser"),
          style: "destructive" as const,
          onPress: () => {
            Alert.alert(
              t("admin.confirmDelete"),
              t("admin.irreversibleAction"),
              [
                { text: t("common.cancel"), style: "cancel" as const },
                {
                  text: t("admin.deleteDefinitely"),
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
        { text: t("common.cancel"), style: "cancel" as const },
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

  return (
    <View style={styles.container}>
      <FlatList
        data={filteredUsers}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <UserCard
            item={item}
            onOpenStats={openStatsModal}
            onOpenEdit={openEditModal}
            onStatusChange={handleStatusChange}
            onMakeModerator={handleMakeModerator}
            onClearLastfm={handleClearLastfm}
            onDeleteUser={handleDeleteUser}
            onTogglePrimal={(id, isPrimal) => primalMutation.mutate({ id, isPrimal })}
            onToggleMapTester={(id, enabled) => mapTesterMutation.mutate({ id, enabled })}
            onToggleTelemetryDisabled={(id, disabled) => {
              const user = users.find((u) => u.id === id);
              const label = disabled ? "Disattivare i sensori" : "Riattivare i sensori";
              Alert.alert(
                label,
                `${label} per ${user?.nickname ?? id}?`,
                [
                  { text: "Annulla", style: "cancel" },
                  {
                    text: "Conferma",
                    style: disabled ? "destructive" : "default",
                    onPress: () => telemetryDisabledMutation.mutate({ id, disabled }),
                  },
                ]
              );
            }}
            onToggleMatchingDisabled={(id, disabled) => {
              const user = users.find((u) => u.id === id);
              const label = disabled ? "Escludere dal matching" : "Riabilitare al matching";
              Alert.alert(
                label,
                `${label} per ${user?.nickname ?? id}?`,
                [
                  { text: "Annulla", style: "cancel" },
                  {
                    text: "Conferma",
                    style: disabled ? "destructive" : "default",
                    onPress: () => matchingDisabledMutation.mutate({ id, matchingDisabled: disabled }),
                  },
                ]
              );
            }}
            isLastfmPending={clearLastfmMutation.isPending}
            currentAppVersion={CURRENT_APP_VERSION}
          />
        )}
        ListHeaderComponent={
          <>
            <UserSummary summary={summary} />
            <View style={styles.filtersRow}>
              <View style={{ flex: 1 }}>
                <UserFilters
                  searchText={searchText}
                  onSearchChange={setSearchText}
                  hideFake={hideFake}
                  onToggleHideFake={() => setHideFake(!hideFake)}
                  t={t}
                />
              </View>
              <TouchableOpacity
                style={styles.createBtn}
                onPress={() => setCreateModalVisible(true)}
                accessibilityLabel="Crea nuovo utente"
              >
                <Ionicons name="person-add-outline" size={18} color="#0D0D0D" />
              </TouchableOpacity>
            </View>
          </>
        }
        contentContainerStyle={{ padding: 16, paddingTop: 0 }}
        ListEmptyComponent={
          <Text style={styles.emptyText}>
            {isLoading ? "Caricamento utenti..." : "Nessun utente trovato"}
          </Text>
        }
      />

      <ErrorBoundary onError={(err, stack) => console.error("[UserDetailModal crash]", err.message, stack)}>
        <UserDetailModal
          visible={statsModalVisible}
          onClose={() => setStatsModalVisible(false)}
          user={selectedUser}
          stats={statsQuery.data}
          isLoadingStats={statsQuery.isFetching}
          fzEnabled={fzEnabled}
          setFzEnabled={setFzEnabled}
          fzData={fzData}
          fzLoading={fzLoading}
          fzError={fzError}
          onZonePress={setFzMapZone}
          sessions={sessionsQuery.data}
          onRevokeSession={(sid) => selectedUser && revokeSessionMutation.mutate({ userId: selectedUser.id, sid })}
          t={t}
          formatDateIT={formatDateIT}
          getRoleColor={getRoleColor}
          getStatusColor={getStatusColor}
        />
      </ErrorBoundary>

      <CreateUserModal
        visible={createModalVisible}
        onClose={() => setCreateModalVisible(false)}
        onSubmit={(payload) => createUserMutation.mutate(payload)}
        isLoading={createUserMutation.isPending}
      />

      <ErrorBoundary>
        <UserEditModal
          visible={editModalVisible}
          onClose={() => setEditModalVisible(false)}
          user={selectedUser}
          editEmail={editEmail}
          setEditEmail={setEditEmail}
          editPassword={editPassword}
          setEditPassword={setEditPassword}
          onSaveEmail={handleSaveEmail}
          onSavePassword={handleSavePassword}
          onStatusChange={handleStatusChange}
          onMakeModerator={handleMakeModerator}
          onDeleteUser={handleDeleteUser}
          getStatusColor={getStatusColor}
        />
      </ErrorBoundary>

      {selectedUser ? (
        <TouchableOpacity
          style={styles.aiFab}
          onPress={() => setAiUserDrawer({ visible: true, userId: selectedUser.id })}
          accessibilityLabel="Apri Co-Pilot AI per questo utente"
        >
          <MaterialCommunityIcons name="robot-outline" size={22} color="#fff" />
        </TouchableOpacity>
      ) : null}

      <AiCopilotDrawer
        visible={aiUserDrawer.visible}
        onClose={() => setAiUserDrawer({ visible: false })}
        scope="user"
        contextId={aiUserDrawer.userId}
        initialMessage={aiUserDrawer.userId ? `Analizza l'utente ${aiUserDrawer.userId} (storico segnalazioni, trust, ban precedenti) e suggerisci azioni.` : undefined}
      />

      <ErrorBoundary>
        <ZoneMapModal
          zone={fzMapZone}
          onClose={() => setFzMapZone(null)}
          insets={insets}
        />
      </ErrorBoundary>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  emptyText: { fontFamily: "Inter_400Regular", fontSize: 14, color: Colors.textSecondary, textAlign: "center", marginTop: 40 },
  filtersRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
  },
  createBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: Colors.accent,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  aiFab: {
    position: "absolute", right: 16, bottom: 24,
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: Colors.accent,
    alignItems: "center", justifyContent: "center",
    shadowColor: "#000", shadowOpacity: 0.2, shadowRadius: 6, shadowOffset: { width: 0, height: 3 }, elevation: 4,
  },
});
