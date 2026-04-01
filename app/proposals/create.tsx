import React, { useState, useMemo, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Platform,
  Alert,
  ActivityIndicator,
  Switch,
  BackHandler,
} from "react-native";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import { useRouter, Stack } from "expo-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { MaterialCommunityIcons, Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Location from "expo-location";
import Colors from "@/constants/colors";
import { apiRequest, queryClient } from "@/lib/query-client";
import { useAuth } from "@/lib/auth-context";
import { useT } from "@/lib/language-context";
import MapPickerContent from "@/components/MapPickerModal";

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
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const t = useT();

  const [searchType, setSearchType] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [searchRadius, setSearchRadius] = useState("30");
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
  const [mapPickerCoord, setMapPickerCoord] = useState<{ latitude: number; longitude: number } | null>(null);
  const [mapPickerMode, setMapPickerMode] = useState<"departure" | "destination">("departure");

  const [extendToDestination, setExtendToDestination] = useState(false);
  const [destinationExtLatStr, setDestinationExtLatStr] = useState("");
  const [destinationExtLngStr, setDestinationExtLngStr] = useState("");
  const [destinationExtLat, setDestinationExtLat] = useState<number | null>(null);
  const [destinationExtLng, setDestinationExtLng] = useState<number | null>(null);
  const [destinationExtRadius, setDestinationExtRadius] = useState("30");

  useEffect(() => {
    if (!showMapPicker) return;
    const handler = BackHandler.addEventListener("hardwareBackPress", () => {
      setShowMapPicker(false);
      return true;
    });
    return () => handler.remove();
  }, [showMapPicker]);

  useEffect(() => {
    const profileLat = (user as any)?.profileLatitude;
    const profileLng = (user as any)?.profileLongitude;
    if (profileLat && profileLng && !departureLat) {
      setDepartureLat(profileLat);
      setDepartureLng(profileLng);
      setGpsSource("profile");
    }
    fetchLiveLocation();
  }, [user]);

  const fetchLiveLocation = useCallback(async () => {
    setGpsLoading(true);
    try {
      if (Platform.OS === "web") {
        if (navigator.geolocation) {
          const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
            navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 10000 })
          );
          setDepartureLat(pos.coords.latitude);
          setDepartureLng(pos.coords.longitude);
          setGpsSource("live");
        }
      } else {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== "granted") {
          Alert.alert(t("proposals.create.permDenied"), t("proposals.create.enableLocation"));
          return;
        }
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        setDepartureLat(loc.coords.latitude);
        setDepartureLng(loc.coords.longitude);
        setGpsSource("live");
      }
    } catch {
      Alert.alert(t("proposals.create.gpsError"), t("proposals.create.gpsErrorDesc"));
    } finally {
      setGpsLoading(false);
    }
  }, []);

  const isBikerOrCoppia = user?.userType === "biker" || user?.userType === "coppia";
  const isZavorrina = user?.userType === "zavorrina";

  const searchTypes = isBikerOrCoppia ? BIKER_SEARCH_TYPES : ZAVORRINA_SEARCH_TYPES;

  const needsMotoSelection = isBikerOrCoppia && ["find_a_friend", "find_a_guest", "hitcher"].includes(searchType);
  const needsWishlistMoto = isZavorrina && searchType === "find_a_biker";
  const needsDestination = searchType === "hitchhiker";
  const canExtendToDestination = isBikerOrCoppia && (searchType === "find_a_friend" || searchType === "find_a_guest");

  const { data: motorcycles } = useQuery({
    queryKey: ["/api/motorcycles"],
    enabled: isBikerOrCoppia && !!searchType,
  });

  const { data: wishlistData } = useQuery({
    queryKey: ["/api/wishlist"],
    enabled: isZavorrina && !!searchType,
  });

  const { data: myClubsData } = useQuery({
    queryKey: ["/api/motoclubs/me/clubs"],
    enabled: isBikerOrCoppia,
  });
  const myClubs = (myClubsData as any[]) || [];

  const motos = (motorcycles as any[]) || [];
  const wishlistMotos = (wishlistData as any)?.motos || [];

  const proposalType = useMemo(() => {
    if (!searchType) return "";
    if (searchType === "find_a_friend") return "giro";
    if (searchType === "find_a_guest") return "con_zavorrina";
    if (searchType === "hitcher" || searchType === "hitchhiker") return "passaggio_al_volo";
    if (searchType === "find_a_biker") return "richiesta";
    return "giro";
  }, [searchType]);

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
      Alert.alert(t("common.error"), error.message);
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
    if (!searchType) {
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
      searchType,
      title: title.trim(),
      description: description.trim() || null,
      searchRadius: parseInt(searchRadius) || 30,
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
      data.destinationLatitude = departureLat;
      data.destinationLongitude = departureLng;
    }
    if (returnDeadline) data.returnDeadline = returnDeadline.toISOString();
    if (selectedClubId) data.clubId = selectedClubId;
    if (canExtendToDestination && extendToDestination && destinationExtLat && destinationExtLng) {
      data.extendToDestination = true;
      data.destinationLatitude = destinationExtLat;
      data.destinationLongitude = destinationExtLng;
      data.destinationSearchRadius = parseInt(destinationExtRadius) || 30;
    }

    createMutation.mutate(data);
  };

  const webTopInset = Platform.OS === "web" ? 67 : 0;

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
        style={[styles.container, { paddingTop: webTopInset }]}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        bottomOffset={20}
      >
        <Text style={styles.sectionTitle}>
          {isZavorrina ? "Cosa vorresti?" : "Cosa cerchi?"}
        </Text>
        <View style={styles.typeGrid}>
          {searchTypes.map((st) => (
            <TouchableOpacity
              key={st.key}
              style={[
                styles.typeCard,
                searchType === st.key && { borderColor: st.color, backgroundColor: st.color + "15" },
              ]}
              onPress={() => setSearchType(st.key)}
            >
              <MaterialCommunityIcons
                name={st.icon as any}
                size={28}
                color={searchType === st.key ? st.color : Colors.textSecondary}
              />
              <Text style={[styles.typeCardLabel, searchType === st.key && { color: st.color }]}>
                {(st as any).labelKey ? t((st as any).labelKey) : st.label}
              </Text>
              <Text style={styles.typeCardSub}>{t(st.subtitleKey)}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {!!searchType && (
          <>
            <Text style={styles.sectionTitle}>Titolo *</Text>
            <TextInput
              style={styles.input}
              value={title}
              onChangeText={setTitle}
              placeholder="Es: Giro sui colli toscani"
              placeholderTextColor={Colors.textSecondary}
              maxLength={200}
            />

            <Text style={styles.sectionTitle}>Raggio di ricerca (km) *</Text>
            <TextInput
              style={styles.input}
              value={searchRadius}
              onChangeText={setSearchRadius}
              placeholder="30"
              placeholderTextColor={Colors.textSecondary}
              keyboardType="number-pad"
            />

            {needsMotoSelection && (
              <>
                <Text style={styles.sectionTitle}>Seleziona la moto *</Text>
                {motos.length === 0 ? (
                  <Text style={styles.emptyText}>Nessuna moto nel garage. Aggiungine una prima.</Text>
                ) : (
                  <View style={styles.motoList}>
                    {motos.map((m: any) => (
                      <TouchableOpacity
                        key={m.id}
                        style={[
                          styles.motoCard,
                          selectedMotoId === m.id && styles.motoCardSelected,
                        ]}
                        onPress={() => setSelectedMotoId(m.id)}
                      >
                        <MaterialCommunityIcons
                          name="motorbike"
                          size={24}
                          color={selectedMotoId === m.id ? Colors.accent : Colors.textSecondary}
                        />
                        <View style={styles.motoInfo}>
                          <Text style={[styles.motoName, selectedMotoId === m.id && { color: Colors.accent }]}>
                            {m.brand} {m.model}
                          </Text>
                          <Text style={styles.motoSub}>
                            {m.motorcycleType} • {m.ridingStyle}
                          </Text>
                        </View>
                        {selectedMotoId === m.id && (
                          <Ionicons name="checkmark-circle" size={22} color={Colors.accent} />
                        )}
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </>
            )}

            {needsWishlistMoto && (
              <>
                <Text style={styles.sectionTitle}>Con che tipo di moto? *</Text>
                <TouchableOpacity
                  style={[styles.motoCard, anyMotoOk && styles.motoCardSelected]}
                  onPress={() => { setAnyMotoOk(!anyMotoOk); if (!anyMotoOk) setSelectedWishlistMotoId(""); }}
                >
                  <Ionicons name="checkmark-circle" size={24} color={anyMotoOk ? Colors.accent : Colors.textSecondary} />
                  <Text style={[styles.motoName, { flex: 1 }, anyMotoOk && { color: Colors.accent }]}>
                    Qualsiasi moto va bene
                  </Text>
                </TouchableOpacity>
                {!anyMotoOk && wishlistMotos.length > 0 && (
                  <View style={styles.motoList}>
                    {wishlistMotos.map((m: any) => (
                      <TouchableOpacity
                        key={m.id}
                        style={[
                          styles.motoCard,
                          selectedWishlistMotoId === m.id && styles.motoCardSelected,
                        ]}
                        onPress={() => setSelectedWishlistMotoId(m.id)}
                      >
                        <MaterialCommunityIcons
                          name="motorbike"
                          size={24}
                          color={selectedWishlistMotoId === m.id ? Colors.accent : Colors.textSecondary}
                        />
                        <View style={styles.motoInfo}>
                          <Text style={[styles.motoName, selectedWishlistMotoId === m.id && { color: Colors.accent }]}>
                            {m.brand || ""} {m.model || ""} {m.motorcycleType || ""}
                          </Text>
                          {m.ridingStyle && <Text style={styles.motoSub}>{m.ridingStyle}</Text>}
                        </View>
                        {selectedWishlistMotoId === m.id && (
                          <Ionicons name="checkmark-circle" size={22} color={Colors.accent} />
                        )}
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
                {!anyMotoOk && wishlistMotos.length === 0 && (
                  <Text style={styles.emptyText}>Nessun desiderio moto salvato. Puoi selezionare "Qualsiasi moto va bene".</Text>
                )}
              </>
            )}

            <Text style={styles.sectionTitle}>Punto di partenza</Text>
            <Text style={styles.fieldHint}>Descrizione del punto di partenza</Text>
            <TextInput
              style={styles.input}
              value={departureAddress}
              onChangeText={setDepartureAddress}
              placeholder="da qui...."
              placeholderTextColor={Colors.textSecondary}
            />

            <View style={styles.gpsStatusIndicator}>
              {gpsSource === "live" || gpsSource === "map" ? (
                <MaterialCommunityIcons name="thumb-up" size={20} color={Colors.success} />
              ) : (
                <Text style={styles.gpsStatusQuestion}>???</Text>
              )}
            </View>

            <View style={styles.gpsRow}>
              <TouchableOpacity
                style={[styles.gpsButton, gpsSource === "live" && { backgroundColor: Colors.accent + "30", borderColor: Colors.accent }]}
                onPress={() => {
                  if (gpsSource === "live") {
                    setGpsSource(null);
                    setDepartureLat(null);
                    setDepartureLng(null);
                  } else {
                    fetchLiveLocation();
                  }
                }}
                disabled={gpsLoading}
              >
                {gpsLoading ? (
                  <ActivityIndicator size="small" color="#000" />
                ) : (
                  <Ionicons name={gpsSource === "live" ? "checkmark-circle" : "navigate"} size={23} color={gpsSource === "live" ? Colors.success : "#000"} />
                )}
                <Text style={styles.gpsButtonText}>
                  {gpsLoading ? "Rilevamento..." : gpsSource === "live" ? "GPS attivo" : "Posizione attuale"}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.gpsButton, gpsSource === "map" && { backgroundColor: Colors.accent + "30", borderColor: Colors.accent }]}
                onPress={() => {
                  setMapPickerCoord(departureLat && departureLng ? { latitude: departureLat, longitude: departureLng } : null);
                  setShowMapPicker(true);
                }}
              >
                <Ionicons name={gpsSource === "map" ? "checkmark-circle" : "map"} size={23} color={gpsSource === "map" ? Colors.success : "#000"} />
                <Text style={styles.gpsButtonText}>
                  {gpsSource === "map" ? "Mappa" : "Scegli sulla mappa"}
                </Text>
              </TouchableOpacity>
            </View>

            {needsDestination && (
              <>
                <Text style={styles.sectionTitle}>Destinazione *</Text>
                <TextInput
                  style={styles.input}
                  value={destinationAddress}
                  onChangeText={setDestinationAddress}
                  placeholder="Es: Stazione Centrale, Milano"
                  placeholderTextColor={Colors.textSecondary}
                />
              </>
            )}

            {canExtendToDestination && (
              <>
                <View style={styles.switchRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.switchLabel}>Estendi invito al punto d'arrivo</Text>
                    <Text style={styles.switchSub}>Raggiungi chi si trova alla tua destinazione, anche fuori dal raggio normale</Text>
                  </View>
                  <Switch
                    value={extendToDestination}
                    onValueChange={(v) => {
                      setExtendToDestination(v);
                      if (!v) {
                        setDestinationExtLat(null);
                        setDestinationExtLng(null);
                        setDestinationExtLatStr("");
                        setDestinationExtLngStr("");
                      }
                    }}
                    trackColor={{ false: Colors.border, true: Colors.accent + "80" }}
                    thumbColor={extendToDestination ? Colors.accent : Colors.textSecondary}
                  />
                </View>

                {extendToDestination && (
                  <>
                    <Text style={styles.sectionTitle}>Coordinate punto d'arrivo</Text>
                    <View style={styles.latLngRow}>
                      <TextInput
                        style={[styles.input, styles.latLngInput]}
                        value={destinationExtLatStr}
                        onChangeText={(v) => {
                          setDestinationExtLatStr(v);
                          const parsed = parseFloat(v);
                          if (!isNaN(parsed)) setDestinationExtLat(parsed);
                          else setDestinationExtLat(null);
                        }}
                        placeholder="Latitudine"
                        placeholderTextColor={Colors.textSecondary}
                        keyboardType="decimal-pad"
                      />
                      <TextInput
                        style={[styles.input, styles.latLngInput]}
                        value={destinationExtLngStr}
                        onChangeText={(v) => {
                          setDestinationExtLngStr(v);
                          const parsed = parseFloat(v);
                          if (!isNaN(parsed)) setDestinationExtLng(parsed);
                          else setDestinationExtLng(null);
                        }}
                        placeholder="Longitudine"
                        placeholderTextColor={Colors.textSecondary}
                        keyboardType="decimal-pad"
                      />
                    </View>

                    <TouchableOpacity
                      style={[styles.gpsButton, { marginTop: 10, alignSelf: "flex-start" },
                        destinationExtLat && destinationExtLng ? { backgroundColor: Colors.accent + "30", borderColor: Colors.accent, borderWidth: 1 } : {}
                      ]}
                      onPress={() => {
                        setMapPickerMode("destination");
                        setMapPickerCoord(
                          destinationExtLat && destinationExtLng
                            ? { latitude: destinationExtLat, longitude: destinationExtLng }
                            : departureLat && departureLng
                              ? { latitude: departureLat, longitude: departureLng }
                              : null
                        );
                        setShowMapPicker(true);
                      }}
                    >
                      <Ionicons
                        name={destinationExtLat && destinationExtLng ? "checkmark-circle" : "map"}
                        size={23}
                        color={destinationExtLat && destinationExtLng ? Colors.success : "#000"}
                      />
                      <Text style={styles.gpsButtonText}>
                        {destinationExtLat && destinationExtLng ? "Destinazione impostata" : "Scegli sulla mappa"}
                      </Text>
                    </TouchableOpacity>

                    <Text style={styles.sectionTitle}>Raggio sul punto d'arrivo (km)</Text>
                    <TextInput
                      style={styles.input}
                      value={destinationExtRadius}
                      onChangeText={setDestinationExtRadius}
                      placeholder="30"
                      placeholderTextColor={Colors.textSecondary}
                      keyboardType="number-pad"
                    />
                  </>
                )}
              </>
            )}

            <View style={styles.dateLabelRow}>
              <Text style={[styles.sectionTitle, { marginTop: 8, marginBottom: 0, flex: 1 }]}>Data e Ora di Partenza *</Text>
              <TouchableOpacity
                style={styles.dateShortcutBtn}
                onPress={() => setDateStr(formatDateDDMMYYYY(new Date()))}
              >
                <Text style={styles.dateShortcutText}>Oggi</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.dateShortcutBtn}
                onPress={() => {
                  const tomorrow = new Date();
                  tomorrow.setDate(tomorrow.getDate() + 1);
                  setDateStr(formatDateDDMMYYYY(tomorrow));
                }}
              >
                <Text style={styles.dateShortcutText}>Domani</Text>
              </TouchableOpacity>
            </View>
            <TextInput
              style={[styles.input, { marginTop: 6 }]}
              value={dateStr}
              onChangeText={(v) => setDateStr(formatDateInput(v))}
              placeholder="GG/MM/AAAA"
              placeholderTextColor={Colors.textSecondary}
              keyboardType="number-pad"
              maxLength={10}
            />

            <View style={styles.timeRow}>
              <View style={styles.timeCol}>
                <Text style={styles.sectionTitle}>Dalle *</Text>
                <TextInput
                  style={styles.input}
                  value={timeFrom}
                  onChangeText={(v) => setTimeFrom(formatTimeInput(v))}
                  placeholder="HH:MM"
                  placeholderTextColor={Colors.textSecondary}
                  keyboardType="number-pad"
                  maxLength={5}
                />
              </View>
              <View style={styles.timeCol}>
                <Text style={styles.sectionTitle}>Alle (Orario limite partenza)</Text>
                <TextInput
                  style={styles.input}
                  value={timeTo}
                  onChangeText={(v) => setTimeTo(formatTimeInput(v))}
                  placeholder="HH:MM"
                  placeholderTextColor={Colors.textSecondary}
                  keyboardType="number-pad"
                  maxLength={5}
                />
              </View>
            </View>

            {!needsDestination && (
              <>
                <Text style={styles.sectionTitle}>Tappe di ritrovo</Text>
                <Text style={styles.fieldHint}>qualche tappa per ritrovarsi lungo il tragitto... eg il bar di Mario</Text>
                {stops.map((s, i) => (
                  <View key={i} style={styles.stopRow}>
                    <Ionicons name="flag" size={16} color={Colors.accent} />
                    <Text style={styles.stopText}>{s}</Text>
                    <TouchableOpacity onPress={() => handleRemoveStop(i)}>
                      <Ionicons name="close-circle" size={20} color={Colors.accentRed} />
                    </TouchableOpacity>
                  </View>
                ))}
                <View style={styles.addStopRow}>
                  <TextInput
                    style={[styles.input, { flex: 1 }]}
                    value={newStop}
                    onChangeText={setNewStop}
                    placeholder="Aggiungi tappa..."
                    placeholderTextColor={Colors.textSecondary}
                    onSubmitEditing={handleAddStop}
                  />
                  <TouchableOpacity style={styles.addStopBtn} onPress={handleAddStop}>
                    <Ionicons name="add" size={22} color="#000" />
                  </TouchableOpacity>
                </View>
              </>
            )}

            {isZavorrina && (
              <View style={styles.switchRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.switchLabel}>Tempo limite rientro</Text>
                  <Text style={styles.switchSub}>Se attivo, il biker verrà avvisato</Text>
                </View>
                <Switch
                  value={returnDeadlineEnabled}
                  onValueChange={setReturnDeadlineEnabled}
                  trackColor={{ false: Colors.border, true: Colors.accent + "80" }}
                  thumbColor={returnDeadlineEnabled ? Colors.accent : Colors.textSecondary}
                />
              </View>
            )}

            {returnDeadlineEnabled && (
              <>
                <Text style={styles.sectionTitle}>Rientro entro le</Text>
                <TextInput
                  style={styles.input}
                  value={returnDeadlineTime}
                  onChangeText={(v) => setReturnDeadlineTime(formatTimeInput(v))}
                  placeholder="HH:MM"
                  placeholderTextColor={Colors.textSecondary}
                  keyboardType="number-pad"
                  maxLength={5}
                />
              </>
            )}

            {isBikerOrCoppia && myClubs.length > 0 && (
              <>
                <Text style={styles.sectionTitle}>Proposta Riservata al Club</Text>
                <View style={styles.clubSelectorRow}>
                  <TouchableOpacity
                    style={[styles.clubChip, !selectedClubId && styles.clubChipActive]}
                    onPress={() => setSelectedClubId(null)}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.clubChipText, !selectedClubId && styles.clubChipTextActive]}>
                      Pubblica
                    </Text>
                  </TouchableOpacity>
                  {myClubs.map((c: any) => (
                    <TouchableOpacity
                      key={c.id}
                      style={[styles.clubChip, selectedClubId === c.id && styles.clubChipActive]}
                      onPress={() => setSelectedClubId(c.id === selectedClubId ? null : c.id)}
                      activeOpacity={0.8}
                    >
                      <Ionicons name="shield" size={12} color={selectedClubId === c.id ? Colors.text : Colors.textSecondary} />
                      <Text style={[styles.clubChipText, selectedClubId === c.id && styles.clubChipTextActive]} numberOfLines={1}>
                        {c.name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
                {selectedClubId && (
                  <Text style={styles.clubNote}>
                    Solo i membri del club vedranno questa proposta
                  </Text>
                )}
              </>
            )}

            <Text style={styles.sectionTitle}>Descrizione</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={description}
              onChangeText={setDescription}
              placeholder="Descrivi cosa offri, cerchi o vuoi fare..."
              placeholderTextColor={Colors.textSecondary}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
            />

            <Text style={styles.sectionTitle}>Max partecipanti</Text>
            <TextInput
              style={styles.input}
              value={maxParticipants}
              onChangeText={setMaxParticipants}
              placeholder="Lascia vuoto per illimitato"
              placeholderTextColor={Colors.textSecondary}
              keyboardType="number-pad"
            />

            <TouchableOpacity
              style={[
                styles.submitButton,
                (!searchType || !title.trim() || createMutation.isPending) && styles.submitButtonDisabled,
              ]}
              onPress={handleSubmit}
              disabled={!searchType || !title.trim() || createMutation.isPending}
              activeOpacity={0.8}
            >
              {createMutation.isPending ? (
                <ActivityIndicator color="#000" />
              ) : (
                <>
                  <Ionicons name="checkmark" size={22} color="#000" />
                  <Text style={styles.submitText}>Pubblica</Text>
                </>
              )}
            </TouchableOpacity>
          </>
        )}

        <View style={{ height: Platform.OS === "web" ? 34 : 40 }} />
      </KeyboardAwareScrollViewCompat>

      {showMapPicker && (
        <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, zIndex: 9999, elevation: 9999 }}>
          <MapPickerContent
            coord={mapPickerCoord}
            onCoordChange={setMapPickerCoord}
            onConfirm={() => {
              if (mapPickerCoord) {
                if (mapPickerMode === "destination") {
                  setDestinationExtLat(mapPickerCoord.latitude);
                  setDestinationExtLng(mapPickerCoord.longitude);
                  setDestinationExtLatStr(mapPickerCoord.latitude.toFixed(6));
                  setDestinationExtLngStr(mapPickerCoord.longitude.toFixed(6));
                } else {
                  setDepartureLat(mapPickerCoord.latitude);
                  setDepartureLng(mapPickerCoord.longitude);
                  setGpsSource("map");
                }
              }
              setMapPickerMode("departure");
              setShowMapPicker(false);
            }}
            onClose={() => {
              setMapPickerMode("departure");
              setShowMapPicker(false);
            }}
          />
        </View>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: 20 },
  sectionTitle: {
    color: Colors.text,
    fontSize: 15,
    fontWeight: "600" as const,
    marginBottom: 8,
    marginTop: 16,
  },
  typeGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  typeCard: {
    flex: 1,
    minWidth: 140,
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 14,
    alignItems: "center",
    gap: 6,
    borderWidth: 2,
    borderColor: Colors.border,
  },
  typeCardLabel: { color: Colors.textSecondary, fontSize: 13, fontWeight: "700" as const, textAlign: "center" },
  typeCardSub: { color: Colors.textSecondary, fontSize: 11, textAlign: "center" },
  input: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 14,
    color: Colors.text,
    fontSize: 15,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  textArea: { minHeight: 100 },
  timeRow: { flexDirection: "row", gap: 12 },
  timeCol: { flex: 1 },
  motoList: { gap: 8 },
  motoCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 14,
    gap: 12,
    borderWidth: 2,
    borderColor: Colors.border,
    marginBottom: 6,
  },
  motoCardSelected: { borderColor: Colors.accent, backgroundColor: Colors.accent + "10" },
  motoInfo: { flex: 1 },
  motoName: { color: Colors.text, fontSize: 14, fontWeight: "600" as const },
  motoSub: { color: Colors.textSecondary, fontSize: 12, marginTop: 2 },
  emptyText: { color: Colors.textSecondary, fontSize: 13, fontStyle: "italic" as const, marginTop: 4 },
  stopRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: Colors.surface,
    borderRadius: 10,
    padding: 10,
    marginBottom: 6,
  },
  stopText: { flex: 1, color: Colors.text, fontSize: 14 },
  addStopRow: { flexDirection: "row", gap: 8, alignItems: "center" },
  addStopBtn: {
    backgroundColor: Colors.accent,
    borderRadius: 10,
    width: 44,
    height: 44,
    justifyContent: "center",
    alignItems: "center",
  },
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 14,
    marginTop: 16,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  switchLabel: { color: Colors.text, fontSize: 14, fontWeight: "600" as const },
  switchSub: { color: Colors.textSecondary, fontSize: 11, marginTop: 2 },
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
  gpsStatusIndicator: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    marginTop: 6,
    marginBottom: 2,
  },
  gpsStatusQuestion: {
    fontSize: 18,
    fontWeight: "700" as const,
    color: Colors.warning,
    letterSpacing: 2,
  },
  gpsRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 12,
    marginTop: 13,
    marginBottom: 4,
  },
  gpsButton: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    backgroundColor: Colors.accent,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 18,
    gap: 6,
  },
  gpsButtonText: {
    color: "#000",
    fontSize: 16,
    fontWeight: "600" as const,
  },
  clubSelectorRow: {
    flexDirection: "row" as const,
    flexWrap: "wrap" as const,
    gap: 8,
    marginBottom: 8,
  },
  clubChip: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 16,
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  clubChipActive: { backgroundColor: Colors.accent, borderColor: Colors.accent },
  clubChipText: { fontSize: 13, color: Colors.textSecondary, fontFamily: "Inter_500Medium" as const },
  clubChipTextActive: { color: Colors.text },
  clubNote: { fontSize: 12, color: Colors.accent, marginBottom: 8, fontFamily: "Inter_400Regular" as const },
  fieldHint: {
    fontStyle: "italic" as const,
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: -4,
    marginBottom: 6,
  },
  latLngRow: {
    flexDirection: "row" as const,
    gap: 10,
    marginBottom: 4,
  },
  latLngInput: {
    flex: 1,
  },
  dateLabelRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 8,
    marginTop: 8,
  },
  dateShortcutBtn: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.accent,
    backgroundColor: Colors.accent + "15",
  },
  dateShortcutText: {
    fontSize: 12,
    fontWeight: "600" as const,
    color: Colors.accent,
  },
});
