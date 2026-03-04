import React, { useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, Alert, ScrollView, ActivityIndicator, Platform } from "react-native";
import { useRouter } from "expo-router";
import { apiRequest, queryClient } from "@/lib/query-client";
import Colors from "@/constants/colors";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function CreateProposalScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [type, setType] = useState<"proposta" | "richiesta">("proposta");
  const [description, setDescription] = useState("");
  const [departureLocation, setDepartureLocation] = useState("");
  const [loading, setLoading] = useState(false);

  const handleCreate = async () => {
    if (!description.trim()) {
      Alert.alert("Errore", "Inserisci una descrizione");
      return;
    }

    setLoading(true);
    try {
      await apiRequest("POST", "/api/proposals", {
        type,
        description: description.trim(),
        departureLocation: departureLocation.trim() || undefined,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/proposals"] });
      Alert.alert("Creata!", "La tua proposta è stata pubblicata");
      router.back();
    } catch (err) {
      Alert.alert("Errore", "Errore nella creazione della proposta");
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={[styles.content, { paddingBottom: Platform.OS === "web" ? 34 : insets.bottom + 16 }]} keyboardShouldPersistTaps="handled">
      <Text style={styles.label}>Tipo</Text>
      <View style={styles.typeRow}>
        <Pressable style={[styles.typeBtn, type === "proposta" && styles.typeBtnActive]} onPress={() => setType("proposta")}>
          <Text style={[styles.typeText, type === "proposta" && styles.typeTextActive]}>Proposta (offro un giro)</Text>
        </Pressable>
        <Pressable style={[styles.typeBtn, type === "richiesta" && styles.typeBtnActive]} onPress={() => setType("richiesta")}>
          <Text style={[styles.typeText, type === "richiesta" && styles.typeTextActive]}>Richiesta (cerco un passaggio)</Text>
        </Pressable>
      </View>

      <Text style={styles.label}>Descrizione *</Text>
      <TextInput style={[styles.input, styles.textArea]} placeholder="Descrivi il tuo giro o la tua richiesta..." placeholderTextColor={Colors.textSecondary} value={description} onChangeText={setDescription} multiline numberOfLines={4} textAlignVertical="top" />

      <Text style={styles.label}>Luogo di partenza</Text>
      <TextInput style={styles.input} placeholder="es. Piazza Duomo, Milano" placeholderTextColor={Colors.textSecondary} value={departureLocation} onChangeText={setDepartureLocation} />

      <Pressable style={styles.button} onPress={handleCreate} disabled={loading}>
        {loading ? <ActivityIndicator color={Colors.background} /> : <Text style={styles.buttonText}>Pubblica</Text>}
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: 24, gap: 12 },
  label: { fontSize: 14, fontFamily: "Inter_500Medium", color: Colors.text },
  typeRow: { gap: 8 },
  typeBtn: { backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, borderRadius: 10, padding: 14 },
  typeBtnActive: { borderColor: Colors.accent, backgroundColor: Colors.accent + "20" },
  typeText: { fontSize: 15, fontFamily: "Inter_500Medium", color: Colors.textSecondary },
  typeTextActive: { color: Colors.accent },
  input: { backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, borderRadius: 10, padding: 14, fontSize: 16, fontFamily: "Inter_400Regular", color: Colors.text },
  textArea: { minHeight: 100 },
  button: { backgroundColor: Colors.accent, paddingVertical: 16, borderRadius: 10, alignItems: "center", marginTop: 8 },
  buttonText: { fontSize: 16, fontFamily: "Inter_600SemiBold", color: Colors.background },
});
