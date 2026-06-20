// LARGE-FILE-LOCKED — limite: 721 righe (baseline)
// Aggiungi nuove funzionalità in: app/admin/stregatti-extra.tsx
// Motivo: file delicato di dimensione media. Splittare ora introduce rischio.
//         Vedi Task #2584 (regola 600 righe) e Task "Lock dimensione file priorità media".

import React, { useState, useEffect, useRef } from "react";
import { View, Text, TouchableOpacity, FlatList, Modal, ActivityIndicator, Alert, KeyboardAvoidingView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useInfiniteQuery, useMutation, useQuery } from "@tanstack/react-query";
import Colors from "@/constants/colors";
import { apiRequest, getApiUrl, queryClient } from "@/lib/query-client";
import { useT } from "@/lib/language-context";
import { styles } from "@/components/admin/stregatti/stregatti.styles";

// Sub-components
import { StregattaCard } from "@/components/admin/stregatti/StregattaCard";
import { StregattaForm } from "@/components/admin/stregatti/StregattaForm";
import { StregattaFilters, StregattaFilterType } from "@/components/admin/stregatti/StregattaFilters";
import { StregattaActions } from "@/components/admin/stregatti/StregattaActions";
import { StregattaChatModal } from "@/components/admin/stregatti/StregattaChatModal";
import { StregattaModals } from "@/components/admin/stregatti/StregattaModals";
import { StregattaMap } from "@/components/admin/stregatti/StregattaMap";
import { COUNTRIES_DATA, getRegionsForCountry } from "@/components/admin/stregatti/countriesData";

interface FakeUser {
  id: string;
  nickname: string;
  userType: string;
  sex: string;
  region: string;
  birthYear: number;
  isFake: boolean;
  lastLoginAt: string | null;
  profile: { isAvailable: boolean } | null;
  profileViews: number;
  chatRequests: number;
  chatMessages: number;
}

interface FakeUsersPage {
  users: FakeUser[];
  total: number;
  hasMore: boolean;
  stats: { total: number; biker: number; zavorrina: number; coppia: number };
}

interface Conversation {
  id: number;
  otherParticipantNickname: string;
  lastMessage: string;
  messageCount: number;
}

interface ChatMessage {
  id: number;
  senderName: string;
  content: string;
  createdAt: string;
}

type AdminTab = "lista" | "mappa";

export default function FakeUsersAdmin() {
  const t = useT();
  const insets = useSafeAreaInsets();

  const [activeTab, setActiveTab] = useState<AdminTab>("lista");
  const flatListRef = useRef<FlatList<FakeUser>>(null);
  const [filter, setFilter] = useState<StregattaFilterType>("tutti");
  const [deleteAllConfirmVisible, setDeleteAllConfirmVisible] = useState(false);
  const [deleteSingleTarget, setDeleteSingleTarget] = useState<{ id: string; nickname: string } | null>(null);
  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [chatModalVisible, setChatModalVisible] = useState(false);
  const [deletingChats, setDeletingChats] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [selectedConvId, setSelectedConvId] = useState<number | null>(null);
  const [loadingChat, setLoadingChat] = useState(false);

  const [formType, setFormType] = useState<string>("biker");
  const [formSex, setFormSex] = useState<string>("M");
  const [formNickname, setFormNickname] = useState("");
  const [formCountry, setFormCountry] = useState("IT");
  const [formRegion, setFormRegion] = useState("Lombardia");
  const [formBirthYear, setFormBirthYear] = useState("");
  const [formBio, setFormBio] = useState("");
  const [formMotoBrand, setFormMotoBrand] = useState("");
  const [formMotoModel, setFormMotoModel] = useState("");
  const [formMotoType, setFormMotoType] = useState("Naked");
  const [formRidingStyle, setFormRidingStyle] = useState("Allegra");
  const [formDisplacement, setFormDisplacement] = useState("");
  const [formMotoYear, setFormMotoYear] = useState("");
  const [formWishlistDesc, setFormWishlistDesc] = useState("");
  const [formDesiredBrand, setFormDesiredBrand] = useState("");
  const [formDesiredModel, setFormDesiredModel] = useState("");
  const [formDesiredMotoType, setFormDesiredMotoType] = useState("");
  const [showCountryPicker, setShowCountryPicker] = useState(false);
  const [showRegionPicker, setShowRegionPicker] = useState(false);
  const [showMotoBrandPicker, setShowMotoBrandPicker] = useState(false);
  const [showDesiredBrandPicker, setShowDesiredBrandPicker] = useState(false);

  const { data: chatbotData } = useQuery<{ enabled: boolean }>({
    queryKey: ["/api/settings/chatbot-enabled"]
  });
  const chatbotEnabled = chatbotData?.enabled !== false;

  const chatbotMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      const baseUrl = getApiUrl();
      const url = new URL("/api/admin/settings/chatbot_enabled", baseUrl);
      const res = await fetch(url.toString(), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value: enabled ? "true" : "false" }),
        credentials: "include"
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings/chatbot-enabled"] });
    }
  });

  const { data: fakeUsersEnabledData } = useQuery<{ enabled: boolean }>({
    queryKey: ["/api/settings/fake-users-enabled"]
  });
  const allEnabled = fakeUsersEnabledData?.enabled !== false;

  const toggleAllMutation = useMutation({
    mutationFn: async ({ enabled, adminPassword }: { enabled: boolean; adminPassword: string }) => {
      const baseUrl = getApiUrl();
      const url = new URL("/api/admin/stregatti/toggle-all", baseUrl);
      const res = await fetch(url.toString(), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled, adminPassword }),
        credentials: "include"
      });
      if (!res.ok) {
        const err = await res.json().catch(() => {
          // no-op: fallback to default error object
          return { message: "Errore" };
        });
        throw new Error((err as Error).message);
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/stregatti"] });
      queryClient.invalidateQueries({ queryKey: ["/api/settings/fake-users-enabled"] });
      // Cascade: global visibility OFF forces activity + chatbot OFF on the server.
      queryClient.invalidateQueries({ queryKey: ["/api/admin/stregatti/motion/status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/settings/chatbot-enabled"] });
    }
  });

  const PAGE_SIZE = 50;
  const {
    data: usersData,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage
  } = useInfiniteQuery<FakeUsersPage>({
    queryKey: ["/api/admin/stregatti", filter],
    queryFn: async ({ pageParam = 0 }) => {
      const url = new URL("/api/admin/stregatti", getApiUrl());
      url.searchParams.set("limit", String(PAGE_SIZE));
      url.searchParams.set("offset", String((pageParam as number) * PAGE_SIZE));
      url.searchParams.set("type", filter);
      const res = await fetch(url.toString(), { credentials: "include" });
      if (!res.ok) throw new Error("Errore caricamento stregatti");
      return res.json();
    },
    getNextPageParam: (lastPage, allPages) => lastPage.hasMore ? allPages.length : undefined,
    initialPageParam: 0,
    retry: 1
  });

  const users: FakeUser[] = usersData?.pages.flatMap(p => p.users) ?? [];
  const totalCount = usersData?.pages[0]?.total ?? 0;
  const pageStats = usersData?.pages[0]?.stats ?? { total: 0, biker: 0, zavorrina: 0, coppia: 0 };

  const toggleAvailableMutation = useMutation({
    mutationFn: (id: string) => apiRequest("PUT", `/api/admin/stregatti/${id}/toggle-available`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/admin/stregatti"] })
  });

  const toggleOnlineMutation = useMutation({
    mutationFn: (id: string) => apiRequest("PUT", `/api/admin/stregatti/${id}/toggle-online`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/admin/stregatti"] })
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/admin/stregatti/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/admin/stregatti"] })
  });

  const deleteAllMutation = useMutation({
    mutationFn: () => apiRequest("DELETE", "/api/admin/stregatti").then(r => r.json() as Promise<{ deleted: number }>),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/stregatti"] });
      queryClient.invalidateQueries({ queryKey: ["/api/settings/fake-users-enabled"] });
      Alert.alert("Eliminazione completata", `${data?.deleted ?? 0} stregatti eliminati (insieme ai loro match).`);
    },
    onError: (error: Error) => {
      Alert.alert("Errore eliminazione", error?.message || "Impossibile eliminare gli stregatti. Riprova.");
    }
  });

  const [massSeedRunning, setMassSeedRunning] = useState(false);
  const [massSeedCreated, setMassSeedCreated] = useState(0);
  const [massSeedTotal, setMassSeedTotal] = useState(0);
  const [massSeedError, setMassSeedError] = useState<string | null>(null);
  const [massSeedConfirmVisible, setMassSeedConfirmVisible] = useState(false);

  const { data: motionStatus, refetch: refetchMotionStatus } = useQuery<{
    enabled: boolean;
    totalFakeUsers: number;
    movingNow: number;
    restingNow: number;
    lastCycleAt: string | null;
    totalCycles: number;
    speedDistribution: { city: number; highway: number; mountain: number };
    averageSpeedKph: number;
    convoiRiders: number;
  }>({
    queryKey: ["/api/admin/stregatti/motion/status"],
    refetchInterval: 35_000
  });

  const { data: bboxData, refetch: refetchBbox } = useQuery<{
    latMin: number;
    latMax: number;
    lngMin: number;
    lngMax: number;
    enabled: boolean;
  }>({
    queryKey: ["/api/admin/stregatti/motion/bbox"]
  });

  const toggleMotionMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      const url = new URL("/api/admin/stregatti/motion/toggle", getApiUrl());
      const res = await fetch(url.toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled }),
        credentials: "include"
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => refetchMotionStatus()
  });

  const updateBboxMutation = useMutation({
    mutationFn: async (patch: { enabled?: boolean; latMin?: number; latMax?: number; lngMin?: number; lngMax?: number }) => {
      const url = new URL("/api/admin/stregatti/motion/bbox", getApiUrl());
      const res = await fetch(url.toString(), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
        credentials: "include"
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => refetchBbox()
  });

  const wakeAllMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/admin/stregatti/wake-all", {}),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/admin/stregatti"] })
  });

  const forceMatchingMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/admin/force-matching", {}),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- force-matching response from API
    onSuccess: (data: any) => {
      const bb = data?.bikerBiker ?? 0;
      const zav = data?.zavorrina ?? 0;
      const total = bb + zav;
      Alert.alert("Successo", total === 0 ? t("admin.noNewMatch") : `${bb} biker-biker + ${zav} zavorrina match creati`);
    }
  });

  const resetMatchesMutation = useMutation({
    mutationFn: () => apiRequest("DELETE", "/api/admin/reset-matches", {}),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- reset-matches response from API
    onSuccess: (data: any) => {
      Alert.alert("Successo", `${data?.deleted ?? 0} match biker-biker eliminati`);
    }
  });

  const distributeMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/admin/stregatti/distribute-to-clubs", {}),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- distribute-to-clubs response from API
    onSuccess: (data: any) => {
      Alert.alert("Successo", `${data?.usersProcessed ?? "?"} utenti distribuiti (${data?.assigned ?? 0} assegnazioni)`);
    }
  });

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  const pollStatus = async () => {
    try {
      const res = await fetch(new URL("/api/admin/mass-seed-status", getApiUrl()).toString(), { credentials: "include" });
      if (!res.ok) return;
      const data = await res.json();
      setMassSeedRunning(data.running);
      setMassSeedCreated(data.created);
      setMassSeedTotal(data.total);
      setMassSeedError(data.error);
      if (!data.running) {
        stopPolling();
        queryClient.invalidateQueries({ queryKey: ["/api/admin/stregatti"] });
      }
    } catch {
      // no-op: silent failure during polling
    }
  };

  useEffect(() => {
    const checkStatus = async () => {
      try {
        const res = await fetch(new URL("/api/admin/mass-seed-status", getApiUrl()).toString(), { credentials: "include" });
        if (!res.ok) return;
        const data = await res.json();
        setMassSeedRunning(data.running);
        if (data.running) pollRef.current = setInterval(pollStatus, 3000);
      } catch {
        // no-op: ignore initial status check failures
      }
    };
    checkStatus();
    return stopPolling;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startMassSeed = async () => {
    try {
      setMassSeedError(null);
      const res = await fetch(new URL("/api/admin/mass-seed-fake-users", getApiUrl()).toString(), { method: "POST", credentials: "include" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setMassSeedError(data.message || "Impossibile avviare");
        return;
      }
      setMassSeedRunning(true);
      setMassSeedCreated(0);
      setMassSeedTotal(5000);
      pollRef.current = setInterval(pollStatus, 3000);
    } catch (e: unknown) {
      setMassSeedError((e as Error).message || "Errore di rete");
    }
  };

  const createMutation = useMutation({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- stregatta data from form
    mutationFn: (data: any) => apiRequest("POST", "/api/admin/stregatti", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/stregatti"] });
      setCreateModalVisible(false);
      resetForm();
    }
  });

  const resetForm = () => {
    setFormType("biker");
    setFormSex("M");
    setFormNickname("");
    setFormCountry("IT");
    setFormRegion("Lombardia");
    setFormBirthYear("");
    setFormBio("");
    setFormMotoBrand("");
    setFormMotoModel("");
    setFormMotoType("Naked");
    setFormRidingStyle("Allegra");
    setFormDisplacement("");
    setFormMotoYear("");
    setFormWishlistDesc("");
    setFormDesiredBrand("");
    setFormDesiredModel("");
    setFormDesiredMotoType("");
    setShowCountryPicker(false);
    setShowRegionPicker(false);
    setShowMotoBrandPicker(false);
    setShowDesiredBrandPicker(false);
  };

  const handleCreate = () => {
    if (!formNickname) return Alert.alert("Errore", "Nickname obbligatorio");
    createMutation.mutate({
      nickname: formNickname,
      userType: formType,
      sex: formSex,
      country: formCountry,
      region: formRegion,
      birthYear: parseInt(formBirthYear) || 1990,
      bio: formBio,
      motorcycle: {
        brand: formMotoBrand,
        model: formMotoModel,
        type: formMotoType,
        displacement: parseInt(formDisplacement) || null,
        year: parseInt(formMotoYear) || null,
        ridingStyle: formRidingStyle
      },
      wishlist: {
        description: formWishlistDesc,
        desiredBrand: formDesiredBrand,
        desiredModel: formDesiredModel,
        desiredMotoType: formDesiredMotoType
      }
    });
  };

  const openChatModal = async (userId: string) => {
    setSelectedUserId(userId);
    setChatModalVisible(true);
    setLoadingChat(true);
    setSelectedConvId(null);
    try {
      const res = await fetch(new URL(`/api/admin/stregatti/${userId}/conversations`, getApiUrl()).toString(), { credentials: "include" });
      if (res.ok) setConversations(await res.json());
    } finally {
      setLoadingChat(false);
    }
  };

  const loadMessages = async (convId: number | null) => {
    if (convId === null) {
      setSelectedConvId(null);
      setChatMessages([]);
      return;
    }
    setSelectedConvId(convId);
    setLoadingChat(true);
    try {
      const res = await fetch(new URL(`/api/admin/stregatti/conversations/${convId}/messages`, getApiUrl()).toString(), { credentials: "include" });
      if (res.ok) setChatMessages(await res.json());
    } finally {
      setLoadingChat(false);
    }
  };

  const handleDeleteChats = async () => {
    if (!selectedUserId) return;
    Alert.alert("Conferma", "Eliminare TUTTE le chat di questo utente?", [
      { text: "Annulla", style: "cancel" },
      {
        text: "Elimina",
        style: "destructive",
        onPress: async () => {
          setDeletingChats(true);
          try {
            const res = await fetch(new URL(`/api/admin/stregatti/${selectedUserId}/chats`, getApiUrl()).toString(), { method: "DELETE", credentials: "include" });
            if (res.ok) {
              setConversations([]);
              setSelectedConvId(null);
              Alert.alert("Successo", "Chat eliminate");
            }
          } finally {
            setDeletingChats(false);
          }
        }
      },
    ]);
  };

  return (
    <View style={styles.container}>
      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tabBtn, activeTab === "lista" && styles.tabBtnActive]}
          onPress={() => setActiveTab("lista")}
        >
          <Ionicons name="list" size={16} color={activeTab === "lista" ? Colors.accent : Colors.textSecondary} />
          <Text style={[styles.tabBtnText, activeTab === "lista" && styles.tabBtnTextActive]}>Lista</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabBtn, activeTab === "mappa" && styles.tabBtnActive]}
          onPress={() => setActiveTab("mappa")}
        >
          <Ionicons name="map" size={16} color={activeTab === "mappa" ? Colors.accent : Colors.textSecondary} />
          <Text style={[styles.tabBtnText, activeTab === "mappa" && styles.tabBtnTextActive]}>Mappa Live</Text>
          {(motionStatus?.movingNow ?? 0) > 0 && (
            <View style={styles.tabBadge}>
              <Text style={styles.tabBadgeText}>{motionStatus!.movingNow}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      {activeTab === "mappa" ? (
        <StregattaMap
          motionStatus={motionStatus ?? null}
          onToggleMotion={(v) => toggleMotionMutation.mutate(v)}
          isTogglingMotion={toggleMotionMutation.isPending}
          allEnabled={allEnabled}
        />
      ) : (
      <FlatList
        ref={flatListRef}
        data={users}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 20 }]}
        ListHeaderComponent={
          <>
            <Text style={styles.title}>Amministrazione Stregatti</Text>

            <StregattaActions
              chatbotEnabled={chatbotEnabled}
              onToggleChatbot={(v) => chatbotMutation.mutate(v)}
              allEnabled={allEnabled}
              onToggleAll={(v) => toggleAllMutation.mutate({ enabled: v, adminPassword: "" })}
              motionStatus={motionStatus ?? null}
              onToggleMotion={(v) => toggleMotionMutation.mutate(v)}
              isTogglingMotion={toggleMotionMutation.isPending}
              bboxData={bboxData ?? null}
              onToggleBbox={(v) => updateBboxMutation.mutate({ enabled: v })}
              isTogglingBbox={updateBboxMutation.isPending}
              onMassSeed={() => setMassSeedConfirmVisible(true)}
              onWakeAll={() => wakeAllMutation.mutate()}
              onDistribute={() => distributeMutation.mutate()}
              onForceMatching={() => forceMatchingMutation.mutate()}
              onResetMatches={() => resetMatchesMutation.mutate()}
              onDeleteAll={() => setDeleteAllConfirmVisible(true)}
              onCreateNew={() => setCreateModalVisible(true)}
              isMassSeedRunning={massSeedRunning}
              massSeedCreated={massSeedCreated}
              massSeedTotal={massSeedTotal}
              massSeedError={massSeedError}
              isWakingAll={wakeAllMutation.isPending}
              isDistributing={distributeMutation.isPending}
              isForcingMatching={forceMatchingMutation.isPending}
              isResettingMatches={resetMatchesMutation.isPending}
              totalCount={totalCount}
              t={t}
            />

            <StregattaFilters
              activeFilter={filter}
              onFilterChange={setFilter}
              stats={pageStats}
            />
          </>
        }
        renderItem={({ item }) => (
          <StregattaCard
            user={item}
            onToggleAvailable={(id) => toggleAvailableMutation.mutate(id)}
            onToggleOnline={(id) => toggleOnlineMutation.mutate(id)}
            onDelete={(id, nick) => setDeleteSingleTarget({ id, nickname: nick })}
            onOpenChat={openChatModal}
            isTogglingAvailable={toggleAvailableMutation.isPending && toggleAvailableMutation.variables === item.id}
            isTogglingOnline={toggleOnlineMutation.isPending && toggleOnlineMutation.variables === item.id}
            isDeleting={deleteMutation.isPending && deleteMutation.variables === item.id}
          />
        )}
        onEndReached={() => hasNextPage && !isFetchingNextPage && fetchNextPage()}
        onEndReachedThreshold={0.5}
        ListFooterComponent={isFetchingNextPage ? <ActivityIndicator color={Colors.accent} /> : null}
      />
      )}

      {/* Modals */}
      <Modal visible={createModalVisible} animationType="slide" transparent>
        <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
          <View style={styles.modalOverlay}>
            <View style={[styles.modalContent, { paddingTop: insets.top + 10, paddingBottom: insets.bottom + 10 }]}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Nuovo Stregatto</Text>
                <TouchableOpacity onPress={() => setCreateModalVisible(false)}>
                  <Ionicons name="close" size={24} color={Colors.text} />
                </TouchableOpacity>
              </View>
              <StregattaForm
                formType={formType} setFormType={setFormType}
                formSex={formSex} setFormSex={setFormSex}
                formNickname={formNickname} setFormNickname={setFormNickname}
                formCountry={formCountry} setFormCountry={setFormCountry}
                formRegion={formRegion} setFormRegion={setFormRegion}
                formBirthYear={formBirthYear} setFormBirthYear={setFormBirthYear}
                formBio={formBio} setFormBio={setFormBio}
                formMotoBrand={formMotoBrand} setFormMotoBrand={setFormMotoBrand}
                formMotoModel={formMotoModel} setFormMotoModel={setFormMotoModel}
                formMotoType={formMotoType} setFormMotoType={setFormMotoType}
                formRidingStyle={formRidingStyle} setFormRidingStyle={setFormRidingStyle}
                formDisplacement={formDisplacement} setFormDisplacement={setFormDisplacement}
                formMotoYear={formMotoYear} setFormMotoYear={setFormMotoYear}
                formWishlistDesc={formWishlistDesc} setFormWishlistDesc={setFormWishlistDesc}
                formDesiredBrand={formDesiredBrand} setFormDesiredBrand={setFormDesiredBrand}
                formDesiredModel={formDesiredModel} setFormDesiredModel={setFormDesiredModel}
                formDesiredMotoType={formDesiredMotoType} setFormDesiredMotoType={setFormDesiredMotoType}
                showCountryPicker={showCountryPicker} setShowCountryPicker={setShowCountryPicker}
                showRegionPicker={showRegionPicker} setShowRegionPicker={setShowRegionPicker}
                showMotoBrandPicker={showMotoBrandPicker} setShowMotoBrandPicker={setShowMotoBrandPicker}
                showDesiredBrandPicker={showDesiredBrandPicker} setShowDesiredBrandPicker={setShowDesiredBrandPicker}
                countriesData={COUNTRIES_DATA}
                getRegionsForCountry={getRegionsForCountry}
                onSubmit={handleCreate}
                isSubmitting={createMutation.isPending}
              />
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={chatModalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { paddingTop: insets.top + 10, paddingBottom: insets.bottom + 10 }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Chat Stregatto</Text>
              <TouchableOpacity onPress={() => setChatModalVisible(false)}>
                <Ionicons name="close" size={24} color={Colors.text} />
              </TouchableOpacity>
            </View>
            <StregattaChatModal
              conversations={conversations}
              chatMessages={chatMessages}
              selectedConvId={selectedConvId}
              setSelectedConvId={loadMessages}
              loadingChat={loadingChat}
              deletingChats={deletingChats}
              onDeleteChats={handleDeleteChats}
            />
          </View>
        </View>
      </Modal>

      <StregattaModals
        massSeedConfirmVisible={massSeedConfirmVisible}
        setMassSeedConfirmVisible={setMassSeedConfirmVisible}
        deleteAllConfirmVisible={deleteAllConfirmVisible}
        setDeleteAllConfirmVisible={setDeleteAllConfirmVisible}
        deleteSingleTarget={deleteSingleTarget}
        setDeleteSingleTarget={setDeleteSingleTarget}
        totalCount={totalCount}
        onStartMassSeed={startMassSeed}
        onConfirmDeleteAll={() => deleteAllMutation.mutate(undefined, { onSettled: () => setDeleteAllConfirmVisible(false) })}
        onConfirmDeleteSingle={(id) => { deleteMutation.mutate(id); setDeleteSingleTarget(null); }}
      />
    </View>
  );
}
