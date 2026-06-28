// @no-split
import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Pressable,
  ActivityIndicator,
  Alert,
  Switch,
} from "react-native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams } from "expo-router";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/colors";
import { apiRequest, getApiUrl } from "@/lib/query-client";
import { MatchUserCard } from "@/components/admin/match-inspector/MatchUserCard";
import { PreferencesDiffCard } from "@/components/admin/match-inspector/PreferencesDiffCard";
import { ProfileGapsCard } from "@/components/admin/match-inspector/ProfileGapsCard";
import { UserEditModal } from "@/components/admin/users/UserEditModal";
import type { AdminUser } from "@/components/admin/users/UserCard";
import { ZeroMatchDiagnosisCard } from "@/components/admin/match-inspector/ZeroMatchDiagnosisCard";
import { MatchTypeCard } from "@/components/admin/match-inspector/MatchTypeCard";
import { styles } from "@/components/admin/match-inspector-detail.styles";

export interface MatchItem {
  id: string;
  matchedUserId: string;
  matchedNickname: string;
  matchedAvatarUrl: string | null;
  distanceKm: number | null;
  status: string;
  isSupermatch: boolean;
  createdAt: string;
}

export interface MatchTypeSection {
  typeKey: string;
  typeName: string;
  count: number;
  disabled: boolean;
  insufficientData: boolean;
  matches: MatchItem[];
}

interface DetailResponse {
  user: {
    id: string;
    nickname: string;
    avatarUrl: string | null;
    userType: string;
    role: string;
    status: string;
  };
  gpsRouteCount: number;
  matchesByType: MatchTypeSection[];
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("it-IT", { day: "2-digit", month: "short", year: "2-digit" });
  } catch {
    return iso;
  }
}

function statusColor(status: string): string {
  switch (status) {
    case "accepted": return Colors.success;
    case "rejected": return Colors.error;
    default: return Colors.textSecondary;
  }
}

function getStatusColorForModal(status: string): string {
  switch (status) {
    case "active": return Colors.success;
    case "suspended": return Colors.warning;
    case "blocked": return Colors.error;
    default: return Colors.textSecondary;
  }
}

function MatchTypeSectionsList({
  matchesByType,
  expandedTypes,
  toggleType,
  formatDate,
  statusColor,
  userId,
  nickname
}: {
  matchesByType: MatchTypeSection[];
  expandedTypes: Set<string>;
  toggleType: (typeKey: string) => void;
  formatDate: (iso: string) => string;
  statusColor: (status: string) => string;
  userId: string;
  nickname: string;
}) {
  return (
    <>
      <Text style={styles.sectionTitle}>{matchesByType.length} Tipi di Match</Text>

      {matchesByType.map((section) => (
        <MatchTypeCard
          key={section.typeKey}
          section={section}
          expanded={expandedTypes.has(section.typeKey)}
          onToggle={() => toggleType(section.typeKey)}
          formatDate={formatDate}
          statusColor={statusColor}
          currentUserId={userId}
          currentNickname={nickname}
        />
      ))}
    </>
  );
}

export default function MatchInspectorDetailScreen() {
  const { userId } = useLocalSearchParams<{ userId: string }>();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const [expandedTypes, setExpandedTypes] = useState<Set<string>>(new Set());
  const [deletedAt, setDeletedAt] = useState<string | null>(null);
  const [autoRecalc, setAutoRecalc] = useState(false);

  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editEmail, setEditEmail] = useState("");
  const [editPassword, setEditPassword] = useState("");

  const queryKey = ["/api/admin/users", userId, "matches"];

  const { data, isLoading, refetch } = useQuery<DetailResponse>({
    queryKey,
    queryFn: async () => {
      const base = getApiUrl();
      const url = new URL(`/api/admin/users/${userId}/matches`, base);
      const res = await fetch(url.toString(), { credentials: "include" });
      if (!res.ok) throw new Error("Errore caricamento");
      return res.json();
    },
    enabled: !!userId,
    refetchInterval: 10000,
    staleTime: 5000,
  });

  const { data: fullUser } = useQuery<AdminUser>({
    queryKey: ["/api/admin/users", userId, "detail"],
    queryFn: async () => {
      const base = getApiUrl();
      const url = new URL(`/api/admin/users/${userId}`, base);
      const res = await fetch(url.toString(), { credentials: "include" });
      if (!res.ok) throw new Error("Errore caricamento utente");
      return res.json();
    },
    enabled: !!userId,
    staleTime: 60000,
  });

  const totalMatches = data?.matchesByType.reduce((s, t) => s + t.count, 0) ?? 0;

  const recalcMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/admin/users/${userId}/matches/recalculate`);
      return res.json();
    },
    onSuccess: (result) => {
      setDeletedAt(null);
      queryClient.invalidateQueries({ queryKey });
      Alert.alert(
        "Ricalcolo completato",
        `Nuovi match: ${result.bikerBiker ?? 0} B-B + ${result.zavorrina ?? 0} B-Z`,
      );
    },
    onError: () => Alert.alert("Errore", "Ricalcolo fallito"),
  });

  const deleteMatchesMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("DELETE", `/api/admin/users/${userId}/matches`);
      return res.json();
    },
    onSuccess: (result) => {
      setDeletedAt(result.lastDeletedAt ?? new Date().toISOString());
      queryClient.invalidateQueries({ queryKey });
      const total = result.deleted?.total ?? 0;
      const bb = result.deleted?.bikerBiker ?? 0;
      const bz = result.deleted?.bikerZavorrina ?? 0;
      const pp = result.deleted?.proposalProfile ?? 0;
      Alert.alert(
        "Match eliminati",
        `Eliminati ${total} match totali:\n${bb} biker-biker · ${bz} biker-zavorrina · ${pp} proposal`,
        [
          {
            text: "OK",
            onPress: () => {
              if (autoRecalc) {
                recalcMutation.mutate();
              }
            },
          },
        ],
      );
    },
    onError: () => Alert.alert("Errore", "Eliminazione match fallita"),
  });

  const saveEmailMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PUT", `/api/admin/users/${userId}/email`, { email: editEmail });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users", userId, "detail"] });
      Alert.alert("Email aggiornata", "L'email è stata modificata con successo.");
      setEditEmail("");
    },
    onError: () => Alert.alert("Errore", "Impossibile aggiornare l'email."),
  });

  const savePasswordMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PUT", `/api/admin/users/${userId}/password`, { password: editPassword });
      return res.json();
    },
    onSuccess: () => {
      Alert.alert("Password reimpostata", "La password è stata cambiata e le sessioni revocate.");
      setEditPassword("");
    },
    onError: () => Alert.alert("Errore", "Impossibile reimpostare la password."),
  });

  const saveProfileMutation = useMutation({
    mutationFn: async (payload: {
      userType: "biker" | "zavorrina" | "coppia";
      sex?: "M" | "F" | null;
      birthYear?: number | null;
      region?: string | null;
    }) => {
      const res = await apiRequest("PUT", `/api/admin/users/${userId}/profile`, payload);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { message?: string }).message ?? `HTTP ${res.status}`);
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users", userId, "detail"] });
      Alert.alert("Successo", "Profilo aggiornato");
    },
    onError: (err: Error) => Alert.alert("Errore", err.message || "Impossibile aggiornare il profilo"),
  });

  const handleDeleteMatches = () => {
    Alert.alert(
      "Elimina tutti i match",
      `Eliminare tutti i match dell'utente ${data?.user.nickname ?? ""}? L'operazione è irreversibile. Dopo potrai rilanciare il ricalcolo.`,
      [
        { text: "Annulla", style: "cancel" },
        {
          text: "Elimina",
          style: "destructive",
          onPress: () => deleteMatchesMutation.mutate(),
        },
      ],
    );
  };

  const handleStatusChange = (u: AdminUser) => {
    const nextStatus = u.status === "active" ? "suspended" : "active";
    Alert.alert(
      "Cambia stato",
      `Cambiare lo stato di ${u.nickname} da "${u.status}" a "${nextStatus}"?`,
      [
        { text: "Annulla", style: "cancel" },
        {
          text: "Conferma",
          onPress: async () => {
            try {
              await apiRequest("PUT", `/api/admin/users/${u.id}/status`, { status: nextStatus });
              queryClient.invalidateQueries({ queryKey: ["/api/admin/users", userId, "detail"] });
              queryClient.invalidateQueries({ queryKey });
            } catch {
              Alert.alert("Errore", "Impossibile cambiare lo stato.");
            }
          },
        },
      ],
    );
  };

  const handleMakeModerator = (u: AdminUser) => {
    Alert.alert(
      "Rendi Moderatore",
      `Assegnare il ruolo moderatore a ${u.nickname}?`,
      [
        { text: "Annulla", style: "cancel" },
        {
          text: "Conferma",
          onPress: async () => {
            try {
              await apiRequest("PUT", `/api/admin/users/${u.id}/role`, { role: "moderator" });
              queryClient.invalidateQueries({ queryKey: ["/api/admin/users", userId, "detail"] });
            } catch {
              Alert.alert("Errore", "Impossibile assegnare il ruolo.");
            }
          },
        },
      ],
    );
  };

  const handleDeleteUser = (u: AdminUser) => {
    Alert.alert(
      "Elimina Utente",
      `Eliminare definitivamente ${u.nickname}? L'operazione è irreversibile.`,
      [
        { text: "Annulla", style: "cancel" },
        {
          text: "Elimina",
          style: "destructive",
          onPress: async () => {
            try {
              await apiRequest("DELETE", `/api/admin/users/${u.id}`);
              setEditModalVisible(false);
            } catch {
              Alert.alert("Errore", "Impossibile eliminare l'utente.");
            }
          },
        },
      ],
    );
  };

  const handleOpenEditModal = useCallback(() => {
    if (fullUser) {
      setEditEmail(fullUser.email ?? "");
    }
    setEditPassword("");
    setEditModalVisible(true);
  }, [fullUser]);

  const toggleType = useCallback((typeKey: string) => {
    setExpandedTypes((prev) => {
      const next = new Set(prev);
      if (next.has(typeKey)) next.delete(typeKey);
      else next.add(typeKey);
      return next;
    });
  }, []);

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator color={Colors.accent} size="large" />
      </View>
    );
  }

  if (!data) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.errorText}>Utente non trovato</Text>
      </View>
    );
  }

  const { user, gpsRouteCount, matchesByType } = data;
  const needsRecalculate = !!deletedAt && totalMatches === 0;

  const modalUser: AdminUser | null = fullUser ?? {
    id: user.id,
    nickname: user.nickname,
    email: "",
    userType: user.userType,
    role: user.role,
    status: user.status,
    createdAt: "",
  };

  return (
    <>
      <ScrollView
        style={styles.container}
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
      >
        <MatchUserCard
          user={user}
          gpsRouteCount={gpsRouteCount}
          totalMatches={totalMatches}
          needsRecalculate={needsRecalculate}
          lastDeletedAt={deletedAt ?? undefined}
        />

        <View style={[styles.actionsRow, needsRecalculate && { marginTop: 12 }]}>
          <TouchableOpacity style={styles.refreshBtn} onPress={() => refetch()}>
            <Ionicons name="refresh" size={16} color={Colors.accent} />
            <Text style={styles.refreshText}>Aggiorna</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.recalcBtn, recalcMutation.isPending && { opacity: 0.6 }]}
            onPress={() => recalcMutation.mutate()}
            disabled={recalcMutation.isPending}
          >
            {recalcMutation.isPending ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <MaterialCommunityIcons name="calculator-variant" size={16} color="#fff" />
            )}
            <Text style={styles.recalcText}>
              {recalcMutation.isPending ? "Ricalcolo..." : "Ricalcola ora"}
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.deleteMatchesRow}>
          <View style={styles.deleteMatchesTop}>
            <TouchableOpacity
              style={[styles.deleteMatchesBtn, deleteMatchesMutation.isPending && { opacity: 0.6 }]}
              onPress={handleDeleteMatches}
              disabled={deleteMatchesMutation.isPending}
            >
              {deleteMatchesMutation.isPending ? (
                <ActivityIndicator size="small" color={Colors.error} />
              ) : (
                <MaterialCommunityIcons name="delete-sweep" size={16} color={Colors.error} />
              )}
              <Text style={styles.deleteMatchesText}>
                {deleteMatchesMutation.isPending ? "Eliminazione..." : "Elimina tutti i match"}
              </Text>
            </TouchableOpacity>
          </View>
          <Pressable
            style={styles.autoRecalcRow}
            onPress={() => setAutoRecalc((v) => !v)}
          >
            <Switch
              value={autoRecalc}
              onValueChange={() => {}}
              trackColor={{ false: Colors.border, true: Colors.accent + "88" }}
              thumbColor={autoRecalc ? Colors.accent : Colors.textSecondary}
              style={styles.autoRecalcSwitch}
            />
            <Text style={styles.autoRecalcLabel}>Ricalcola automaticamente dopo l'eliminazione</Text>
          </Pressable>
        </View>

        <ProfileGapsCard
          userId={userId!}
          totalMatches={totalMatches}
          onEditUser={handleOpenEditModal}
        />

        {totalMatches === 0 && (
          <ZeroMatchDiagnosisCard userId={userId!} />
        )}

        <PreferencesDiffCard sections={matchesByType} userId={userId!} nickname={user.nickname} />

        <MatchTypeSectionsList
          matchesByType={matchesByType}
          expandedTypes={expandedTypes}
          toggleType={toggleType}
          formatDate={formatDate}
          statusColor={statusColor}
          userId={userId!}
          nickname={user.nickname}
        />
      </ScrollView>

      <UserEditModal
        visible={editModalVisible}
        onClose={() => setEditModalVisible(false)}
        user={modalUser}
        editEmail={editEmail}
        setEditEmail={setEditEmail}
        editPassword={editPassword}
        setEditPassword={setEditPassword}
        onSaveEmail={() => saveEmailMutation.mutate()}
        onSavePassword={() => savePasswordMutation.mutate()}
        onStatusChange={handleStatusChange}
        onMakeModerator={handleMakeModerator}
        onDeleteUser={handleDeleteUser}
        getStatusColor={getStatusColorForModal}
        onSaveProfile={(payload) => saveProfileMutation.mutate(payload)}
        isSavingProfile={saveProfileMutation.isPending}
      />
    </>
  );
}
