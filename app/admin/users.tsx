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
import { ZoneMapModal } from "@/components/admin/users/ZoneMapModal";

let MapView: React.ComponentType<Record<string, unknown>> | null = null;
let MapMarker: React.ComponentType<Record<string, unknown>> | null = null;
try {
  const maps = require("react-native-maps");
  MapView = maps.default as React.ComponentType<Record<string, unknown>>;
  MapMarker = maps.Marker as React.ComponentType<Record<string, unknown>>;
} catch {
  MapView = null;
  MapMarker = null;
}

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
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);
  const [editEmail, setEditEmail] = useState("");
  const [editPassword, setEditPassword] = useState("");
  const [searchText, setSearchText] = useState("");
  const [hideFake, setHideFake] = useState(true);

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
      const cleanSid = sid.startsWith("…") ? sid.slice(1) : sid;
      const res = await apiRequest("DELETE", `/api/admin/users/${userId}/sessions/${encodeURIComponent(cleanSid)}`);
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
            isLastfmPending={clearLastfmMutation.isPending}
            currentAppVersion={CURRENT_APP_VERSION}
          />
        )}
        ListHeaderComponent={
          <>
            <UserSummary summary={summary} />
            <UserFilters
              searchText={searchText}
              onSearchChange={setSearchText}
              hideFake={hideFake}
              onToggleHideFake={() => setHideFake(!hideFake)}
              t={t}
            />
          </>
        }
        contentContainerStyle={{ padding: 16, paddingTop: 0 }}
        ListEmptyComponent={
          <Text style={styles.emptyText}>
            {isLoading ? "Caricamento utenti..." : "Nessun utente trovato"}
          </Text>
        }
      />

      <UserDetailModal
        visible={statsModalVisible}
        onClose={() => setStatsModalVisible(false)}
        user={selectedUser}
        stats={statsQuery.data}
        isLoadingStats={statsQuery.isLoading}
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

      <ZoneMapModal
        zone={fzMapZone}
        onClose={() => setFzMapZone(null)}
        MapView={MapView}
        MapMarker={MapMarker}
        insets={insets}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  emptyText: { fontFamily: "Inter_400Regular", fontSize: 14, color: Colors.textSecondary, textAlign: "center", marginTop: 40 },
});
