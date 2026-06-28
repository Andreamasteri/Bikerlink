// LARGE-FILE-ALLOW: schermata admin — catena split (part2/4/5) fusa in un file unico; stili, sotto-componenti e logica accoppiati alla schermata, nessuno split utile
/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useState, useRef } from "react";
import { View, Text, TouchableOpacity, Alert, Modal, KeyboardAvoidingView, Switch, ActivityIndicator, FlatList } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useInfiniteQuery, useMutation, useQuery } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/colors";
import { getApiUrl, apiRequest, queryClient } from "@/lib/query-client";
import { useT } from "@/lib/language-context";
import { StregattaMap } from "@/components/admin/stregatti/StregattaMap";
import { StregattaForm } from "@/components/admin/stregatti/StregattaForm";
import { StregattaChatModal } from "@/components/admin/stregatti/StregattaChatModal";
import { StregattaModals } from "@/components/admin/stregatti/StregattaModals";
import { StregattaCard } from "@/components/admin/stregatti/StregattaCard";
import { StregattaFilters } from "@/components/admin/stregatti/StregattaFilters";
import { styles } from "@/components/admin/stregatti/stregatti.styles";
import { COUNTRIES_DATA, getRegionsForCountry } from "@/components/admin/stregatti/countriesData";

export function useStregattiState() {
  const [activeTab, setActiveTab] = useState<string>("lista");
  const [filter, setFilter] = useState<string>("all");
  const [deleteAllConfirmVisible, setDeleteAllConfirmVisible] = useState(false);
  const [deleteSingleTarget, setDeleteSingleTarget] = useState<{ id: string; nickname: string } | null>(null);
  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [chatModalVisible, setChatModalVisible] = useState(false);
  const [deletingChats, setDeletingChats] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [conversations, setConversations] = useState<any[]>([]);
  const [chatMessages, setChatMessages] = useState<any[]>([]);
  const [selectedConvId, setSelectedConvId] = useState<number | null>(null);
  const [loadingChat, setLoadingChat] = useState(false);
  const flatListRef = useRef<any>(null);
  const insets = useSafeAreaInsets();
  const t = useT();

  const [formType, setFormType] = useState("biker");
  const [formSex, setFormSex] = useState("M");
  const [formNickname, setFormNickname] = useState("");
  const [formCountry, setFormCountry] = useState("IT");
  const [formRegion, setFormRegion] = useState("");
  const [formBirthYear, setFormBirthYear] = useState("1990");
  const [formBio, setFormBio] = useState("");
  const [formMotoBrand, setFormMotoBrand] = useState("");
  const [formMotoModel, setFormMotoModel] = useState("");
  const [formMotoType, setFormMotoType] = useState("naked");
  const [formRidingStyle, setFormRidingStyle] = useState("touring");
  const [formDisplacement, setFormDisplacement] = useState("600");
  const [formMotoYear, setFormMotoYear] = useState("2020");
  const [formWishlistDesc, setFormWishlistDesc] = useState("");
  const [formDesiredBrand, setFormDesiredBrand] = useState("");
  const [formDesiredModel, setFormDesiredModel] = useState("");
  const [formDesiredMotoType, setFormDesiredMotoType] = useState("naked");

  const [showCountryPicker, setShowCountryPicker] = useState(false);
  const [showRegionPicker, setShowRegionPicker] = useState(false);
  const [showMotoBrandPicker, setShowMotoBrandPicker] = useState(false);
  const [showDesiredBrandPicker, setShowDesiredBrandPicker] = useState(false);

  const resetForm = () => {
    setFormType("biker"); setFormSex("M"); setFormNickname(""); setFormCountry("IT");
    setFormRegion(""); setFormBirthYear("1990"); setFormBio(""); setFormMotoBrand("");
    setFormMotoModel(""); setFormMotoType("naked"); setFormRidingStyle("touring");
    setFormDisplacement("600"); setFormMotoYear("2020"); setFormWishlistDesc("");
    setFormDesiredBrand(""); setFormDesiredModel(""); setFormDesiredMotoType("naked");
  };

  const form = {
    formType, setFormType, formSex, setFormSex, formNickname, setFormNickname,
    formCountry, setFormCountry, formRegion, setFormRegion, formBirthYear, setFormBirthYear,
    formBio, setFormBio, formMotoBrand, setFormMotoBrand, formMotoModel, setFormMotoModel,
    formMotoType, setFormMotoType, formRidingStyle, setFormRidingStyle,
    formDisplacement, setFormDisplacement, formMotoYear, setFormMotoYear,
    formWishlistDesc, setFormWishlistDesc, formDesiredBrand, setFormDesiredBrand,
    formDesiredModel, setFormDesiredModel, formDesiredMotoType, setFormDesiredMotoType,
    resetForm,
  };
  const pickers = {
    showCountryPicker, setShowCountryPicker, showRegionPicker, setShowRegionPicker,
    showMotoBrandPicker, setShowMotoBrandPicker, showDesiredBrandPicker, setShowDesiredBrandPicker,
  };

  return {
    activeTab, setActiveTab, filter, setFilter,
    deleteAllConfirmVisible, setDeleteAllConfirmVisible,
    deleteSingleTarget, setDeleteSingleTarget,
    createModalVisible, setCreateModalVisible,
    chatModalVisible, setChatModalVisible,
    deletingChats, setDeletingChats,
    selectedUserId, setSelectedUserId,
    conversations, setConversations,
    chatMessages, setChatMessages,
    selectedConvId, setSelectedConvId,
    loadingChat, setLoadingChat,
    form, pickers, insets, t, flatListRef,
  };
}

export function useStregattiQueries(filter: string) {
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery<any>({
    queryKey: ["/api/admin/stregatti", filter],
    queryFn: async ({ pageParam = 0 }) => {
      const res = await apiRequest("GET", `/api/admin/stregatti?offset=${pageParam}&filter=${filter}`);
      return res.json();
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage: any) => lastPage.hasMore ? lastPage.nextOffset : undefined,
  });

  const users = data?.pages.flatMap((p: any) => p.users) ?? [];
  const totalCount = data?.pages[0]?.total ?? 0;
  const pageStats = data?.pages[0]?.stats ?? { total: 0, biker: 0, zavorrina: 0, coppia: 0 };

  const { data: chatbotData } = useQuery<any>({
    queryKey: ["/api/settings/chatbot-enabled"],
    queryFn: async () => (await apiRequest("GET", "/api/settings/chatbot-enabled")).json(),
  });
  const { data: allEnabledData } = useQuery<any>({
    queryKey: ["/api/admin/stregatti/all-enabled"],
    queryFn: async () => (await apiRequest("GET", "/api/admin/stregatti/all-enabled")).json(),
  });
  const { data: motionStatus, refetch: refetchMotionStatus } = useQuery<any>({
    queryKey: ["/api/admin/stregatti/motion-status"],
    queryFn: async () => (await apiRequest("GET", "/api/admin/stregatti/motion-status")).json(),
  });
  const { data: bboxData, refetch: refetchBbox } = useQuery<any>({
    queryKey: ["/api/admin/stregatti/bbox"],
    queryFn: async () => (await apiRequest("GET", "/api/admin/stregatti/bbox")).json(),
  });

  return {
    chatbotEnabled: chatbotData?.enabled ?? false,
    allEnabled: allEnabledData?.enabled ?? false,
    users, totalCount, pageStats,
    isFetchingNextPage, hasNextPage: hasNextPage ?? false, fetchNextPage,
    motionStatus, bboxData, refetchMotionStatus, refetchBbox,
  };
}

export function useStregattiMutations(
  _qc: any,
  setCreateModalVisible: (v: boolean) => void,
  resetForm: () => void,
  refetchMotionStatus: () => void,
  refetchBbox: () => void,
  _t: any,
) {
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["/api/admin/stregatti"] });

  const chatbotMutation = useMutation({
    mutationFn: (enabled: boolean) => apiRequest("POST", "/api/settings/chatbot-enabled", { enabled }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/settings/chatbot-enabled"] }),
  });
  const toggleAllMutation = useMutation({
    mutationFn: (body: any) => apiRequest("POST", "/api/admin/stregatti/toggle-all", body),
    onSuccess: () => { invalidate(); queryClient.invalidateQueries({ queryKey: ["/api/admin/stregatti/all-enabled"] }); },
  });
  const toggleAvailableMutation = useMutation({
    mutationFn: (id: string) => apiRequest("PATCH", `/api/admin/stregatti/${id}/available`),
    onSuccess: invalidate,
  });
  const toggleOnlineMutation = useMutation({
    mutationFn: (id: string) => apiRequest("PATCH", `/api/admin/stregatti/${id}/online`),
    onSuccess: invalidate,
  });
  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/admin/stregatti/${id}`),
    onSuccess: invalidate,
  });
  const deleteAllMutation = useMutation({
    mutationFn: () => apiRequest("DELETE", "/api/admin/stregatti/all"),
    onSuccess: invalidate,
  });
  const toggleMotionMutation = useMutation({
    mutationFn: (v: boolean) => apiRequest("POST", "/api/admin/stregatti/motion", { enabled: v }),
    onSuccess: () => refetchMotionStatus(),
  });
  const updateBboxMutation = useMutation({
    mutationFn: (body: any) => apiRequest("POST", "/api/admin/stregatti/bbox", body),
    onSuccess: () => refetchBbox(),
  });
  const wakeAllMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/admin/stregatti/wake-all"),
    onSuccess: invalidate,
  });
  const forceMatchingMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/admin/run-matching"),
    onSuccess: invalidate,
  });
  const resetMatchesMutation = useMutation({
    mutationFn: () => apiRequest("DELETE", "/api/admin/stregatti/matches"),
    onSuccess: invalidate,
  });
  const distributeMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/admin/stregatti/distribute"),
    onSuccess: invalidate,
  });
  const createMutation = useMutation({
    mutationFn: (body: any) => apiRequest("POST", "/api/admin/stregatti", body),
    onSuccess: () => { invalidate(); setCreateModalVisible(false); resetForm(); },
  });

  return {
    chatbotMutation, toggleAllMutation, toggleAvailableMutation, toggleOnlineMutation,
    deleteMutation, deleteAllMutation, toggleMotionMutation, updateBboxMutation,
    wakeAllMutation, forceMatchingMutation, resetMatchesMutation, distributeMutation, createMutation,
  };
}

export function useMassSeed(_qc: any) {
  const [massSeedRunning, setMassSeedRunning] = useState(false);
  const [massSeedCreated, setMassSeedCreated] = useState(0);
  const [massSeedTotal, setMassSeedTotal] = useState(0);
  const [massSeedError, setMassSeedError] = useState<string | null>(null);
  const [massSeedConfirmVisible, setMassSeedConfirmVisible] = useState(false);

  const startMassSeed = async () => {
    setMassSeedRunning(true);
    setMassSeedCreated(0);
    setMassSeedError(null);
    try {
      const res = await apiRequest("POST", "/api/admin/stregatti/mass-seed");
      const data = await res.json();
      setMassSeedCreated(data.created ?? 0);
      setMassSeedTotal(data.total ?? 0);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/stregatti"] });
    } catch (e: any) {
      setMassSeedError(e?.message ?? "Errore");
    } finally {
      setMassSeedRunning(false);
    }
  };

  return {
    massSeedRunning, massSeedCreated, massSeedTotal, massSeedError,
    massSeedConfirmVisible, setMassSeedConfirmVisible, startMassSeed,
  };
}

export function StregattaList({
  users,
  flatListRef,
  insets,
  totalCount,
  chatbotEnabled,
  onToggleChatbot,
  allEnabled,
  onToggleAll,
  _motionStatus,
  _onToggleMotion,
  _isTogglingMotion,
  _bboxData,
  _onToggleBbox,
  _isTogglingBbox,
  onMassSeed,
  onWakeAll,
  _onDistribute,
  _onForceMatching,
  _onResetMatches,
  onDeleteAll,
  _onCreateNew,
  isMassSeedRunning,
  _massSeedCreated,
  _massSeedTotal,
  _massSeedError,
  isWakingAll,
  _isDistributing,
  _isForcingMatching,
  _isResettingMatches,
  _t,
  filter,
  setFilter,
  pageStats,
  toggleAvailableMutation,
  toggleOnlineMutation,
  _deleteMutation,
  openChatModal,
  hasNextPage,
  isFetchingNextPage,
  fetchNextPage,
  styles
}: any) {
  return (
    <FlatList
      ref={flatListRef}
      data={users}
      keyExtractor={(item) => item.id}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 20 }]}
      ListHeaderComponent={
        <>
          <Text style={styles.title}>Amministrazione Stregatti</Text>

          <View style={{ padding: 16, backgroundColor: Colors.surface, borderRadius: 12, marginBottom: 16, gap: 12 }}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 16 }}>Controllo Globale</Text>
              <Text style={{ fontFamily: "Inter_400Regular", fontSize: 12, color: Colors.textSecondary }}>{totalCount} Stregatti</Text>
            </View>

            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 8 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: "Inter_500Medium", fontSize: 14 }}>Chatbot AI</Text>
                <Text style={{ fontFamily: "Inter_400Regular", fontSize: 12, color: Colors.textSecondary }}>Risposte automatiche ai messaggi</Text>
              </View>
              <Switch value={chatbotEnabled} onValueChange={onToggleChatbot} />
            </View>

            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 8 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: "Inter_500Medium", fontSize: 14 }}>Visibilità Globale</Text>
                <Text style={{ fontFamily: "Inter_400Regular", fontSize: 12, color: Colors.textSecondary }}>Mostra/nascondi tutti gli stregatti</Text>
              </View>
              <Switch value={allEnabled} onValueChange={onToggleAll} />
            </View>

            <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
              <TouchableOpacity onPress={onWakeAll} disabled={isWakingAll} style={{ padding: 10, backgroundColor: Colors.accent, borderRadius: 8 }}>
                 <Text style={{ color: "#fff" }}>{isWakingAll ? "Sveglia..." : "Sveglia Tutti"}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={onMassSeed} disabled={isMassSeedRunning} style={{ padding: 10, backgroundColor: Colors.success, borderRadius: 8 }}>
                 <Text style={{ color: "#fff" }}>{isMassSeedRunning ? `Seed` : "Mass Seed"}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={onDeleteAll} style={{ padding: 10, backgroundColor: Colors.error, borderRadius: 8 }}>
                 <Text style={{ color: "#fff" }}>Elimina Tutti</Text>
              </TouchableOpacity>
            </View>
          </View>

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
          onToggleAvailable={(id: string) => toggleAvailableMutation.mutate(id)}
          onToggleOnline={(id: string) => toggleOnlineMutation.mutate(id)}
          onDelete={(id: string, nick: string) => Alert.alert("Elimina", "Eliminare " + nick)}
          onOpenChat={openChatModal}
          isTogglingAvailable={toggleAvailableMutation.isPending && toggleAvailableMutation.variables === item.id}
          isTogglingOnline={toggleOnlineMutation.isPending && toggleOnlineMutation.variables === item.id}
          isDeleting={false}
        />
      )}
      onEndReached={() => hasNextPage && !isFetchingNextPage && fetchNextPage()}
      onEndReachedThreshold={0.5}
      ListFooterComponent={isFetchingNextPage ? <ActivityIndicator color={Colors.accent} /> : null}
    />
  );
}

interface StregattiPart2Props {
  createModalVisible: boolean;
  setCreateModalVisible: (v: boolean) => void;
  insets: { top: number; bottom: number };
  formType: string; setFormType: (v: string) => void;
  formSex: string; setFormSex: (v: string) => void;
  formNickname: string; setFormNickname: (v: string) => void;
  formCountry: string; setFormCountry: (v: string) => void;
  formRegion: string; setFormRegion: (v: string) => void;
  formBirthYear: string; setFormBirthYear: (v: string) => void;
  formBio: string; setFormBio: (v: string) => void;
  formMotoBrand: string; setFormMotoBrand: (v: string) => void;
  formMotoModel: string; setFormMotoModel: (v: string) => void;
  formMotoType: string; setFormMotoType: (v: string) => void;
  formRidingStyle: string; setFormRidingStyle: (v: string) => void;
  formDisplacement: string; setFormDisplacement: (v: string) => void;
  formMotoYear: string; setFormMotoYear: (v: string) => void;
  formWishlistDesc: string; setFormWishlistDesc: (v: string) => void;
  formDesiredBrand: string; setFormDesiredBrand: (v: string) => void;
  formDesiredModel: string; setFormDesiredModel: (v: string) => void;
  formDesiredMotoType: string; setFormDesiredMotoType: (v: string) => void;
  showCountryPicker: boolean; setShowCountryPicker: (v: boolean) => void;
  showRegionPicker: boolean; setShowRegionPicker: (v: boolean) => void;
  showMotoBrandPicker: boolean; setShowMotoBrandPicker: (v: boolean) => void;
  showDesiredBrandPicker: boolean; setShowDesiredBrandPicker: (v: boolean) => void;
  handleCreate: () => void;
  createMutationIsPending: boolean;
  chatModalVisible: boolean;
  setChatModalVisible: (v: boolean) => void;
  conversations: any[];
  chatMessages: any[];
  selectedConvId: number | null;
  loadMessages: (id: number | null) => void;
  loadingChat: boolean;
  deletingChats: boolean;
  handleDeleteChats: () => void;
  massSeedConfirmVisible: boolean;
  setMassSeedConfirmVisible: (v: boolean) => void;
  deleteAllConfirmVisible: boolean;
  setDeleteAllConfirmVisible: (v: boolean) => void;
  deleteSingleTarget: { id: string; nickname: string } | null;
  setDeleteSingleTarget: (v: { id: string; nickname: string } | null) => void;
  totalCount: number;
  startMassSeed: () => void;
  onConfirmDeleteAll: () => void;
  onConfirmDeleteSingle: (id: string) => void;
}

export const StregattiPart2 = ({
  createModalVisible,
  setCreateModalVisible,
  insets,
  formType, setFormType,
  formSex, setFormSex,
  formNickname, setFormNickname,
  formCountry, setFormCountry,
  formRegion, setFormRegion,
  formBirthYear, setFormBirthYear,
  formBio, setFormBio,
  formMotoBrand, setFormMotoBrand,
  formMotoModel, setFormMotoModel,
  formMotoType, setFormMotoType,
  formRidingStyle, setFormRidingStyle,
  formDisplacement, setFormDisplacement,
  formMotoYear, setFormMotoYear,
  formWishlistDesc, setFormWishlistDesc,
  formDesiredBrand, setFormDesiredBrand,
  formDesiredModel, setFormDesiredModel,
  formDesiredMotoType, setFormDesiredMotoType,
  showCountryPicker, setShowCountryPicker,
  showRegionPicker, setShowRegionPicker,
  showMotoBrandPicker, setShowMotoBrandPicker,
  showDesiredBrandPicker, setShowDesiredBrandPicker,
  handleCreate,
  createMutationIsPending,
  chatModalVisible,
  setChatModalVisible,
  conversations,
  chatMessages,
  selectedConvId,
  loadMessages,
  loadingChat,
  deletingChats,
  handleDeleteChats,
  massSeedConfirmVisible,
  setMassSeedConfirmVisible,
  deleteAllConfirmVisible,
  setDeleteAllConfirmVisible,
  deleteSingleTarget,
  setDeleteSingleTarget,
  totalCount,
  startMassSeed,
  onConfirmDeleteAll,
  onConfirmDeleteSingle,
}: StregattiPart2Props) => {
  return (
    <>
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
                isSubmitting={createMutationIsPending}
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
        onConfirmDeleteAll={onConfirmDeleteAll}
        onConfirmDeleteSingle={onConfirmDeleteSingle}
      />
    </>
  );
};

export default function FakeUsersAdmin() {
  const {
    activeTab, setActiveTab,
    filter, setFilter,
    deleteAllConfirmVisible, setDeleteAllConfirmVisible,
    deleteSingleTarget, setDeleteSingleTarget,
    createModalVisible, setCreateModalVisible,
    chatModalVisible, setChatModalVisible,
    deletingChats, setDeletingChats,
    selectedUserId, setSelectedUserId,
    conversations, setConversations,
    chatMessages, setChatMessages,
    selectedConvId, setSelectedConvId,
    loadingChat, setLoadingChat,
    form,
    pickers,
    insets,
    t,
    flatListRef
  } = useStregattiState();

  const {
    chatbotEnabled,
    allEnabled,
    users,
    totalCount,
    pageStats,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
    motionStatus,
    bboxData,
    refetchMotionStatus,
    refetchBbox
  } = useStregattiQueries(filter);

  const {
    chatbotMutation,
    toggleAllMutation,
    toggleAvailableMutation,
    toggleOnlineMutation,
    deleteMutation,
    deleteAllMutation,
    toggleMotionMutation,
    updateBboxMutation,
    wakeAllMutation,
    forceMatchingMutation,
    resetMatchesMutation,
    distributeMutation,
    createMutation
  } = useStregattiMutations(
    queryClient, 
    setCreateModalVisible, 
    form.resetForm, 
    refetchMotionStatus, 
    refetchBbox, 
    t
  );

  const {
    massSeedRunning,
    massSeedCreated,
    massSeedTotal,
    massSeedError,
    massSeedConfirmVisible, setMassSeedConfirmVisible,
    startMassSeed
  } = useMassSeed(queryClient);

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

  const handleCreate = () => {
    if (!form.formNickname) return Alert.alert("Errore", "Nickname obbligatorio");
    createMutation.mutate({
      nickname: form.formNickname,
      userType: form.formType,
      sex: form.formSex,
      country: form.formCountry,
      region: form.formRegion,
      birthYear: parseInt(form.formBirthYear) || 1990,
      bio: form.formBio,
      motorcycle: {
        brand: form.formMotoBrand,
        model: form.formMotoModel,
        type: form.formMotoType,
        displacement: parseInt(form.formDisplacement) || null,
        year: parseInt(form.formMotoYear) || null,
        ridingStyle: form.formRidingStyle
      },
      wishlist: {
        description: form.formWishlistDesc,
        desiredBrand: form.formDesiredBrand,
        desiredModel: form.formDesiredModel,
        desiredMotoType: form.formDesiredMotoType
      }
    });
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
        <StregattaList
          flatListRef={flatListRef}
          users={users}
          insets={insets}
          chatbotEnabled={chatbotEnabled}
          chatbotMutation={chatbotMutation}
          allEnabled={allEnabled}
          toggleAllMutation={toggleAllMutation}
          motionStatus={motionStatus}
          toggleMotionMutation={toggleMotionMutation}
          bboxData={bboxData}
          updateBboxMutation={updateBboxMutation}
          setMassSeedConfirmVisible={setMassSeedConfirmVisible}
          wakeAllMutation={wakeAllMutation}
          distributeMutation={distributeMutation}
          forceMatchingMutation={forceMatchingMutation}
          resetMatchesMutation={resetMatchesMutation}
          setDeleteAllConfirmVisible={setDeleteAllConfirmVisible}
          setCreateModalVisible={setCreateModalVisible}
          massSeedRunning={massSeedRunning}
          massSeedCreated={massSeedCreated}
          massSeedTotal={massSeedTotal}
          massSeedError={massSeedError}
          totalCount={totalCount}
          t={t}
          filter={filter}
          setFilter={setFilter}
          pageStats={pageStats}
          toggleAvailableMutation={toggleAvailableMutation}
          toggleOnlineMutation={toggleOnlineMutation}
          setDeleteSingleTarget={setDeleteSingleTarget}
          openChatModal={openChatModal}
          deleteMutation={deleteMutation}
          hasNextPage={hasNextPage}
          isFetchingNextPage={isFetchingNextPage}
          fetchNextPage={fetchNextPage}
        />
      )}

      <StregattiPart2
        createModalVisible={createModalVisible}
        setCreateModalVisible={setCreateModalVisible}
        insets={insets}
        formType={form.formType} setFormType={form.setFormType}
        formSex={form.formSex} setFormSex={form.setFormSex}
        formNickname={form.formNickname} setFormNickname={form.setFormNickname}
        formCountry={form.formCountry} setFormCountry={form.setFormCountry}
        formRegion={form.formRegion} setFormRegion={form.setFormRegion}
        formBirthYear={form.formBirthYear} setFormBirthYear={form.setFormBirthYear}
        formBio={form.formBio} setFormBio={form.setFormBio}
        formMotoBrand={form.formMotoBrand} setFormMotoBrand={form.setFormMotoBrand}
        formMotoModel={form.formMotoModel} setFormMotoModel={form.setFormMotoModel}
        formMotoType={form.formMotoType} setFormMotoType={form.setFormMotoType}
        formRidingStyle={form.formRidingStyle} setFormRidingStyle={form.setFormRidingStyle}
        formDisplacement={form.formDisplacement} setFormDisplacement={form.setFormDisplacement}
        formMotoYear={form.formMotoYear} setFormMotoYear={form.setFormMotoYear}
        formWishlistDesc={form.formWishlistDesc} setFormWishlistDesc={form.setFormWishlistDesc}
        formDesiredBrand={form.formDesiredBrand} setFormDesiredBrand={form.setFormDesiredBrand}
        formDesiredModel={form.formDesiredModel} setFormDesiredModel={form.setFormDesiredModel}
        formDesiredMotoType={form.formDesiredMotoType} setFormDesiredMotoType={form.setFormDesiredMotoType}
        showCountryPicker={pickers.showCountryPicker} setShowCountryPicker={pickers.setShowCountryPicker}
        showRegionPicker={pickers.showRegionPicker} setShowRegionPicker={pickers.setShowRegionPicker}
        showMotoBrandPicker={pickers.showMotoBrandPicker} setShowMotoBrandPicker={pickers.setShowMotoBrandPicker}
        showDesiredBrandPicker={pickers.showDesiredBrandPicker} setShowDesiredBrandPicker={pickers.setShowDesiredBrandPicker}
        handleCreate={handleCreate}
        createMutationIsPending={createMutation.isPending}
        chatModalVisible={chatModalVisible}
        setChatModalVisible={setChatModalVisible}
        conversations={conversations}
        chatMessages={chatMessages}
        selectedConvId={selectedConvId}
        loadMessages={loadMessages}
        loadingChat={loadingChat}
        deletingChats={deletingChats}
        handleDeleteChats={handleDeleteChats}
        massSeedConfirmVisible={massSeedConfirmVisible}
        setMassSeedConfirmVisible={setMassSeedConfirmVisible}
        deleteAllConfirmVisible={deleteAllConfirmVisible}
        setDeleteAllConfirmVisible={setDeleteAllConfirmVisible}
        deleteSingleTarget={deleteSingleTarget}
        setDeleteSingleTarget={setDeleteSingleTarget}
        totalCount={totalCount}
        startMassSeed={startMassSeed}
        onConfirmDeleteAll={() => deleteAllMutation.mutate()}
        onConfirmDeleteSingle={(id: string) => { deleteMutation.mutate(id); setDeleteSingleTarget(null); }}
      />
    </View>
  );
}
