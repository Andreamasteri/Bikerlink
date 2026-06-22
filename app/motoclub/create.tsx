import React, { useState, useCallback, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  ActivityIndicator,

  Alert,
} from "react-native";
import { useRouter } from "expo-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Location from "expo-location";
import Colors from "@/constants/colors";
import { getApiUrl } from "@/lib/query-client";
import LeafletPickerMap from "@/components/LeafletPickerMap";
import { t } from "@/lib/i18n";
import { InviteStep, SummaryStep } from "./create.part2";
import { styles } from "./create.styles";

export type Club = { id: string; name: string; clubType: string };
export type UserResult = { id: string; nickname: string; userType: string };

const STEPS = ["Tipo", "Posizione", "Inviti", "Riepilogo"];

export default function CreateMotoclub() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [step, setStep] = useState(0);
  const [clubName, setClubName] = useState("");
  const [parentType, setParentType] = useState<"main" | "sub">("main");
  const [parentClubId, setParentClubId] = useState<string | null>(null);
  const [parentClubName, setParentClubName] = useState<string>("");

  const [mapRegion, setMapRegion] = useState({
    latitude: 45.4642,
    longitude: 9.19,
    latitudeDelta: 5,
    longitudeDelta: 5
  });
  const [pin, setPin] = useState<{ latitude: number; longitude: number } | null>(null);
  const [loadingLocation, setLoadingLocation] = useState(false);

  const [useRadius, setUseRadius] = useState(false);
  const [radiusKm, setRadiusKm] = useState("25");
  const [useManual, setUseManual] = useState(false);
  const [userSearch, setUserSearch] = useState("");
  const [selectedUsers, setSelectedUsers] = useState<UserResult[]>([]);
  const [searchFocused, setSearchFocused] = useState(false);

  const [submitted, setSubmitted] = useState(false);

  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [debouncedSearch, setDebouncedSearch] = useState("");

  const { data: clubs = [] } = useQuery<Club[]>({
    queryKey: ["/api/motoclubs"]
  });

  const { data: searchResults = [] } = useQuery<UserResult[]>({
    queryKey: [`/api/users/search?q=${encodeURIComponent(debouncedSearch)}`],
    enabled: debouncedSearch.length >= 2
  });

  const handleSearchChange = useCallback((text: string) => {
    setUserSearch(text);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => setDebouncedSearch(text), 400);
  }, []);

  const handleGetLocation = async () => {
    setLoadingLocation(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Permesso negato", "Abilita la localizzazione nelle impostazioni");
        return;
      }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const { latitude, longitude } = loc.coords;
      setPin({ latitude, longitude });
      setMapRegion({ latitude, longitude, latitudeDelta: 0.5, longitudeDelta: 0.5 });
    } catch {
      Alert.alert("Errore", "Impossibile ottenere la posizione");
    } finally {
      setLoadingLocation(false);
    }
  };

  const submitMutation = useMutation({
    mutationFn: async () => {
      const baseUrl = getApiUrl();
      const url = new URL("/api/motoclubs/creation-request", baseUrl);
      const body: Record<string, unknown> = {
        name: clubName.trim(),
        parentClubId: parentType === "sub" ? parentClubId : undefined,
        latitude: pin?.latitude,
        longitude: pin?.longitude,
        inviteRadiusKm: useRadius ? parseInt(radiusKm, 10) : undefined,
        inviteUserIds: useManual ? selectedUsers.map((u) => u.id) : undefined
      };
      const res = await globalThis.fetch(url.toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        credentials: "include"
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: t("motoclub.createError") }));
        throw new Error((err as Error).message);
      }
      return res.json();
    },
    onSuccess: () => setSubmitted(true),
    onError: (e: Error) => Alert.alert("Errore", e.message)
  });

  const canNext = () => {
    if (step === 0) return clubName.trim().length >= 2 && (parentType === "main" || !!parentClubId);
    if (step === 1) return true;
    if (step === 2) return true;
    return false;
  };

  const toggleUser = (u: UserResult) => {
    setSelectedUsers((prev) =>
      prev.find((x) => x.id === u.id) ? prev.filter((x) => x.id !== u.id) : [...prev, u]
    );
  };

  if (submitted) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.successBox}>
          <Ionicons name="checkmark-circle" size={64} color={Colors.success} />
          <Text style={styles.successTitle}>Richiesta inviata!</Text>
          <Text style={styles.successDesc}>
            {t("motoclub.approvalNotif")}
          </Text>
          <TouchableOpacity style={styles.doneBtn} onPress={() => router.back()}>
            <Text style={styles.doneBtnText}>Torna ai Clubs</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => (step === 0 ? router.back() : setStep((s) => s - 1))} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Nuovo Club</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.stepsRow}>
        {STEPS.map((label, i) => (
          <View key={i} style={styles.stepItem}>
            <View style={[styles.stepDot, i <= step && styles.stepDotActive]}>
              {i < step ? (
                <Ionicons name="checkmark" size={14} color="#fff" />
              ) : (
                <Text style={[styles.stepNum, i === step && styles.stepNumActive]}>{i + 1}</Text>
              )}
            </View>
            {i < STEPS.length - 1 && <View style={[styles.stepLine, i < step && styles.stepLineActive]} />}
          </View>
        ))}
      </View>
      <Text style={styles.stepLabel}>{STEPS[step]}</Text>

      {step === 0 && (
        <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
          <Text style={styles.fieldLabel}>Tipo di motoclub</Text>
          <TouchableOpacity
            style={[styles.radioRow, parentType === "main" && styles.radioRowSelected]}
            onPress={() => { setParentType("main"); setParentClubId(null); }}
          >
            <View style={[styles.radioCircle, parentType === "main" && styles.radioCircleSelected]}>
              {parentType === "main" && <View style={styles.radioInner} />}
            </View>
            <Text style={styles.radioLabel}>Elenco principale</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.radioRow, parentType === "sub" && styles.radioRowSelected]}
            onPress={() => setParentType("sub")}
          >
            <View style={[styles.radioCircle, parentType === "sub" && styles.radioCircleSelected]}>
              {parentType === "sub" && <View style={styles.radioInner} />}
            </View>
            <Text style={styles.radioLabel}>Sotto un altro motoclub</Text>
          </TouchableOpacity>

          {parentType === "sub" && (
            <View style={styles.parentPickerBox}>
              <Text style={styles.fieldLabel}>Seleziona motoclub padre</Text>
              <ScrollView style={styles.parentList} nestedScrollEnabled>
                {clubs.filter((c) => c.clubType !== "custom" || c.id !== parentClubId).map((c) => (
                  <TouchableOpacity
                    key={c.id}
                    style={[styles.parentItem, parentClubId === c.id && styles.parentItemSelected]}
                    onPress={() => { setParentClubId(c.id); setParentClubName(c.name); }}
                  >
                    <Text style={[styles.parentItemText, parentClubId === c.id && { color: Colors.accent }]}>
                      {c.name}
                    </Text>
                    {parentClubId === c.id && <Ionicons name="checkmark" size={16} color={Colors.accent} />}
                  </TouchableOpacity>
                ))}
                {clubs.length === 0 && <Text style={styles.emptyText}>Nessun club disponibile</Text>}
              </ScrollView>
            </View>
          )}

          <Text style={[styles.fieldLabel, { marginTop: 20 }]}>Nome del nuovo motoclub</Text>
          <TextInput
            style={styles.textInput}
            value={clubName}
            onChangeText={setClubName}
            placeholder="Es. Bikers Roma Nord"
            placeholderTextColor={Colors.textSecondary}
            maxLength={100}
          />
        </ScrollView>
      )}

      {step === 1 && (
        <View style={styles.body}>
          <Text style={styles.fieldDesc}>
            Tocca la mappa per posizionare il pin del tuo motoclub.
          </Text>
          <View style={styles.map}>
            <LeafletPickerMap
              initialLat={mapRegion.latitude}
              initialLng={mapRegion.longitude}
              initialZoom={6}
              selectedCoord={pin ? { lat: pin.latitude, lng: pin.longitude } : null}
              onCoordPicked={(coord) => setPin(coord)}
            />
          </View>
          <TouchableOpacity style={styles.locationBtn} onPress={handleGetLocation} disabled={loadingLocation}>
            {loadingLocation ? (
              <ActivityIndicator size="small" color={Colors.accent} />
            ) : (
              <Ionicons name="navigate" size={16} color={Colors.accent} />
            )}
            <Text style={styles.locationBtnText}>Usa la mia posizione attuale</Text>
          </TouchableOpacity>
          {pin && (
            <Text style={styles.coordText}>
              Posizione: {pin.latitude.toFixed(4)}, {pin.longitude.toFixed(4)}
            </Text>
          )}
          {!pin && <Text style={styles.noCoordText}>Nessuna posizione selezionata (opzionale)</Text>}
        </View>
      )}

      {step === 2 && (
        <InviteStep
          useRadius={useRadius}
          setUseRadius={setUseRadius}
          radiusKm={radiusKm}
          setRadiusKm={setRadiusKm}
          useManual={useManual}
          setUseManual={setUseManual}
          userSearch={userSearch}
          handleSearchChange={handleSearchChange}
          t={t}
          searchFocused={searchFocused}
          setSearchFocused={setSearchFocused}
          debouncedSearch={debouncedSearch}
          searchResults={searchResults}
          selectedUsers={selectedUsers}
          toggleUser={toggleUser}
        />
      )}

      {step === 3 && (
        <SummaryStep
          clubName={clubName}
          parentType={parentType}
          parentClubName={parentClubName}
          pin={pin}
          useRadius={useRadius}
          radiusKm={radiusKm}
          useManual={useManual}
          selectedUsers={selectedUsers}
          submitMutation={submitMutation}
          t={t}
        />
      )}

      {step < 3 && (
        <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
          <TouchableOpacity
            style={[styles.nextBtn, !canNext() && { opacity: 0.4 }]}
            onPress={() => setStep((s) => s + 1)}
            disabled={!canNext()}
          >
            <Text style={styles.nextBtnText}>
              {step === 2 ? "Vai al Riepilogo" : "Avanti"}
            </Text>
            <Ionicons name="chevron-forward" size={18} color="#fff" />
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: Colors.border
  },
  backBtn: { width: 40, alignItems: "flex-start" },
  headerTitle: { fontFamily: "Inter_700Bold", fontSize: 18, color: Colors.text },
  stepsRow: {
    flexDirection: "row", alignItems: "center", paddingHorizontal: 24, paddingTop: 16, paddingBottom: 4
  },
  stepItem: { flex: 1, flexDirection: "row", alignItems: "center" },
  stepDot: {
    width: 26, height: 26, borderRadius: 13, borderWidth: 2, borderColor: Colors.border,
    alignItems: "center", justifyContent: "center", backgroundColor: Colors.surface
  },
  stepDotActive: { borderColor: Colors.accent, backgroundColor: Colors.accent },
  stepNum: { fontFamily: "Inter_600SemiBold", fontSize: 12, color: Colors.textSecondary },
  stepNumActive: { color: "#fff" },
  stepLine: { flex: 1, height: 2, backgroundColor: Colors.border, marginHorizontal: 2 },
  stepLineActive: { backgroundColor: Colors.accent },
  stepLabel: { fontFamily: "Inter_600SemiBold", fontSize: 13, color: Colors.textSecondary, textAlign: "center", marginBottom: 12 },
  body: { flex: 1, paddingHorizontal: 16 },
  bodyContent: { paddingBottom: 20 },
  fieldLabel: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: Colors.text, marginBottom: 8 },
  fieldDesc: { fontFamily: "Inter_400Regular", fontSize: 14, color: Colors.textSecondary, marginBottom: 12 },
  textInput: {
    backgroundColor: Colors.surface, borderRadius: 10, borderWidth: 1, borderColor: Colors.border,
    paddingHorizontal: 14, paddingVertical: 12, color: Colors.text,
    fontFamily: "Inter_400Regular", fontSize: 15
  },
  radioRow: {
    flexDirection: "row", alignItems: "center", gap: 12, padding: 14,
    backgroundColor: Colors.surface, borderRadius: 10, borderWidth: 1, borderColor: Colors.border, marginBottom: 10
  },
  radioRowSelected: { borderColor: Colors.accent, backgroundColor: Colors.accent + "10" },
  radioCircle: {
    width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: Colors.border,
    alignItems: "center", justifyContent: "center"
  },
  radioCircleSelected: { borderColor: Colors.accent },
  radioInner: { width: 10, height: 10, borderRadius: 5, backgroundColor: Colors.accent },
  radioLabel: { fontFamily: "Inter_500Medium", fontSize: 15, color: Colors.text },
  parentPickerBox: { marginTop: 10 },
  parentList: { maxHeight: 180, borderRadius: 10, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface },
  parentItem: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 12, borderBottomWidth: 1, borderBottomColor: Colors.border },
  parentItemSelected: { backgroundColor: Colors.accent + "10" },
  parentItemText: { fontFamily: "Inter_400Regular", fontSize: 14, color: Colors.text, flex: 1 },
  emptyText: { fontFamily: "Inter_400Regular", fontSize: 14, color: Colors.textSecondary, padding: 12 },
  map: { flex: 1, borderRadius: 12, overflow: "hidden", margin: 0, minHeight: 280 },
  mapWebFallback: {
    height: 180, backgroundColor: Colors.surface, borderRadius: 12, borderWidth: 1, borderColor: Colors.border,
    alignItems: "center", justifyContent: "center", padding: 16, gap: 10
  },
  mapWebText: { fontFamily: "Inter_400Regular", fontSize: 14, color: Colors.textSecondary },
  coordRow: { flexDirection: "row", width: "100%" },
  locationBtn: {
    flexDirection: "row", alignItems: "center", gap: 8, marginTop: 10,
    padding: 10, borderRadius: 8, borderWidth: 1, borderColor: Colors.accent + "60",
    backgroundColor: Colors.accent + "10"
  },
  locationBtnText: { fontFamily: "Inter_500Medium", fontSize: 14, color: Colors.accent },
  coordText: { fontFamily: "Inter_400Regular", fontSize: 12, color: Colors.textSecondary, marginTop: 8 },
  noCoordText: { fontFamily: "Inter_400Regular", fontSize: 12, color: Colors.textSecondary, marginTop: 8, fontStyle: "italic" },
  sectionTitle: { fontFamily: "Inter_700Bold", fontSize: 16, color: Colors.text, marginBottom: 16 },
  checkRow: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 8 },
  checkbox: {
    width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: Colors.border,
    alignItems: "center", justifyContent: "center"
  },
  checkboxChecked: { borderColor: Colors.accent, backgroundColor: Colors.accent },
  checkLabel: { fontFamily: "Inter_500Medium", fontSize: 15, color: Colors.text },
  radiusRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 8, marginLeft: 34 },
  radiusLabel: { fontFamily: "Inter_400Regular", fontSize: 14, color: Colors.text },
  radiusInput: {
    width: 64, borderWidth: 1, borderColor: Colors.accent, borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 6, textAlign: "center",
    color: Colors.text, fontFamily: "Inter_600SemiBold", fontSize: 15, backgroundColor: Colors.surface
  },
  searchDropdown: {
    backgroundColor: Colors.surface, borderRadius: 10, borderWidth: 1, borderColor: Colors.border,
    marginTop: 4
  },
  searchItem: {
    flexDirection: "row", alignItems: "center", gap: 10, padding: 10,
    borderBottomWidth: 1, borderBottomColor: Colors.border
  },
  searchItemText: { fontFamily: "Inter_400Regular", fontSize: 14, color: Colors.text, flex: 1 },
  selectedUsersBox: {
    marginTop: 12, backgroundColor: Colors.surface, borderRadius: 10,
    borderWidth: 1, borderColor: Colors.border, padding: 10
  },
  selectedUsersTitle: { fontFamily: "Inter_600SemiBold", fontSize: 13, color: Colors.textSecondary, marginBottom: 8 },
  selectedUserRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 4 },
  selectedUserName: { fontFamily: "Inter_400Regular", fontSize: 14, color: Colors.text, flex: 1 },
  noInviteText: { fontFamily: "Inter_400Regular", fontSize: 14, color: Colors.textSecondary, fontStyle: "italic", marginTop: 10 },
  summaryCard: {
    backgroundColor: Colors.surface, borderRadius: 12, borderWidth: 1, borderColor: Colors.border, padding: 16, gap: 12
  },
  summaryRow: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  summaryLabel: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: Colors.textSecondary, width: 90 },
  summaryValue: { fontFamily: "Inter_400Regular", fontSize: 14, color: Colors.text, flex: 1 },
  summaryNote: { fontFamily: "Inter_400Regular", fontSize: 13, color: Colors.textSecondary, marginTop: 16, lineHeight: 18 },
  submitBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10,
    backgroundColor: Colors.accent, borderRadius: 12, padding: 16, marginTop: 24
  },
  submitBtnText: { fontFamily: "Inter_700Bold", fontSize: 16, color: "#fff" },
  footer: { paddingHorizontal: 16, paddingTop: 10 },
  nextBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    backgroundColor: Colors.accent, borderRadius: 12, padding: 16
  },
  nextBtnText: { fontFamily: "Inter_700Bold", fontSize: 16, color: "#fff" },
  successBox: {
    flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 32, gap: 16
  },
  successTitle: { fontFamily: "Inter_700Bold", fontSize: 24, color: Colors.text },
  successDesc: { fontFamily: "Inter_400Regular", fontSize: 15, color: Colors.textSecondary, textAlign: "center", lineHeight: 22 },
  doneBtn: { backgroundColor: Colors.accent, borderRadius: 12, paddingHorizontal: 24, paddingVertical: 14, marginTop: 8 },
  doneBtnText: { fontFamily: "Inter_700Bold", fontSize: 16, color: "#fff" }
});
