import React from "react";
import { View, Text, Modal, KeyboardAvoidingView, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { StregattaForm } from "@/components/admin/stregatti/StregattaForm";
import { StregattaChatModal } from "@/components/admin/stregatti/StregattaChatModal";
import { StregattaModals } from "@/components/admin/stregatti/StregattaModals";
import { styles } from "@/components/admin/stregatti/stregatti.styles";
import { COUNTRIES_DATA, getRegionsForCountry } from "@/components/admin/stregatti/countriesData";

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
