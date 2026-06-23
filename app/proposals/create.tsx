import React, { useCallback, useMemo } from "react";
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator } from "react-native";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import { Stack } from "expo-router";
import { MaterialCommunityIcons, Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import MapPickerContent from "@/components/MapPickerModal";
import { styles } from "@/components/proposals/create.styles";
import { formatDateDDMMYYYY } from "@/components/proposals/create.helpers";
import { ProposalTypeSelector } from "@/components/proposals/create/ProposalTypeSelector";
import { ProposalBasicInfo } from "@/components/proposals/create/ProposalBasicInfo";
import { ProposalLocation } from "@/components/proposals/create/ProposalLocation";
import { ProposalVehicle } from "@/components/proposals/create/ProposalVehicle";
import { ProposalPreferences } from "@/components/proposals/create/ProposalPreferences";
import { AiPlanModal } from "@/components/proposals/create/AiPlanModal";
import { LoadRouteModal } from "@/components/proposals/create/LoadRouteModal";
import {
  useCreateProposalForm,
  TARGET_USER_TYPE_OPTIONS,
} from "@/hooks/proposals/useCreateProposalForm";

export default function CreateProposalScreen() {
  const {
    router, t,
    selectedSearchTypes, selectedTargetUserTypes,
    title, setTitle, description, setDescription,
    searchRadius, setSearchRadius,
    selectedMotoId, setSelectedMotoId,
    selectedWishlistMotoId, setSelectedWishlistMotoId,
    anyMotoOk, setAnyMotoOk,
    departureAddress, setDepartureAddress,
    destinationAddress, setDestinationAddress,
    dateStr, setDateStr, timeFrom, setTimeFrom, timeTo, setTimeTo,
    returnDeadlineEnabled, setReturnDeadlineEnabled,
    returnDeadlineTime, setReturnDeadlineTime,
    stops, newStop, setNewStop,
    maxParticipants, setMaxParticipants,
    departureLat, departureLng, setDepartureLat, setDepartureLng,
    selectedClubId, setSelectedClubId,
    gpsSource, setGpsSource, gpsLoading,
    showMapPicker, setShowMapPicker,
    mapPickerMode, setMapPickerMode,
    showAiPlanModal, setShowAiPlanModal,
    showLoadRouteModal, setShowLoadRouteModal,
    extendToDestination, setExtendToDestination,
    destinationExtRadius, setDestinationExtRadius,
    isZavorrina, searchTypes,
    needsMotoSelection, needsWishlistMoto, needsDestination, canExtendToDestination,
    motos, wishlistMotos, myClubs,
    createMutation,
    fetchLiveLocation, applyRouteToForm,
    toggleSearchType, toggleTargetUserType,
    handleAddStop, handleRemoveStop, handleSubmit,
    formatDateInput, formatTimeInput, autoCompleteTime,
  } = useCreateProposalForm();

  const headerLeft = useCallback(() => (
    <TouchableOpacity onPress={() => router.back()}>
      <Ionicons name="close" size={24} color={Colors.text} />
    </TouchableOpacity>
  ), [router]);

  const screenOptions = useMemo(() => ({
    headerShown: true as const,
    title: isZavorrina ? "Richieste" : "Nuova Proposta",
    headerStyle: { backgroundColor: Colors.surface },
    headerTintColor: Colors.text,
    headerLeft,
  }), [isZavorrina, headerLeft]);

  return (
    <>
      <Stack.Screen options={screenOptions} />
      <KeyboardAwareScrollViewCompat
        style={styles.container}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        bottomOffset={20}
      >
        <ProposalTypeSelector
          isZavorrina={isZavorrina}
          searchTypes={searchTypes}
          selectedSearchTypes={selectedSearchTypes}
          toggleSearchType={toggleSearchType}
        />

        {selectedSearchTypes.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>{t("proposal.targetSection")}</Text>
            <View style={styles.typeGrid}>
              {TARGET_USER_TYPE_OPTIONS.map((opt) => {
                const isSelected = selectedTargetUserTypes.includes(opt.key);
                return (
                  <TouchableOpacity
                    key={opt.key}
                    style={[
                      styles.typeCard,
                      isSelected && { borderColor: opt.color, backgroundColor: opt.color + "15" },
                    ]}
                    onPress={() => toggleTargetUserType(opt.key)}
                    testID={`target-type-${opt.key}`}
                  >
                    <MaterialCommunityIcons
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- icon name from option
                      name={opt.icon as any}
                      size={28}
                      color={isSelected ? opt.color : Colors.textSecondary}
                    />
                    <Text style={[styles.typeCardLabel, isSelected && { color: opt.color }]}>
                      {t(opt.labelKey)}
                    </Text>
                    {isSelected && (
                      <Ionicons name="checkmark-circle" size={16} color={opt.color} />
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          </>
        )}

        {selectedSearchTypes.length > 0 && (
          <>
            <ProposalBasicInfo
              title={title}
              setTitle={setTitle}
              description={description}
              setDescription={setDescription}
              dateStr={dateStr}
              setDateStr={setDateStr}
              timeFrom={timeFrom}
              setTimeFrom={setTimeFrom}
              timeTo={timeTo}
              setTimeTo={setTimeTo}
              formatDateInput={formatDateInput}
              formatTimeInput={formatTimeInput}
              autoCompleteTime={autoCompleteTime}
              formatDateDDMMYYYY={formatDateDDMMYYYY}
            />

            <Text style={styles.sectionTitle}>Raggio di ricerca (km) *</Text>
            <TextInput
              style={styles.input}
              value={searchRadius}
              onChangeText={setSearchRadius}
              placeholder="50"
              placeholderTextColor={Colors.textSecondary}
              keyboardType="number-pad"
            />

            <ProposalVehicle
              needsMotoSelection={needsMotoSelection}
              motos={motos}
              selectedMotoId={selectedMotoId}
              setSelectedMotoId={setSelectedMotoId}
              needsWishlistMoto={needsWishlistMoto}
              anyMotoOk={anyMotoOk}
              setAnyMotoOk={setAnyMotoOk}
              selectedWishlistMotoId={selectedWishlistMotoId}
              setSelectedWishlistMotoId={setSelectedWishlistMotoId}
              wishlistMotos={wishlistMotos}
            />

            <ProposalLocation
              departureAddress={departureAddress}
              setDepartureAddress={setDepartureAddress}
              destinationAddress={destinationAddress}
              setDestinationAddress={setDestinationAddress}
              gpsSource={gpsSource}
              setGpsSource={setGpsSource}
              gpsLoading={gpsLoading}
              fetchLiveLocation={fetchLiveLocation}
              setDepartureLat={setDepartureLat}
              setDepartureLng={setDepartureLng}
              setShowMapPicker={setShowMapPicker}
              setMapPickerMode={setMapPickerMode}
              needsDestination={needsDestination}
              stops={stops}
              newStop={newStop}
              setNewStop={setNewStop}
              handleAddStop={handleAddStop}
              handleRemoveStop={handleRemoveStop}
              onAiPlan={() => setShowAiPlanModal(true)}
              onLoadRoute={() => setShowLoadRouteModal(true)}
            />

            <ProposalPreferences
              maxParticipants={maxParticipants}
              setMaxParticipants={setMaxParticipants}
              returnDeadlineEnabled={returnDeadlineEnabled}
              setReturnDeadlineEnabled={setReturnDeadlineEnabled}
              returnDeadlineTime={returnDeadlineTime}
              setReturnDeadlineTime={setReturnDeadlineTime}
              formatTimeInput={formatTimeInput}
              autoCompleteTime={autoCompleteTime}
              extendToDestination={extendToDestination}
              setExtendToDestination={setExtendToDestination}
              destinationExtRadius={destinationExtRadius}
              setDestinationExtRadius={setDestinationExtRadius}
              canExtendToDestination={canExtendToDestination}
              selectedClubId={selectedClubId}
              setSelectedClubId={setSelectedClubId}
              myClubs={myClubs}
            />

            <TouchableOpacity
              style={[styles.submitButton, createMutation.isPending && styles.submitButtonDisabled]}
              onPress={handleSubmit}
              disabled={createMutation.isPending}
            >
              {createMutation.isPending ? (
                <ActivityIndicator color="#000" />
              ) : (
                <>
                  <MaterialCommunityIcons name="send" size={24} color="#000" />
                  <Text style={styles.submitText}>
                    {isZavorrina ? "INVIA RICHIESTA" : "PUBBLICA PROPOSTA"}
                  </Text>
                </>
              )}
            </TouchableOpacity>
          </>
        )}
      </KeyboardAwareScrollViewCompat>

      {showMapPicker && (
        // @ts-ignore – MapPickerContent API mismatch, props handled at runtime
        <MapPickerContent
          visible={showMapPicker}
          onClose={() => setShowMapPicker(false)}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any -- map picker coord shape
          onSelect={(coord: any) => {
            if (mapPickerMode === "departure") {
              setDepartureLat(coord.latitude);
              setDepartureLng(coord.longitude);
              setGpsSource("map");
            } else {
              setDestinationAddress(`${coord.latitude.toFixed(4)}, ${coord.longitude.toFixed(4)}`);
            }
            setShowMapPicker(false);
          }}
          initialCoord={
            departureLat && departureLng
              ? { latitude: departureLat, longitude: departureLng }
              : undefined
          }
        />
      )}

      <AiPlanModal
        visible={showAiPlanModal}
        onClose={() => setShowAiPlanModal(false)}
        onRouteReady={applyRouteToForm}
      />

      <LoadRouteModal
        visible={showLoadRouteModal}
        onClose={() => setShowLoadRouteModal(false)}
        onRouteSelected={applyRouteToForm}
      />
    </>
  );
}
