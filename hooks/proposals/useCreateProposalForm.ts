// overflow di app/proposals/create.tsx — logica di stato estratta
import { useState, useMemo, useEffect, useCallback } from "react";
import { Alert, BackHandler } from "react-native";
import { useRouter } from "expo-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import * as Location from "expo-location";
import Colors from "@/constants/colors";
import { apiRequest, queryClient, getApiUrl } from "@/lib/query-client";
import { useAuth } from "@/lib/auth-context";
import { useT } from "@/lib/language-context";
import {
  formatDateInput,
  formatTimeInput,
  autoCompleteTime,
  parseDateAndTime,
} from "@/app/proposals/create.helpers";
import type { AiRouteResult } from "@/components/proposals/create/AiPlanModal";
import type { LoadedRouteResult } from "@/components/proposals/create/LoadRouteModal";

export const BIKER_SEARCH_TYPES = [
  { key: "find_a_friend", label: "FindAFriend", subtitleKey: "proposals.sub.findFriend", icon: "account-group", color: Colors.maleIcon },
  { key: "find_a_guest", labelKey: "proposals.searchType.findPassenger", subtitleKey: "proposals.sub.findPassenger", icon: "seat-passenger", color: Colors.femaleIcon },
  { key: "hitcher", label: "Hitcher", subtitleKey: "proposals.sub.hitcher", icon: "motorbike", color: Colors.accent },
  { key: "hitchhiker", label: "HitchHiker", subtitleKey: "proposals.sub.hitchhiker", icon: "thumb-up", color: Colors.success },
];

export const ZAVORRINA_SEARCH_TYPES = [
  { key: "find_a_biker", label: "FindABiker", subtitleKey: "proposals.sub.bikerSearch", icon: "motorbike", color: Colors.maleIcon },
  { key: "hitchhiker", label: "HitchHiker", subtitleKey: "proposals.sub.hitchhikerZav", icon: "thumb-up", color: Colors.accent },
];

export const TARGET_USER_TYPE_OPTIONS = [
  { key: "biker", labelKey: "proposal.targetBiker", icon: "motorbike", color: Colors.maleIcon },
  { key: "zavorrina", labelKey: "proposal.targetZavorrina", icon: "seat-passenger", color: Colors.femaleIcon },
  { key: "hitchhiker", labelKey: "proposal.targetHitchhiker", icon: "thumb-up", color: Colors.success },
  { key: "hitcher", labelKey: "proposal.targetHitcher", icon: "account-arrow-right", color: Colors.accent },
];

async function geocodeDeparture(address: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const url = new URL("/api/planned-routes/geocode", getApiUrl());
    url.searchParams.set("q", address);
    const res = await fetch(url.toString(), {
      credentials: "include",
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) return null;
    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) return null;
    const first = data[0];
    const lat = parseFloat(first.lat);
    const lng = parseFloat(first.lng ?? first.lon);
    if (isNaN(lat) || isNaN(lng)) return null;
    return { lat, lng };
  } catch {
    return null;
  }
}

export function useCreateProposalForm() {
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
  const [showAiPlanModal, setShowAiPlanModal] = useState(false);
  const [showLoadRouteModal, setShowLoadRouteModal] = useState(false);
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const profileLat = (user as any)?.profileLatitude;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

  const applyRouteToForm = useCallback(
    (result: AiRouteResult | LoadedRouteResult) => {
      setDepartureLat(result.departure.lat);
      setDepartureLng(result.departure.lng);
      setDepartureAddress(result.departure.name);
      setGpsSource("map");
      if (result.stops.length > 0) {
        setStops(result.stops);
      }
      if (result.destination) {
        setDestinationAddress(result.destination.name);
      }
      Alert.alert(
        "Percorso caricato",
        `Partenza: ${result.departure.name}` +
          (result.stops.length > 0 ? `\n${result.stops.length} tappa/e intermedie` : "") +
          (result.destination ? `\nDestinazione: ${result.destination.name}` : "")
      );
    },
    []
  );

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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const myClubs = (myClubsData as any[]) || [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const motos = (motorcycles as any[]) || [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const wishlistMotos = (wishlistData as any)?.motos || [];

  useEffect(() => {
    if (selectedSearchTypes.length === 0) return;
    const mapping: Record<string, string[]> = {
      find_a_friend: ["biker"],
      find_a_guest:  ["zavorrina"],
      hitcher:       ["hitchhiker"],
      hitchhiker:    ["hitcher"],
      find_a_biker:  ["biker", "hitcher"],
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
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(
          (body as { message?: string }).message || `Errore ${res.status}`
        );
      }
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
        const geo = await geocodeDeparture(departureAddress.trim());
        if (geo) {
          finalLat = geo.lat;
          finalLng = geo.lng;
          setDepartureLat(finalLat);
          setDepartureLng(finalLng);
          setGpsSource("profile");
        } else {
          Alert.alert(
            "Indirizzo non trovato",
            "Non è stato possibile localizzare l'indirizzo inserito. Usa GPS o seleziona dalla mappa."
          );
          return;
        }
      } else {
        Alert.alert(
          "Posizione mancante",
          "Inserisci un indirizzo di partenza o usa il GPS / seleziona dalla mappa."
        );
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

  return {
    router, user, t,
    selectedSearchTypes, selectedTargetUserTypes,
    title, setTitle,
    description, setDescription,
    searchRadius, setSearchRadius,
    selectedMotoId, setSelectedMotoId,
    selectedWishlistMotoId, setSelectedWishlistMotoId,
    anyMotoOk, setAnyMotoOk,
    departureAddress, setDepartureAddress,
    destinationAddress, setDestinationAddress,
    dateStr, setDateStr,
    timeFrom, setTimeFrom,
    timeTo, setTimeTo,
    returnDeadlineEnabled, setReturnDeadlineEnabled,
    returnDeadlineTime, setReturnDeadlineTime,
    stops, newStop, setNewStop,
    maxParticipants, setMaxParticipants,
    departureLat, departureLng,
    selectedClubId, setSelectedClubId,
    gpsSource, setGpsSource,
    gpsLoading,
    showMapPicker, setShowMapPicker,
    mapPickerMode, setMapPickerMode,
    showAiPlanModal, setShowAiPlanModal,
    showLoadRouteModal, setShowLoadRouteModal,
    extendToDestination, setExtendToDestination,
    destinationExtRadius, setDestinationExtRadius,
    setDepartureLat, setDepartureLng,
    isBikerOrCoppia, isZavorrina, searchTypes,
    needsMotoSelection, needsWishlistMoto, needsDestination, canExtendToDestination,
    motos, wishlistMotos, myClubs,
    proposalType, createMutation,
    fetchLiveLocation, applyRouteToForm,
    toggleSearchType, toggleTargetUserType,
    handleAddStop, handleRemoveStop, handleSubmit,
    formatDateInput, formatTimeInput, autoCompleteTime,
  };
}
