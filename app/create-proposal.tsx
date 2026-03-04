import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Pressable,
  ScrollView,
  Alert,
  ActivityIndicator,
  Platform,
  Modal,
  FlatList,
} from "react-native";
import { useRouter } from "expo-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Colors from "@/constants/colors";
import { useAuth } from "@/lib/auth-context";
import { apiRequest, queryClient } from "@/lib/query-client";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const LAST_DISTANCE_KEY = "bikerlink_last_pickup_distance";

export default function CreateProposalScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();

  const [type, setType] = useState<"proposta" | "richiesta">("proposta");
  const [description, setDescription] = useState("");
  const [departureLocation, setDepartureLocation] = useState("");
  const [departureDate, setDepartureDate] = useState("");
  const [departureTime, setDepartureTime] = useState("");
  const [maxDistance, setMaxDistance] = useState("");
  const [selectedMotoId, setSelectedMotoId] = useState<string | null>(null);
  const [showMotoDropdown, setShowMotoDropdown] = useState(false);

  const isBikerOrCoppia = user?.userType === "biker" || user?.userType === "coppia";

  const { data: garageData } = useQuery({
    queryKey: ["/api/garage"],
    enabled: isBikerOrCoppia,
  });

  const motorcycles = (garageData as any)?.motorcycles || [];

  useEffect(() => {
    const loadLastDistance = async () => {
      try {
        const stored = await AsyncStorage.getItem(LAST_DISTANCE_KEY);
        if (stored) setMaxDistance(stored);
      } catch {}
    };
    loadLastDistance();
  }, []);

  useEffect(() => {
    if (motorcycles.length > 0 && !selectedMotoId) {
      const defaultMoto = motorcycles.find((m: any) => m.isDefault);
      if (defaultMoto) setSelectedMotoId(defaultMoto.id);
      else setSelectedMotoId(motorcycles[0].id);
    }
  }, [motorcycles]);

  const submitMutation = useMutation({
    mutationFn: async () => {
      let dTime: string | undefined;
      if (departureDate && departureTime) {
        dTime = new Date(`${departureDate}T${departureTime}`).toISOString();
      }

      if (maxDistance) {
        await AsyncStorage.setItem(LAST_DISTANCE_KEY, maxDistance);
      }

      await apiRequest("POST", "/api/proposals", {
        type,
        description: description.trim(),
        departureLocation: departureLocation.trim() || undefined,
        departureTime: dTime,
        motorcycleId: isBikerOrCoppia ? selectedMotoId : undefined,
        maxPickupDistanceKm: maxDistance ? parseInt(maxDistance) : undefined,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/proposals"] });
      Alert.alert("Pubblicata!", "La tua proposta è stata pubblicata");
      router.back();
    },
    onError: (err: any) => {
      Alert.alert("Errore", err.message || "Errore nella pubblicazione");
    },
  });

  const handleSubmit = () => {
    if (!description.trim()) {
      Alert.alert("Errore", "Inserisci una descrizione");
      return;
    }
    submitMutation.mutate();
  };

  const selectedMoto = motorcycles.find((m: any) => m.id === selectedMotoId);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, { paddingBottom: Platform.OS === "web" ? 34 : insets.bottom + 16 }]}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.label}>Tipo *</Text>
      <View style={styles.typeRow}>
        <Pressable
          style={[styles.typeBtn, type === "proposta" && styles.typeBtnActive]}
          onPress={() => setType("proposta")}
        >
          <Ionicons name="megaphone" size={18} color={type === "proposta" ? Colors.accent : Colors.textSecondary} />
          <Text style={[styles.typeText, type === "proposta" && styles.typeTextActive]}>Proposta</Text>
        </Pressable>
        <Pressable
          style={[styles.typeBtn, type === "richiesta" && styles.typeBtnActive]}
          onPress={() => setType("richiesta")}
        >
          <Ionicons name="hand-left" size={18} color={type === "richiesta" ? Colors.accent : Colors.textSecondary} />
          <Text style={[styles.typeText, type === "richiesta" && styles.typeTextActive]}>Richiesta</Text>
        </Pressable>
      </View>

      <Text style={styles.label}>Descrizione *</Text>
      <TextInput
        style={[styles.input, styles.multiline]}
        placeholder="Descrivi il tuo giro o la tua richiesta..."
        placeholderTextColor={Colors.textSecondary}
        value={description}
        onChangeText={setDescription}
        multiline
        numberOfLines={4}
        textAlignVertical="top"
      />

      <Text style={styles.label}>Luogo di Partenza</Text>
      <TextInput
        style={styles.input}
        placeholder="es. Piazza Duomo, Milano"
        placeholderTextColor={Colors.textSecondary}
        value={departureLocation}
        onChangeText={setDepartureLocation}
      />

      <Text style={styles.label}>Data Partenza</Text>
      <TextInput
        style={styles.input}
        placeholder="AAAA-MM-GG (es. 2026-03-15)"
        placeholderTextColor={Colors.textSecondary}
        value={departureDate}
        onChangeText={setDepartureDate}
      />

      <Text style={styles.label}>Ora Partenza</Text>
      <TextInput
        style={styles.input}
        placeholder="HH:MM (es. 09:30)"
        placeholderTextColor={Colors.textSecondary}
        value={departureTime}
        onChangeText={setDepartureTime}
      />

      {isBikerOrCoppia && motorcycles.length > 0 && (
        <>
          <Text style={styles.label}>Moto</Text>
          <Pressable style={styles.input} onPress={() => setShowMotoDropdown(true)}>
            <Text style={selectedMoto ? styles.inputText : styles.placeholderText}>
              {selectedMoto ? selectedMoto.name : "Seleziona moto"}
            </Text>
          </Pressable>

          <Modal visible={showMotoDropdown} transparent animationType="fade" onRequestClose={() => setShowMotoDropdown(false)}>
            <Pressable style={styles.dropdownOverlay} onPress={() => setShowMotoDropdown(false)}>
              <View style={styles.dropdownContent}>
                <Text style={styles.dropdownTitle}>Seleziona Moto</Text>
                <FlatList
                  data={motorcycles}
                  keyExtractor={(item: any) => item.id}
                  renderItem={({ item }: { item: any }) => (
                    <Pressable
                      style={styles.dropdownItem}
                      onPress={() => { setSelectedMotoId(item.id); setShowMotoDropdown(false); }}
                    >
                      <View style={styles.dropdownItemInfo}>
                        <Ionicons name="bicycle" size={20} color={item.id === selectedMotoId ? Colors.accent : Colors.textSecondary} />
                        <View>
                          <Text style={[styles.dropdownItemText, item.id === selectedMotoId && { color: Colors.accent }]}>{item.name}</Text>
                          <Text style={styles.dropdownItemSub}>{item.motorcycleType} · {item.ridingStyle}</Text>
                        </View>
                      </View>
                      {item.id === selectedMotoId && <Ionicons name="checkmark" size={20} color={Colors.accent} />}
                    </Pressable>
                  )}
                />
              </View>
            </Pressable>
          </Modal>
        </>
      )}

      <Text style={styles.label}>Distanza Massima Carico (km)</Text>
      <TextInput
        style={styles.input}
        placeholder="es. 30"
        placeholderTextColor={Colors.textSecondary}
        value={maxDistance}
        onChangeText={setMaxDistance}
        keyboardType="numeric"
      />

      <Pressable style={styles.submitBtn} onPress={handleSubmit} disabled={submitMutation.isPending}>
        {submitMutation.isPending ? (
          <ActivityIndicator color={Colors.background} />
        ) : (
          <Text style={styles.submitText}>Pubblica</Text>
        )}
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: 24, gap: 8 },
  label: { fontSize: 14, fontFamily: "Inter_500Medium", color: Colors.text, marginTop: 8 },
  input: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 10,
    padding: 14,
    fontSize: 16,
    fontFamily: "Inter_400Regular",
    color: Colors.text,
  },
  inputText: { fontSize: 16, fontFamily: "Inter_400Regular", color: Colors.text },
  placeholderText: { fontSize: 16, fontFamily: "Inter_400Regular", color: Colors.textSecondary },
  multiline: { minHeight: 100, textAlignVertical: "top" },
  typeRow: { flexDirection: "row", gap: 12 },
  typeBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 10,
    paddingVertical: 12,
  },
  typeBtnActive: { borderColor: Colors.accent, backgroundColor: Colors.accent + "20" },
  typeText: { fontSize: 15, fontFamily: "Inter_500Medium", color: Colors.textSecondary },
  typeTextActive: { color: Colors.accent },
  dropdownOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "center", alignItems: "center" },
  dropdownContent: { backgroundColor: Colors.surface, borderRadius: 16, padding: 16, width: 300, maxHeight: 400 },
  dropdownTitle: { fontSize: 18, fontFamily: "Inter_600SemiBold", color: Colors.text, marginBottom: 12 },
  dropdownItem: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: Colors.border },
  dropdownItemInfo: { flexDirection: "row", alignItems: "center", gap: 12, flex: 1 },
  dropdownItemText: { fontSize: 16, fontFamily: "Inter_500Medium", color: Colors.text },
  dropdownItemSub: { fontSize: 12, fontFamily: "Inter_400Regular", color: Colors.textSecondary },
  submitBtn: { backgroundColor: Colors.accent, paddingVertical: 16, borderRadius: 10, alignItems: "center", marginTop: 20 },
  submitText: { fontSize: 16, fontFamily: "Inter_600SemiBold", color: Colors.background },
});
