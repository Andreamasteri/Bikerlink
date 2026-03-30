import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Platform,
  ActivityIndicator,
  ScrollView,
  Modal,
  Alert,
  TextInput,
  Image,
  KeyboardAvoidingView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import Colors from "@/constants/colors";
import { useAuth } from "@/lib/auth-context";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient, getApiUrl } from "@/lib/query-client";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useSetting } from "@/lib/settings-context";
import { useT } from "@/lib/language-context";
import * as Location from "expo-location";

const sosLaunchIcon = require("@/assets/images/sos-launch-icon.png");

export default function ReadyToRideScreen() {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const sosEnabled = useSetting("sosEnabled");
  const t = useT();

  const [showSosModal, setShowSosModal] = useState(false);
  const [sosReason, setSosReason] = useState("");
  const [sosRadiusKm, setSosRadiusKm] = useState(10);
  const [customRadius, setCustomRadius] = useState("");
  const [location, setLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const toastTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function initLocation() {
      try {
        if (Platform.OS === "web") {
          if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
              (pos) => {
                if (!cancelled) setLocation({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
              },
              () => {},
              { timeout: 5000 }
            );
          }
        } else {
          const { status } = await Location.requestForegroundPermissionsAsync();
          if (status === "granted" && !cancelled) {
            const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
            if (!cancelled) setLocation({ latitude: loc.coords.latitude, longitude: loc.coords.longitude });
          }
        }
      } catch (err) {
        console.warn("[ready] Location init fallita:", err);
      }
    }
    initLocation();
    return () => { cancelled = true; };
  }, []);

  const { data, isLoading } = useQuery({
    queryKey: ["/api/users/profile"],
  });

  const { data: ghostSettingData } = useQuery<{ enabled: boolean }>({
    queryKey: ["/api/settings/ghost-mode-enabled"],
  });
  const ghostModeFeatureEnabled = ghostSettingData?.enabled === true;

  const isAvailable = (data as any)?.isAvailable || false;
  const isGhostMode = (data as any)?.ghostMode || false;

  const invalidateOnlineQueries = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/users/profile"] });
    queryClient.invalidateQueries({ queryKey: ["/api/users/biker-available-count"] });
    queryClient.invalidateQueries({ queryKey: ["/api/users/zavorrine-available-count"] });
    queryClient.invalidateQueries({ queryKey: ["/api/users/online-count"] });
    queryClient.invalidateQueries({ queryKey: ["/api/users/biker-available-list"] });
    queryClient.invalidateQueries({ queryKey: ["/api/users/zavorrine-available-list"] });
    queryClient.invalidateQueries({ queryKey: ["/api/users/online-list"] });
    queryClient.invalidateQueries({ queryKey: ["/api/users/nearby"] });
  };

  const showToast = (msg: string) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToastMsg(msg);
    toastTimerRef.current = setTimeout(() => setToastMsg(null), 2500);
  };

  const toggleMutation = useMutation({
    mutationFn: async (newVal: boolean) => {
      await apiRequest("PUT", "/api/users/profile/dynamic", {
        isAvailable: newVal,
      });
      return newVal;
    },
    onSuccess: (_data: boolean, variables: boolean) => {
      invalidateOnlineQueries();
      showToast(variables ? "Sei disponibile! Appari sulla mappa" : "Non sei più disponibile");
    },
    onError: () => {
      Alert.alert("Errore", "Impossibile aggiornare la disponibilità. Verifica la connessione.");
    },
  });

  const ghostMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      await apiRequest("PUT", "/api/users/me/ghost-mode", { enabled });
    },
    onSuccess: invalidateOnlineQueries,
  });

  const handleToggle = () => {
    toggleMutation.mutate(!isAvailable);
  };

  const handleGhostToggle = () => {
    ghostMutation.mutate(!isGhostMode);
  };

  const mySosQuery = useQuery<any>({
    queryKey: ["/api/sos/my"],
    staleTime: 10000,
    refetchInterval: 10000,
    enabled: !!user && sosEnabled,
  });

  const createSosMutation = useMutation({
    mutationFn: async (d: { reason: string; latitude: number; longitude: number; radiusKm: number }) => {
      const res = await apiRequest("POST", "/api/sos", d);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sos/my"] });
      queryClient.invalidateQueries({ queryKey: ["/api/sos/active"] });
      setShowSosModal(false);
      setSosReason("");
      setSosRadiusKm(10);
      setCustomRadius("");
    },
    onError: (error: Error) => {
      Alert.alert("Errore", error.message);
    },
  });

  const cancelSosMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("PUT", `/api/sos/${id}/cancel`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sos/my"] });
      queryClient.invalidateQueries({ queryKey: ["/api/sos/active"] });
    },
    onError: (error: Error) => {
      Alert.alert("Errore", error.message);
    },
  });


  if (isLoading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color={Colors.accent} />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[
        styles.scrollContent,
        {
          paddingTop: Platform.OS === "web" ? 67 : 0,
          paddingBottom: Platform.OS === "web" ? 34 : insets.bottom + 16,
        },
      ]}
    >
      <View style={styles.content}>
        <Ionicons
          name="bicycle"
          size={64}
          color={isAvailable ? Colors.success : Colors.accentRed}
        />

        <Text style={styles.statusText}>
          {isAvailable ? "Sei disponibile!" : "Non disponibile"}
        </Text>
        <Text style={styles.statusSubtext}>
          {isAvailable
            ? "Fai sapere a tutti che sei online e pronto a farti un giro!"
            : "Tocca il pulsante per renderti disponibile"}
        </Text>

        <Pressable
          style={[
            styles.toggleBtn,
            { backgroundColor: isAvailable ? Colors.success : Colors.accentRed },
          ]}
          onPress={handleToggle}
          disabled={toggleMutation.isPending || ghostMutation.isPending}
        >
          {toggleMutation.isPending ? (
            <ActivityIndicator color="#fff" size="large" />
          ) : (
            <Ionicons
              name={isAvailable ? "checkmark-circle" : "close-circle"}
              size={48}
              color="#fff"
            />
          )}
        </Pressable>

        {toastMsg !== null && (
          <View style={styles.toastContainer}>
            <Text style={styles.toastText}>{toastMsg}</Text>
          </View>
        )}

        {ghostModeFeatureEnabled && (
          <View style={styles.ghostBlock}>
            <Pressable
              style={[
                styles.ghostBtn,
                isGhostMode && styles.ghostBtnActive,
              ]}
              onPress={handleGhostToggle}
              disabled={ghostMutation.isPending || toggleMutation.isPending}
            >
              {ghostMutation.isPending ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Ionicons
                  name={isGhostMode ? "eye-off" : "eye"}
                  size={20}
                  color="#fff"
                />
              )}
              <Text style={styles.ghostBtnText}>{t("ride.ghostMode")}</Text>
            </Pressable>
            <Text style={styles.ghostDesc}>{t("ride.ghostModeDesc")}</Text>
          </View>
        )}

        <Pressable
          style={styles.cronoBtn}
          onPress={() => router.push("/tracking" as any)}
        >
          <Ionicons name="navigate" size={20} color={Colors.accent} />
          <Text style={styles.cronoBtnText}>Registra Giro e Performance</Text>
        </Pressable>

        <Pressable
          style={styles.cronoBtn}
          onPress={() => router.push("/routes" as any)}
        >
          <Ionicons name="map" size={20} color={Colors.accent} />
          <Text style={styles.cronoBtnText}>I Miei Percorsi</Text>
        </Pressable>

        {sosEnabled && (
          <View style={styles.sosRow}>
            <Pressable
              style={[styles.sosBtn, mySosQuery.data ? styles.sosBtnActive : null]}
              onPress={() => {
                if (mySosQuery.data) {
                  Alert.alert(
                    "Annulla SOS",
                    "Vuoi annullare la tua richiesta SOS?",
                    [
                      { text: "No", style: "cancel" },
                      { text: "Sì, annulla", style: "destructive", onPress: () => cancelSosMutation.mutate(mySosQuery.data.id) },
                    ]
                  );
                } else {
                  setShowSosModal(true);
                }
              }}
            >
              <Image source={sosLaunchIcon} style={[styles.sosIconLeft, mySosQuery.data ? styles.sosIconLeftActive : null]} resizeMode="contain" />
              <Text style={[styles.sosLabelLeft, mySosQuery.data ? styles.sosLabelLeftActive : null]}>
                {mySosQuery.data ? "SOS ATTIVO" : "LANCIA SOS"}
              </Text>
            </Pressable>

          </View>
        )}

      </View>

      <Modal visible={showSosModal} transparent animationType="fade" onRequestClose={() => setShowSosModal(false)}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={{ flex: 1 }}
        >
          <Pressable style={styles.modalOverlay} onPress={() => setShowSosModal(false)}>
          <Pressable style={styles.sosSheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.handle} />
            <View style={{ alignItems: "center", marginBottom: 16 }}>
              <Image source={sosLaunchIcon} style={{ width: 80, height: 60 }} resizeMode="contain" />
              <Text style={styles.sosSheetTitle}>Richiesta SOS</Text>
              <Text style={styles.sosSheetSubtitle}>Descrivi il problema</Text>
            </View>
            <TextInput
              style={styles.sosInput}
              placeholder="Foratura, batteria, sequestro mezzo..."
              placeholderTextColor={Colors.textSecondary + "80"}
              value={sosReason}
              onChangeText={setSosReason}
              multiline
              maxLength={200}
            />
            <Text style={styles.sosRadiusLabel}>Raggio d'azione</Text>
            <View style={styles.sosRadiusRow}>
              {[10, 20, 50].map((km) => (
                <Pressable
                  key={km}
                  style={[styles.sosRadiusChip, sosRadiusKm === km && !customRadius && styles.sosRadiusChipActive]}
                  onPress={() => { setSosRadiusKm(km); setCustomRadius(""); }}
                >
                  <Text style={[styles.sosRadiusChipText, sosRadiusKm === km && !customRadius && styles.sosRadiusChipTextActive]}>
                    {km} km
                  </Text>
                </Pressable>
              ))}
              <TextInput
                style={[styles.sosRadiusCustom, customRadius ? styles.sosRadiusCustomActive : null]}
                placeholder="Altro"
                placeholderTextColor={Colors.textSecondary + "80"}
                value={customRadius}
                onChangeText={(text) => {
                  const num = text.replace(/[^0-9]/g, "");
                  setCustomRadius(num);
                  if (num) {
                    setSosRadiusKm(parseInt(num, 10));
                  } else {
                    setSosRadiusKm(10);
                  }
                }}
                keyboardType="numeric"
                maxLength={4}
              />
            </View>
            <Pressable
              style={[styles.sosSubmitBtn, (!sosReason.trim() || createSosMutation.isPending) && { opacity: 0.5 }]}
              disabled={!sosReason.trim() || createSosMutation.isPending}
              onPress={() => {
                const finalRadius = customRadius ? parseInt(customRadius, 10) || 10 : sosRadiusKm;
                const sendSos = (coords: { latitude: number; longitude: number }) => {
                  createSosMutation.mutate({
                    reason: sosReason.trim(),
                    latitude: coords.latitude,
                    longitude: coords.longitude,
                    radiusKm: finalRadius,
                  });
                };
                if (location) {
                  sendSos(location);
                } else {
                  Alert.alert(
                    "GPS non disponibile",
                    "La posizione verrà impostata approssimativamente al centro Italia. Continuare?",
                    [
                      { text: "Annulla", style: "cancel" },
                      { text: "Invia comunque", onPress: () => sendSos({ latitude: 42.5, longitude: 12.5 }) },
                    ]
                  );
                }
              }}
            >
              {createSosMutation.isPending ? (
                <ActivityIndicator color={Colors.background} />
              ) : (
                <Text style={styles.sosSubmitText}>Invia SOS</Text>
              )}
            </Pressable>
          </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>

    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  content: {
    alignItems: "center",
    padding: 24,
    gap: 8,
  },
  statusText: {
    fontSize: 28,
    fontFamily: "Inter_700Bold",
    color: Colors.text,
    textAlign: "center",
    marginTop: 4,
  },
  statusSubtext: {
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
    textAlign: "center",
    maxWidth: 280,
  },
  toggleBtn: {
    width: 140,
    height: 140,
    borderRadius: 70,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 16,
    elevation: 6,
    ...Platform.select({
      ios: { shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8 },
      android: {},
      web: { boxShadow: "0px 4px 8px rgba(0,0,0,0.3)" },
    }),
  },
  ghostBlock: {
    alignItems: "center",
    marginTop: 18,
    gap: 6,
  },
  ghostBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#3A3A3A",
    paddingHorizontal: 22,
    paddingVertical: 10,
    borderRadius: 24,
  },
  ghostBtnActive: {
    backgroundColor: "#222222",
    borderWidth: 1.5,
    borderColor: "#888",
  },
  toastContainer: {
    marginTop: 16,
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: Colors.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  toastText: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: Colors.text,
    textAlign: "center" as const,
  },
  ghostBtnText: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: "#fff",
  },
  ghostDesc: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: Colors.accentRed,
    textAlign: "center",
    maxWidth: 260,
  },
  cronoBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 32,
    backgroundColor: Colors.surface,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: Colors.accent + "40",
  },
  cronoBtnText: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    color: Colors.accent,
  },
  sosRow: {
    flexDirection: "row",
    justifyContent: "center",
    marginTop: 20,
    paddingHorizontal: 16,
  },
  sosBtn: {
    alignItems: "center",
    gap: 10,
  },
  sosBtnActive: {
    opacity: 1,
  },
  sosIconLeft: {
    width: 187,
    height: 146,
    tintColor: "#CC0000",
  },
  sosIconLeftActive: {
    tintColor: "#990000",
  },
  sosLabelLeft: {
    fontSize: 21,
    fontFamily: "Inter_700Bold",
    color: "#CC0000",
    textAlign: "center" as const,
  },
  sosLabelLeftActive: {
    color: "#990000",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "flex-start",
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.border,
    alignSelf: "center",
    marginBottom: 16,
  },
  sosSheet: {
    backgroundColor: Colors.surface,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
    padding: 20,
    paddingBottom: 24,
  },
  sosSheetTitle: {
    fontSize: 20,
    fontFamily: "Inter_700Bold",
    color: "#FF6600",
    marginTop: 8,
  },
  sosSheetSubtitle: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
    marginTop: 4,
  },
  sosInput: {
    backgroundColor: Colors.background,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 14,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    color: Colors.text,
    minHeight: 80,
    textAlignVertical: "top" as const,
    marginBottom: 16,
  },
  sosRadiusLabel: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: Colors.text,
    marginTop: 12,
    marginBottom: 8,
  },
  sosRadiusRow: {
    flexDirection: "row" as const,
    gap: 8,
    marginBottom: 16,
  },
  sosRadiusChip: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: Colors.background,
    borderWidth: 1.5,
    borderColor: Colors.border,
    alignItems: "center" as const,
  },
  sosRadiusChipActive: {
    backgroundColor: "#FF6600",
    borderColor: "#FF6600",
  },
  sosRadiusChipText: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: Colors.textSecondary,
  },
  sosRadiusChipTextActive: {
    color: Colors.background,
  },
  sosRadiusCustom: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 10,
    backgroundColor: Colors.background,
    borderWidth: 1.5,
    borderColor: Colors.border,
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: Colors.text,
    textAlign: "center" as const,
  },
  sosRadiusCustomActive: {
    backgroundColor: "#FF6600",
    borderColor: "#FF6600",
    color: Colors.background,
  },
  sosSubmitBtn: {
    backgroundColor: "#FF6600",
    padding: 16,
    borderRadius: 12,
    alignItems: "center" as const,
  },
  sosSubmitText: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
    color: Colors.background,
  },
});
