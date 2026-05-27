// LARGE-FILE-LOCKED — limite: 658 righe (attuali: 658)
// Aggiungi nuove funzionalità in: app/proposals/create-extra.tsx
// Motivo: file delicato di dimensione media. Splittare ora introduce rischio.
//         Vedi Task #2584 (regola 600 righe) e Task "Lock dimensione file priorità media".

import React, { useState, useMemo, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  BackHandler,
} from "react-native";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import { useRouter, Stack } from "expo-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { MaterialCommunityIcons, Ionicons } from "@expo/vector-icons";
import * as Location from "expo-location";
import Colors from "@/constants/colors";
import { apiRequest, queryClient } from "@/lib/query-client";
import { useAuth } from "@/lib/auth-context";
import { useT } from "@/lib/language-context";
import MapPickerContent from "@/components/MapPickerModal";

// Sub-components
import { ProposalTypeSelector } from "@/components/proposals/create/ProposalTypeSelector";
import { ProposalBasicInfo } from "@/components/proposals/create/ProposalBasicInfo";
import { ProposalLocation } from "@/components/proposals/create/ProposalLocation";
import { ProposalVehicle } from "@/components/proposals/create/ProposalVehicle";
import { ProposalPreferences } from "@/components/proposals/create/ProposalPreferences";

const BIKER_SEARCH_TYPES = [
  { key: "find_a_friend", label: "FindAFriend", subtitleKey: "proposals.sub.findFriend", icon: "account-group", color: Colors.maleIcon },
  { key: "find_a_guest", labelKey: "proposals.searchType.findPassenger", subtitleKey: "proposals.sub.findPassenger", icon: "seat-passenger", color: Colors.femaleIcon },
  { key: "hitcher", label: "Hitcher", subtitleKey: "proposals.sub.hitcher", icon: "motorbike", color: Colors.accent },
  { key: "hitchhiker", label: "HitchHiker", subtitleKey: "proposals.sub.hitchhiker", icon: "thumb-up", color: Colors.success },
];

const ZAVORRINA_SEARCH_TYPES = [
  { key: "find_a_biker", label: "FindABiker", subtitleKey: "proposals.sub.bikerSearch", icon: "motorbike", color: Colors.maleIcon },
  { key: "hitchhiker", label: "HitchHiker", subtitleKey: "proposals.sub.hitchhikerZav", icon: "thumb-up", color: Colors.accent },
];

const TARGET_USER_TYPE_OPTIONS = [
  { key: "biker", labelKey: "proposal.targetBiker", icon: "motorbike", color: Colors.maleIcon },
  { key: "zavorrina", labelKey: "proposal.targetZavorrina", icon: "seat-passenger", color: Colors.femaleIcon },
  { key: "hitchhiker", labelKey: "proposal.targetHitchhiker", icon: "thumb-up", color: Colors.success },
  { key: "hotcher", labelKey: "proposal.targetHotcher", icon: "account-arrow-right", color: Colors.accent },
];

function formatDateInput(val: string): string {
  const nums = val.replace(/\D/g, "");
  if (nums.length <= 2) return nums;
  if (nums.length <= 4) return nums.slice(0, 2) + "/" + nums.slice(2);
  return nums.slice(0, 2) + "/" + nums.slice(2, 4) + "/" + nums.slice(4, 8);
}

function formatTimeInput(val: string): string {
  const nums = val.replace(/\D/g, "");
  if (nums.length <= 2) return nums;
  return nums.slice(0, 2) + ":" + nums.slice(2, 4);
}

function autoCompleteTime(val: string): string {
  const trimmed = val.trim();
  if (!trimmed || trimmed.includes(":")) return trimmed;
  const nums = trimmed.replace(/\D/g, "");
  if (nums.length === 0) return "";
  const h = parseInt(nums.slice(0, 2), 10);
  if (isNaN(h) || h > 23) return trimmed;
  return String(h).padStart(2, "0") + ":00";
}

function formatDateDDMMYYYY(d: Date): string {
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = String(d.getFullYear());
  return `${dd}/${mm}/${yyyy}`;
}

function parseDateAndTime(dateStr: string, timeStr: string): Date | null {
  const parts = dateStr.split("/");
  if (parts.length !== 3) return null;
  const [dd, mm, yyyy] = parts;
  const timeParts = timeStr.split(":");
  if (timeParts.length !== 2) return null;
  const d = new Date(parseInt(yyyy), parseInt(mm) - 1, parseInt(dd), parseInt(timeParts[0]), parseInt(timeParts[1]));
  return isNaN(d.getTime()) ? null : d;
}

export default function CreateProposalScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const t = useT();

  const [selectedSearchTypes, setSelectedSearchTypes] = useState<string[]>([]);
  const [selectedTargetUserTypes, setSelectedTargetUserTypes] = useState<string[]>([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [searchRadius, setSearchRadius] = useState("50");
  const [selectedMotoId, setSelectedMotoId] = useState("");
  const [selectedWishlistMotoId, setSelectedWishlistMotoId] = useState("");
  const [anyMotoOk, setAnyMotoOk] = useState(false);
  const [departureAddress, setDepartureAddress] = useState("");
  const [destinationAddress, setDestinationAddress] = useState("");
  const [dateStr, setDateStr] = useState("");
  const [timeFrom, setTimeFrom] = useState("");
  const [timeTo, setTimeTo] = useState("");
  const [returnDeadlineEnabled, setReturnDeadlineEnabled] = useState(false);
  const [returnDeadlineTime, setReturnDeadlineTime] = useState("");
  const [stops, setStops] = useState<string[]>([]);
  const [newStop, setNewStop] = useState("");
  const [maxParticipants, setMaxParticipants] = useState("");
  const [departureLat, setDepartureLat] = useState<number | null>(null);
  const [departureLng, setDepartureLng] = useState<number | null>(null);
  const [selectedClubId, setSelectedClubId] = useState<string | null>(null);
  const [gpsSource, setGpsSource] = useState<"profile" | "live" | "map" | null>(null);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [showMapPicker, setShowMapPicker] = useState(false);
  const [mapPickerMode, setMapPickerMode] = useState<"departure" | "destination">("departure");

  const [extendToDestination, setExtendToDestination] = useState(false);
  const [destinationExtRadius, setDestinationExtRadius] = useState("50");

  useEffect(() => {
    if (!showMapPicker) return;
    const handler = BackHandler.addEventListener("hardwareBackPress", () => {
      setShowMapPicker(false);
      return true;
    });
    return () => handler.remove();
  }, [showMapPicker]);

  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- auth user has profile coords at runtime
    const profileLat = (user as any)?.profileLatitude;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- auth user has profile coords at runtime
    const profileLng = (user as any)?.profileLongitude;
    if (profileLat && profileLng && !departureLat) {
      setDepartureLat(profileLat);
      setDepartureLng(profileLng);
      setGpsSource("profile");
    }
    fetchLiveLocation();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const fetchLiveLocation = useCallback(async () => {
    setGpsLoading(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        Alert.alert(t("proposals.create.permDenied"), t("proposals.create.enableLocation"));
        return;
      }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setDepartureLat(loc.coords.latitude);
      setDepartureLng(loc.coords.longitude);
      setGpsSource("live");
    } catch {
      Alert.alert(t("proposals.create.gpsError"), t("proposals.create.gpsErrorDesc"));
    } finally {
      setGpsLoading(false);
    }
  }, [t]);

  const isBikerOrCoppia = user?.userType === "biker" || user?.userType === "coppia";
  const isZavorrina = user?.userType === "zavorrina";

  const searchTypes = isBikerOrCoppia ? BIKER_SEARCH_TYPES : ZAVORRINA_SEARCH_TYPES;

  const toggleSearchType = (key: string) => {
    setSelectedSearchTypes((prev) => {
      if (prev.includes(key)) return prev.filter((k) => k !== key);
      if (prev.length >= 4) return prev;
      return [...prev, key];
    });
  };

  const toggleTargetUserType = (key: string) => {
    setSelectedTargetUserTypes((prev) => {
      if (prev.includes(key)) return prev.filter((k) => k !== key);
      return [...prev, key];
    });
  };

  const needsMotoSelection = isBikerOrCoppia && selectedSearchTypes.some((t) => ["find_a_friend", "find_a_guest", "hitcher"].includes(t));
  const needsWishlistMoto = isZavorrina && selectedSearchTypes.includes("find_a_biker");
  const needsDestination = selectedSearchTypes.includes("hitchhiker");
  const canExtendToDestination = isBikerOrCoppia && (selectedSearchTypes.includes("find_a_friend") || selectedSearchTypes.includes("find_a_guest"));

  const { data: motorcycles } = useQuery({
    queryKey: ["/api/motorcycles"],
    enabled: isBikerOrCoppia && selectedSearchTypes.length > 0,
  });

  const { data: wishlistData } = useQuery({
    queryKey: ["/api/wishlist"],
    enabled: isZavorrina && selectedSearchTypes.length > 0,
  });

  const { data: myClubsData } = useQuery({
    queryKey: ["/api/motoclubs/me/clubs"],
    enabled: isBikerOrCoppia,
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- clubs data from API
  const myClubs = (myClubsData as any[]) || [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- motorcycles from API
  const motos = (motorcycles as any[]) || [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- wishlist data from API
  const wishlistMotos = (wishlistData as any)?.motos || [];

  useEffect(() => {
    if (selectedSearchTypes.length === 0) return;
    const mapping: Record<string, string[]> = {
      find_a_friend: ["biker"],
      find_a_guest:  ["zavorrina"],
      hitcher:       ["hitchhiker"],
      hitchhiker:    ["hotcher"],
      find_a_biker:  ["biker", "hotcher"],
    };
    const derived = Array.from(
      new Set(selectedSearchTypes.flatMap((st) => mapping[st] ?? []))
    );
    if (derived.length > 0) {
      setSelectedTargetUserTypes(derived);
    }
  }, [selectedSearchTypes]);

  const proposalType = useMemo(() => {
    const first = selectedSearchTypes[0];
    if (!first) return "";
    if (first === "find_a_friend") return "giro";
    if (first === "find_a_guest") return "con_zavorrina";
    if (first === "hitcher" || first === "hitchhiker") return "passaggio_al_volo";
    if (first === "find_a_biker") return "richiesta";
    return "giro";
  }, [selectedSearchTypes]);

  const createMutation = useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const res = await apiRequest("POST", "/api/proposals", data);
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/proposals"] });
      router.back();
    },
    onError: (error: Error) => {
      Alert.alert(t("common.error"), (error as Error).message);
    },
  });

  const handleAddStop = () => {
    if (newStop.trim()) {
      setStops([...stops, newStop.trim()]);
      setNewStop("");
    }
  };

  const handleRemoveStop = (idx: number) => {
    setStops(stops.filter((_, i) => i !== idx));
  };

  const handleSubmit = async () => {
    if (selectedSearchTypes.length === 0) {
      Alert.alert(t("common.error"), t("proposals.create.selectSearch"));
      return;
    }
    if (!title.trim()) {
      Alert.alert(t("common.error"), t("proposals.create.enterTitle"));
      return;
    }
    if (!dateStr || !timeFrom) {
      Alert.alert(t("common.error"), t("proposals.create.enterDateTime"));
      return;
    }
    if (needsMotoSelection && !selectedMotoId) {
      Alert.alert(t("common.error"), t("proposals.create.selectMoto"));
      return;
    }
    if (needsWishlistMoto && !selectedWishlistMotoId && !anyMotoOk) {
      Alert.alert(t("common.error"), t("proposals.create.selectMotoType"));
      return;
    }
    if (needsDestination && !destinationAddress.trim()) {
      Alert.alert(t("common.error"), t("proposals.create.enterDest"));
      return;
    }

    const fromParts = timeFrom.split(":");
    if (fromParts.length === 2) {
      const fH = parseInt(fromParts[0]), fM = parseInt(fromParts[1]);
      if (fH < 0 || fH > 23 || fM < 0 || fM > 59) {
        Alert.alert(t("common.error"), t("proposals.create.invalidTimeFrom"));
        return;
      }
    }
    if (timeTo) {
      const toParts = timeTo.split(":");
      if (toParts.length === 2) {
        const tH = parseInt(toParts[0]), tM = parseInt(toParts[1]);
        if (tH < 0 || tH > 23 || tM < 0 || tM > 59) {
          Alert.alert(t("common.error"), t("proposals.create.invalidTimeTo"));
          return;
        }
        const fromMinutes = parseInt(fromParts[0]) * 60 + parseInt(fromParts[1]);
        const toMinutes = tH * 60 + tM;
        if (toMinutes <= fromMinutes) {
          Alert.alert(t("common.error"), t("proposals.create.timeToAfter"));
          return;
        }
      }
    }

    const departureTimeFrom = parseDateAndTime(dateStr, timeFrom);
    if (!departureTimeFrom) {
      Alert.alert(t("common.error"), t("proposals.create.invalidDateTime"));
      return;
    }

    let departureTimeTo: Date | null = null;
    if (timeTo) {
      departureTimeTo = parseDateAndTime(dateStr, timeTo);
    }

    let returnDeadline: Date | null = null;
    if (returnDeadlineEnabled && returnDeadlineTime) {
      returnDeadline = parseDateAndTime(dateStr, returnDeadlineTime);
      if (returnDeadline && departureTimeFrom && returnDeadline <= departureTimeFrom) {
        Alert.alert(t("common.error"), t("proposals.create.returnAfterDep"));
        return;
      }
    }

    const stopsData = stops.length > 0 ? stops.map((s) => ({ address: s })) : null;

    let finalLat = departureLat;
    let finalLng = departureLng;
    if (!finalLat || !finalLng) {
      if (departureAddress.trim()) {
        try {
          const geoRes = await fetch(
            `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(departureAddress.trim())}&format=json&limit=1`,
            { headers: { "User-Agent": "BikerLink/1.0" } }
          );
          const geoData = await geoRes.json();
          if (geoData && geoData.length > 0) {
            finalLat = parseFloat(geoData[0].lat);
            finalLng = parseFloat(geoData[0].lon);
            setDepartureLat(finalLat);
            setDepartureLng(finalLng);
            setGpsSource("profile");
          } else {
            Alert.alert(t("proposals.create.addressNotFound"), t("proposals.create.addressNotFoundDesc"));
            return;
          }
        } catch {
          Alert.alert(t("proposals.create.geocodingError"), t("proposals.create.geocodingErrorDesc"));
          return;
        }
      } else {
        Alert.alert(t("proposals.create.missingLocation"), t("proposals.create.missingLocationDesc"));
        return;
      }
    }

    const data: Record<string, unknown> = {
      proposalType,
      searchType: selectedSearchTypes[0] || null,
      searchTypes: selectedSearchTypes,
      targetUserTypes: selectedTargetUserTypes.length > 0 ? selectedTargetUserTypes : null,
      title: title.trim(),
      description: description.trim() || null,
      searchRadius: parseInt(searchRadius) || 50,
      departureAddress: departureAddress.trim() || "da qui....",
      departureLatitude: finalLat,
      departureLongitude: finalLng,
      scheduledAt: departureTimeFrom.toISOString(),
      departureTimeFrom: departureTimeFrom.toISOString(),
      departureTimeTo: departureTimeTo?.toISOString() || departureTimeFrom.toISOString(),
      stops: stopsData,
      maxParticipants: maxParticipants ? parseInt(maxParticipants) : null,
    };

    if (needsMotoSelection) data.motorcycleId = selectedMotoId;
    if (needsWishlistMoto) {
      data.wishlistMotoId = anyMotoOk ? null : selectedWishlistMotoId;
      data.anyMotoOk = anyMotoOk;
    }
    if (needsDestination) {
      data.destinationAddress = destinationAddress.trim();
      data.destinationLatitude = finalLat;
      data.destinationLongitude = finalLng;
    }
    if (returnDeadline) data.returnDeadline = returnDeadline.toISOString();
    if (selectedClubId) data.clubId = selectedClubId;
    if (canExtendToDestination && extendToDestination) {
      data.extendToDestination = true;
      data.destinationLatitude = finalLat;
      data.destinationLongitude = finalLng;
      data.destinationSearchRadius = parseInt(destinationExtRadius) || 50;
    }

    createMutation.mutate(data);
  };

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          title: isZavorrina ? "Richieste" : "Nuova Proposta",
          headerStyle: { backgroundColor: Colors.surface },
          headerTintColor: Colors.text,
          headerLeft: () => (
            <TouchableOpacity onPress={() => router.back()}>
              <Ionicons name="close" size={24} color={Colors.text} />
            </TouchableOpacity>
          ),
        }}
      />
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
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: 20, paddingBottom: 60 },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: Colors.text,
    marginTop: 24,
    marginBottom: 12,
  },
  input: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 14,
    color: Colors.text,
    fontSize: 15,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  typeGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 8,
  },
  typeCard: {
    flex: 1,
    minWidth: 80,
    alignItems: "center",
    padding: 12,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    gap: 6,
  },
  typeCardLabel: {
    fontSize: 12,
    fontWeight: "600" as const,
    color: Colors.textSecondary,
    textAlign: "center" as const,
  },
  submitButton: {
    backgroundColor: Colors.accent,
    borderRadius: 14,
    paddingVertical: 16,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
    marginTop: 24,
  },
  submitButtonDisabled: { opacity: 0.5 },
  submitText: { color: "#000", fontSize: 16, fontWeight: "700" as const },
});
