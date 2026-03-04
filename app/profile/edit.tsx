import React, { useState, useEffect } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, Alert, ScrollView, Platform, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { useAuth } from "@/lib/auth-context";
import { apiRequest, queryClient } from "@/lib/query-client";
import Colors from "@/constants/colors";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const MOTORCYCLE_TYPES = ["sportiva", "supersportiva", "custom", "harley", "touring", "naked", "enduro", "altro"];
const RIDING_STYLES = ["passeggio", "tranquilla", "allegra", "mozzafiato"];

export default function EditProfileScreen() {
  const router = useRouter();
  const { user, profile, refreshUser } = useAuth();
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(false);
  const [nickname, setNickname] = useState(user?.nickname || "");
  const [region, setRegion] = useState(user?.region || "");
  const [motorcycleType, setMotorcycleType] = useState(profile?.motorcycleType || "");
  const [ridingStyle, setRidingStyle] = useState(profile?.ridingStyle || "");
  const [isAvailable, setIsAvailable] = useState(profile?.isAvailable || false);
  const [maxPickupDistanceKm, setMaxPickupDistanceKm] = useState(String(profile?.maxPickupDistanceKm || ""));

  const isBikerOrCoppia = user?.userType === "biker" || user?.userType === "coppia";

  const handleSave = async () => {
    setLoading(true);
    try {
      await apiRequest("PUT", "/api/users/profile", { nickname, region });

      if (isBikerOrCoppia) {
        await apiRequest("PUT", "/api/users/profile/dynamic", {
          motorcycleType: motorcycleType || null,
          ridingStyle: ridingStyle || null,
          isAvailable,
          maxPickupDistanceKm: maxPickupDistanceKm ? parseInt(maxPickupDistanceKm) : null,
        });
      }

      await refreshUser();
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      Alert.alert("Salvato!", "Profilo aggiornato con successo");
      router.back();
    } catch (err) {
      Alert.alert("Errore", "Errore nell'aggiornamento del profilo");
    } finally {
      setLoading(false);
    }
  };

  const OptionChip = ({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) => (
    <Pressable style={[styles.chip, selected && styles.chipActive]} onPress={onPress}>
      <Text style={[styles.chipText, selected && styles.chipTextActive]}>{label}</Text>
    </Pressable>
  );

  return (
    <ScrollView style={styles.container} contentContainerStyle={[styles.content, { paddingBottom: Platform.OS === "web" ? 34 : insets.bottom + 16 }]} keyboardShouldPersistTaps="handled">
      <Text style={styles.label}>Nickname</Text>
      <TextInput style={styles.input} value={nickname} onChangeText={setNickname} placeholderTextColor={Colors.textSecondary} />

      <Text style={styles.label}>Regione</Text>
      <TextInput style={styles.input} value={region} onChangeText={setRegion} placeholderTextColor={Colors.textSecondary} />

      {isBikerOrCoppia && (
        <>
          <Text style={styles.sectionTitle}>Moto & Stile</Text>

          <Text style={styles.label}>Tipo Moto</Text>
          <View style={styles.chipRow}>
            {MOTORCYCLE_TYPES.map(mt => (
              <OptionChip key={mt} label={mt.charAt(0).toUpperCase() + mt.slice(1)} selected={motorcycleType === mt} onPress={() => setMotorcycleType(mt)} />
            ))}
          </View>

          <Text style={styles.label}>Stile di Guida</Text>
          <View style={styles.chipRow}>
            {RIDING_STYLES.map(rs => (
              <OptionChip key={rs} label={rs.charAt(0).toUpperCase() + rs.slice(1)} selected={ridingStyle === rs} onPress={() => setRidingStyle(rs)} />
            ))}
          </View>

          <Text style={styles.label}>Distanza max raccolta (km)</Text>
          <TextInput style={styles.input} value={maxPickupDistanceKm} onChangeText={setMaxPickupDistanceKm} keyboardType="numeric" placeholder="es. 30" placeholderTextColor={Colors.textSecondary} />

          <Pressable style={styles.toggleRow} onPress={() => setIsAvailable(!isAvailable)}>
            <Text style={styles.label}>Disponibile per giri</Text>
            <View style={[styles.toggle, isAvailable && styles.toggleActive]}>
              <View style={[styles.toggleCircle, isAvailable && styles.toggleCircleActive]} />
            </View>
          </Pressable>
        </>
      )}

      <Pressable style={styles.button} onPress={handleSave} disabled={loading}>
        {loading ? <ActivityIndicator color={Colors.background} /> : <Text style={styles.buttonText}>Salva</Text>}
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: 24, gap: 12 },
  sectionTitle: { fontSize: 20, fontFamily: "Inter_700Bold", color: Colors.accent, marginTop: 12 },
  label: { fontSize: 14, fontFamily: "Inter_500Medium", color: Colors.text },
  input: { backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, borderRadius: 10, padding: 14, fontSize: 16, fontFamily: "Inter_400Regular", color: Colors.text },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, borderRadius: 20, paddingVertical: 8, paddingHorizontal: 14 },
  chipActive: { borderColor: Colors.accent, backgroundColor: Colors.accent + "20" },
  chipText: { fontSize: 14, fontFamily: "Inter_500Medium", color: Colors.textSecondary },
  chipTextActive: { color: Colors.accent },
  toggleRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  toggle: { width: 50, height: 28, borderRadius: 14, backgroundColor: Colors.border, justifyContent: "center", paddingHorizontal: 2 },
  toggleActive: { backgroundColor: Colors.accent },
  toggleCircle: { width: 24, height: 24, borderRadius: 12, backgroundColor: "#fff" },
  toggleCircleActive: { alignSelf: "flex-end" },
  button: { backgroundColor: Colors.accent, paddingVertical: 16, borderRadius: 10, alignItems: "center", marginTop: 16 },
  buttonText: { fontSize: 16, fontFamily: "Inter_600SemiBold", color: Colors.background },
});
