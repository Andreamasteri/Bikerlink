import React from "react";
import { View, Text, TouchableOpacity, Alert } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { getApiUrl, queryClient } from "@/lib/query-client";
import { StregattiPart2 } from "./stregatti.part2";
import { StregattaList } from "./stregatti.part4";
import { StregattaMap } from "@/components/admin/stregatti/StregattaMap";
import { styles } from "@/components/admin/stregatti/stregatti.styles";
import { 
  useStregattiState, 
  useStregattiQueries, 
  useStregattiMutations,
  useMassSeed
} from "./stregatti.part5";

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
