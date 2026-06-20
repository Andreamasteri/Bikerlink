import React, { useState, useEffect } from "react";
import { View, Text, StyleSheet, FlatList, Alert, TouchableOpacity, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/colors";
import { useT } from "@/lib/language-context";
import { useAdminUsers } from "@/hooks/useAdminUsers";

import { AdminUser, UserCard } from "@/components/admin/users/UserCard";
import { UserFilters } from "@/components/admin/users/UserFilters";
import { UserSummary } from "@/components/admin/users/UserSummary";
import { UserDetailModal, GeoZone } from "@/components/admin/users/UserDetailModal";
import { UserEditModal } from "@/components/admin/users/UserEditModal";
import { CreateUserModal } from "@/components/admin/users/CreateUserModal";
import { ZoneMapModal } from "@/components/admin/users/ZoneMapModal";
import { UserPrivacyModal } from "@/components/admin/users/UserPrivacyModal";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import AiCopilotDrawer from "@/components/admin/ai/AiCopilotDrawer";
import { MaterialCommunityIcons, Ionicons } from "@expo/vector-icons";
import { getApiUrl } from "@/lib/query-client";
import Constants from "expo-constants";

const CURRENT_APP_VERSION = Constants.expoConfig?.version ?? "";

function formatDateIT(dateStr: string | null): string {
  if (!dateStr) return "Mai";
  const d = new Date(dateStr);
  return d.toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
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

export default function AdminUsers() {
  const t = useT();
  const insets = useSafeAreaInsets();

  const {
    users, isLoading, summary, matchabilityMap,
    statusMutation, roleMutation, emailMutation, passwordMutation, profileMutation,
    deleteMutation, createUserMutation, primalMutation, mapTesterMutation,
    telemetryDisabledMutation, matchingDisabledMutation, aisMutation,
    clearLastfmMutation, revokeSessionMutation, useUserStats, useUserSessions,
  } = useAdminUsers();

  const [editModalVisible, setEditModalVisible] = useState(false);
  const [statsModalVisible, setStatsModalVisible] = useState(false);
  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [privacyModalUser, setPrivacyModalUser] = useState<AdminUser | null>(null);
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);
  const [editEmail, setEditEmail] = useState("");
  const [editPassword, setEditPassword] = useState("");
  const [searchText, setSearchText] = useState("");
  const [hideFake, setHideFake] = useState(true);
  const [filterNotMatchable, setFilterNotMatchable] = useState(false);
  const [filterAis, setFilterAis] = useState(false);
  const [aiUserDrawer, setAiUserDrawer] = useState<{ visible: boolean; userId?: string }>({ visible: false });

  const [fzEnabled, setFzEnabled] = useState(false);
  const [fzMapZone, setFzMapZone] = useState<GeoZone | null>(null);
  const [fzData, setFzData] = useState<GeoZone[]>([]);
  const [fzLoading, setFzLoading] = useState(false);
  const [fzError, setFzError] = useState(false);

  const statsQuery = useUserStats(selectedUser, statsModalVisible);
  const sessionsQuery = useUserSessions(selectedUser, statsModalVisible);

  useEffect(() => {
    if (!statsModalVisible) {
      setFzEnabled(false);
      setFzMapZone(null);
      setFzData([]);
      setFzLoading(false);
      setFzError(false);
    }
  }, [statsModalVisible]);

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
        if (!cancelled) { setFzData(Array.isArray(json) ? json : []); setFzLoading(false); }
      } catch {
        if (!cancelled) { setFzError(true); setFzLoading(false); setFzData([]); }
      }
    })();
    return () => { cancelled = true; };
  }, [fzEnabled, selectedUser]);

  const filteredUsers = users.filter((u) => {
    if (hideFake && u.isFake === true) return false;
    if (filterNotMatchable) {
      const info = matchabilityMap[u.id];
      if (!info || info.matchable) return false;
    }
    if (filterAis && !u.aisEnabled) return false;
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
    if (!editEmail || !editEmail.includes("@")) { Alert.alert(t("common.error"), t("admin.emailRequired")); return; }
    emailMutation.mutate({ id: selectedUser.id, email: editEmail });
  }

  function handleSavePassword() {
    if (!selectedUser) return;
    if (!editPassword || editPassword.length < 6) { Alert.alert("Errore", "La password deve avere almeno 6 caratteri"); return; }
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
    Alert.alert("Rendi Moderatore", `Vuoi rendere ${user.nickname} un moderatore?`, [
      { text: t("common.cancel"), style: "cancel" as const },
      { text: t("common.confirm"), onPress: () => roleMutation.mutate({ id: user.id, role: "moderator" }) },
    ]);
  }

  function handleDeleteUser(user: AdminUser) {
    Alert.alert(t("admin.deleteProfile"), `Sei sicuro di voler eliminare il profilo di ${user.nickname}?`, [
      { text: t("common.cancel"), style: "cancel" as const },
      {
        text: t("admin.deleteUser"), style: "destructive" as const,
        onPress: () => Alert.alert(t("admin.confirmDelete"), t("admin.irreversibleAction"), [
          { text: t("common.cancel"), style: "cancel" as const },
          { text: t("admin.deleteDefinitely"), style: "destructive" as const, onPress: () => deleteMutation.mutate({ id: user.id }) },
        ]),
      },
    ]);
  }

  function handleClearLastfm(user: AdminUser) {
    Alert.alert("Clear Last.fm", `Cancellare tutti i dati Last.fm di ${user.nickname}? (brani, sessione, snapshot)`, [
      { text: t("common.cancel"), style: "cancel" as const },
      { text: "Cancella", style: "destructive" as const, onPress: () => clearLastfmMutation.mutate({ id: user.id }) },
    ]);
  }

  if (isLoading && users.length === 0) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.accent} />
        <Text style={styles.loadingText}>Caricamento utenti...</Text>
        {[0, 1, 2].map((i) => (
          <View key={i} style={styles.skeletonCard}>
            <View style={styles.skeletonAvatar} />
            <View style={styles.skeletonLines}>
              <View style={[styles.skeletonLine, { width: "55%" }]} />
              <View style={[styles.skeletonLine, { width: "75%", marginTop: 6 }]} />
              <View style={[styles.skeletonLine, { width: "40%", marginTop: 6 }]} />
            </View>
          </View>
        ))}
      </View>
    );
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
            matchabilityInfo={matchabilityMap[item.id]}
            onToggleTelemetryDisabled={(id, disabled) => {
              const user = users.find((u) => u.id === id);
              const label = disabled ? "Disattivare i sensori" : "Riattivare i sensori";
              Alert.alert(label, `${label} per ${user?.nickname ?? id}?`, [
                { text: "Annulla", style: "cancel" },
                { text: "Conferma", style: disabled ? "destructive" : "default", onPress: () => telemetryDisabledMutation.mutate({ id, disabled }) },
              ]);
            }}
            onToggleMatchingDisabled={(id, disabled) => {
              const user = users.find((u) => u.id === id);
              const label = disabled ? "Escludere dal matching" : "Riabilitare al matching";
              Alert.alert(label, `${label} per ${user?.nickname ?? id}?`, [
                { text: "Annulla", style: "cancel" },
                { text: "Conferma", style: disabled ? "destructive" : "default", onPress: () => matchingDisabledMutation.mutate({ id, matchingDisabled: disabled }) },
              ]);
            }}
            onToggleAis={(id) => {
              const user = users.find((u) => u.id === id);
              const current = user?.aisEnabled ?? false;
              const label = current ? "Rimuovere permesso AIS" : "Abilitare accesso AIS navi";
              Alert.alert(label, `${label} per ${user?.nickname ?? id}?`, [
                { text: "Annulla", style: "cancel" },
                { text: "Conferma", onPress: () => aisMutation.mutate({ id }) },
              ]);
            }}
            onOpenPrivacy={(user) => setPrivacyModalUser(user)}
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
                  filterNotMatchable={filterNotMatchable}
                  onToggleNotMatchable={() => setFilterNotMatchable(!filterNotMatchable)}
                  filterAis={filterAis}
                  onToggleFilterAis={() => setFilterAis(!filterAis)}
                  t={t}
                />
              </View>
              <TouchableOpacity style={styles.createBtn} onPress={() => setCreateModalVisible(true)} accessibilityLabel="Crea nuovo utente">
                <Ionicons name="person-add-outline" size={18} color="#0D0D0D" />
              </TouchableOpacity>
            </View>
          </>
        }
        contentContainerStyle={{ padding: 16, paddingTop: 0 }}
        ListEmptyComponent={
          <Text style={styles.emptyText}>{"Nessun utente trovato"}</Text>
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
        onSubmit={(payload) => {
          createUserMutation.mutate(payload, {
            onSuccess: () => setCreateModalVisible(false),
          });
        }}
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
          onSaveProfile={(payload) => {
            if (!selectedUser) return;
            profileMutation.mutate({ id: selectedUser.id, ...payload });
          }}
          isSavingProfile={profileMutation.isPending}
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
        <ZoneMapModal zone={fzMapZone} onClose={() => setFzMapZone(null)} insets={insets} />
      </ErrorBoundary>

      <UserPrivacyModal
        visible={!!privacyModalUser}
        onClose={() => setPrivacyModalUser(null)}
        user={privacyModalUser}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  loadingContainer: { flex: 1, backgroundColor: Colors.background, alignItems: "center", paddingTop: 48, paddingHorizontal: 16 },
  loadingText: { fontFamily: "Inter_400Regular", fontSize: 14, color: Colors.textSecondary, marginTop: 12, marginBottom: 24 },
  skeletonCard: { flexDirection: "row", alignItems: "center", width: "100%", backgroundColor: Colors.card ?? Colors.background, borderRadius: 12, padding: 14, marginBottom: 12, opacity: 0.6 },
  skeletonAvatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: Colors.textSecondary, opacity: 0.25 },
  skeletonLines: { flex: 1, marginLeft: 12 },
  skeletonLine: { height: 12, borderRadius: 6, backgroundColor: Colors.textSecondary, opacity: 0.25 },
  emptyText: { fontFamily: "Inter_400Regular", fontSize: 14, color: Colors.textSecondary, textAlign: "center", marginTop: 40 },
  filtersRow: { flexDirection: "row", alignItems: "flex-end", gap: 8 },
  createBtn: {
    width: 44, height: 44, borderRadius: 12, backgroundColor: Colors.accent,
    alignItems: "center", justifyContent: "center", marginBottom: 8,
  },
  aiFab: {
    position: "absolute", right: 16, bottom: 24,
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: Colors.accent, alignItems: "center", justifyContent: "center",
    shadowColor: "#000", shadowOpacity: 0.2, shadowRadius: 6, shadowOffset: { width: 0, height: 3 }, elevation: 4,
  },
});
