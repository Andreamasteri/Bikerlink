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
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import Colors from "@/constants/colors";
import { useAuth } from "@/lib/auth-context";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient, getApiUrl } from "@/lib/query-client";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useSetting } from "@/lib/settings-context";
import * as Location from "expo-location";

const sosLaunchIcon = require("@/assets/images/sos-launch-icon.png");
const sosAcceptIcon = require("@/assets/images/sos-accept-icon.png");

export default function ReadyToRideScreen() {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const sosEnabled = useSetting("sosEnabled");

  const [showSosModal, setShowSosModal] = useState(false);
  const [sosReason, setSosReason] = useState("");
  const [sosRadiusKm, setSosRadiusKm] = useState(10);
  const [showSosListModal, setShowSosListModal] = useState(false);
  const [location, setLocation] = useState<{ latitude: number; longitude: number } | null>(null);

  useEffect(() => {
    (async () => {
      try {
        if (Platform.OS === "web") {
          if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
              (pos) => setLocation({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
              () => {},
              { timeout: 5000 }
            );
          }
        } else {
          const { status } = await Location.requestForegroundPermissionsAsync();
          if (status === "granted") {
            const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
            setLocation({ latitude: loc.coords.latitude, longitude: loc.coords.longitude });
          }
        }
      } catch {}
    })();
  }, []);

  const { data, isLoading } = useQuery({
    queryKey: ["/api/users/profile"],
  });

  const isAvailable = (data as any)?.isAvailable || false;

  const toggleMutation = useMutation({
    mutationFn: async (newVal: boolean) => {
      await apiRequest("PUT", "/api/users/profile/dynamic", {
        isAvailable: newVal,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users/profile"] });
      queryClient.invalidateQueries({ queryKey: ["/api/users/biker-available-count"] });
      queryClient.invalidateQueries({ queryKey: ["/api/users/zavorrine-available-count"] });
      queryClient.invalidateQueries({ queryKey: ["/api/users/online-count"] });
      queryClient.invalidateQueries({ queryKey: ["/api/users/biker-available-list"] });
      queryClient.invalidateQueries({ queryKey: ["/api/users/zavorrine-available-list"] });
      queryClient.invalidateQueries({ queryKey: ["/api/users/online-list"] });
      queryClient.invalidateQueries({ queryKey: ["/api/users/nearby"] });
    },
  });

  const handleToggle = () => {
    toggleMutation.mutate(!isAvailable);
  };

  const mySosQuery = useQuery<any>({
    queryKey: ["/api/sos/my"],
    staleTime: 10000,
    refetchInterval: 10000,
    enabled: !!user && sosEnabled,
  });

  const activeSosQuery = useQuery<any[]>({
    queryKey: ["/api/sos/active"],
    staleTime: 15000,
    refetchInterval: 15000,
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

  const acceptSosMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("PUT", `/api/sos/${id}/accept`);
      return res.json();
    },
    onSuccess: (d: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/sos/my"] });
      queryClient.invalidateQueries({ queryKey: ["/api/sos/active"] });
      setShowSosListModal(false);
      if (d.conversationId) {
        router.push(`/chat/${d.conversationId}` as any);
      }
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
          disabled={toggleMutation.isPending}
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
              <Image source={sosLaunchIcon} style={[styles.sosIcon, mySosQuery.data ? styles.sosIconActive : null]} resizeMode="contain" />
              <Text style={[styles.sosLabel, mySosQuery.data ? styles.sosLabelActive : null]}>
                {mySosQuery.data ? "SOS ATTIVO" : "SOS"}
              </Text>
            </Pressable>

            <Pressable
              style={styles.sosBtn}
              onPress={() => setShowSosListModal(true)}
            >
              <View style={{ position: "relative" }}>
                <Image source={sosAcceptIcon} style={styles.sosIcon} resizeMode="contain" />
                {(activeSosQuery.data || []).filter((r: any) => r.requesterId !== user?.id).length > 0 && (
                  <View style={styles.sosBadge}>
                    <Text style={styles.sosBadgeText}>
                      {(activeSosQuery.data || []).filter((r: any) => r.requesterId !== user?.id).length}
                    </Text>
                  </View>
                )}
              </View>
              <Text style={styles.sosLabel}>ACCOGLI SOS</Text>
            </Pressable>
          </View>
        )}
      </View>

      <Modal visible={showSosModal} transparent animationType="fade" onRequestClose={() => setShowSosModal(false)}>
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
              {[5, 10, 20, 50].map((km) => (
                <Pressable
                  key={km}
                  style={[styles.sosRadiusChip, sosRadiusKm === km && styles.sosRadiusChipActive]}
                  onPress={() => setSosRadiusKm(km)}
                >
                  <Text style={[styles.sosRadiusChipText, sosRadiusKm === km && styles.sosRadiusChipTextActive]}>
                    {km} km
                  </Text>
                </Pressable>
              ))}
            </View>
            <Pressable
              style={[styles.sosSubmitBtn, (!sosReason.trim() || createSosMutation.isPending) && { opacity: 0.5 }]}
              disabled={!sosReason.trim() || createSosMutation.isPending}
              onPress={() => {
                if (!location) {
                  Alert.alert("Errore", "Posizione GPS non disponibile");
                  return;
                }
                createSosMutation.mutate({
                  reason: sosReason.trim(),
                  latitude: location.latitude,
                  longitude: location.longitude,
                  radiusKm: sosRadiusKm,
                });
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
      </Modal>

      <Modal visible={showSosListModal} transparent animationType="slide" onRequestClose={() => setShowSosListModal(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setShowSosListModal(false)}>
          <Pressable style={styles.listSheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.handle} />
            <View style={styles.listSheetHeader}>
              <Image source={sosAcceptIcon} style={{ width: 28, height: 28 }} resizeMode="contain" />
              <Text style={styles.listSheetTitle}>Richieste SOS attive</Text>
              <Pressable onPress={() => setShowSosListModal(false)}>
                <Ionicons name="close" size={24} color={Colors.textSecondary} />
              </Pressable>
            </View>
            {activeSosQuery.isLoading ? (
              <ActivityIndicator size="large" color="#FF6600" style={{ marginVertical: 40 }} />
            ) : (activeSosQuery.data || []).filter((r: any) => r.requesterId !== user?.id).length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="checkmark-circle-outline" size={32} color={Colors.textSecondary} />
                <Text style={styles.emptyText}>Nessuna richiesta SOS attiva</Text>
              </View>
            ) : (
              <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 500 }}>
                {(activeSosQuery.data || []).filter((r: any) => r.requesterId !== user?.id).map((r: any) => (
                  <View key={r.id} style={styles.sosListCard}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.sosListName}>{r.requesterNickname}</Text>
                      <Text style={styles.sosListReason}>{r.reason}</Text>
                      <Text style={styles.sosListTime}>
                        {new Date(r.createdAt).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}
                        {r.radiusKm ? `  •  ${r.radiusKm} km` : ""}
                      </Text>
                    </View>
                    <Pressable
                      style={styles.sosAcceptBtn}
                      onPress={() => {
                        Alert.alert(
                          "Accogli SOS",
                          `Vuoi aiutare ${r.requesterNickname}?\nMotivo: ${r.reason}`,
                          [
                            { text: "Annulla", style: "cancel" },
                            { text: "Accogli", onPress: () => acceptSosMutation.mutate(r.id) },
                          ]
                        );
                      }}
                      disabled={acceptSosMutation.isPending}
                    >
                      {acceptSosMutation.isPending ? (
                        <ActivityIndicator color={Colors.background} size="small" />
                      ) : (
                        <Text style={styles.sosAcceptText}>Accogli</Text>
                      )}
                    </Pressable>
                  </View>
                ))}
              </ScrollView>
            )}
          </Pressable>
        </Pressable>
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
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
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
    gap: 40,
    marginTop: 36,
    paddingHorizontal: 16,
  },
  sosBtn: {
    alignItems: "center",
    gap: 6,
  },
  sosBtnActive: {
    opacity: 1,
  },
  sosIcon: {
    width: 72,
    height: 56,
    tintColor: "#FF6600",
  },
  sosIconActive: {
    tintColor: "#FF3300",
  },
  sosLabel: {
    fontSize: 12,
    fontFamily: "Inter_700Bold",
    color: "#FF6600",
    textAlign: "center" as const,
  },
  sosLabelActive: {
    color: "#FF3300",
  },
  sosBadge: {
    position: "absolute" as const,
    top: -4,
    right: -8,
    backgroundColor: "#FF3300",
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    paddingHorizontal: 4,
  },
  sosBadgeText: {
    fontSize: 11,
    fontFamily: "Inter_700Bold",
    color: "#fff",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "flex-end",
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
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 32,
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
  listSheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 32,
    maxHeight: "80%",
  },
  listSheetHeader: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 8,
    marginBottom: 16,
  },
  listSheetTitle: {
    flex: 1,
    fontSize: 18,
    fontFamily: "Inter_700Bold",
    color: Colors.text,
  },
  emptyState: {
    alignItems: "center" as const,
    paddingVertical: 40,
    gap: 8,
  },
  emptyText: {
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
  },
  sosListCard: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    backgroundColor: Colors.background,
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    gap: 12,
    borderLeftWidth: 3,
    borderLeftColor: "#FF6600",
  },
  sosListName: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: Colors.text,
  },
  sosListReason: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: "#FF6600",
    marginTop: 2,
  },
  sosListTime: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
    marginTop: 2,
  },
  sosAcceptBtn: {
    backgroundColor: "#FF6600",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
  },
  sosAcceptText: {
    fontSize: 14,
    fontFamily: "Inter_700Bold",
    color: Colors.background,
  },
});
