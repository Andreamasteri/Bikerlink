import React, { useState } from "react";
import { View, Text, StyleSheet, FlatList, Pressable, Alert, ActivityIndicator, TextInput } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { apiRequest, queryClient } from "@/lib/query-client";

export default function AdminEasterEggsScreen() {
  const { data, isLoading } = useQuery({ queryKey: ["/api/admin/easter-eggs"] });
  const eggs = (data as any)?.easterEggs || [];
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [radius, setRadius] = useState("50");

  const createEgg = async () => {
    if (!name || !lat || !lng) { Alert.alert("Errore", "Compila tutti i campi obbligatori"); return; }
    try {
      await apiRequest("POST", "/api/admin/easter-eggs", { name, lat: parseFloat(lat), lng: parseFloat(lng), radius: parseInt(radius) || 50, isActive: true });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/easter-eggs"] });
      setShowCreate(false); setName(""); setLat(""); setLng("");
      Alert.alert("Creato!", "Easter egg creato con successo");
    } catch (err) { Alert.alert("Errore", "Errore nella creazione"); }
  };

  const toggleEgg = async (id: string, isActive: boolean) => {
    await apiRequest("PUT", `/api/admin/easter-eggs/${id}`, { isActive: !isActive });
    queryClient.invalidateQueries({ queryKey: ["/api/admin/easter-eggs"] });
  };

  const deleteEgg = (id: string) => {
    Alert.alert("Elimina", "Sei sicuro?", [
      { text: "Annulla", style: "cancel" },
      { text: "Elimina", style: "destructive", onPress: async () => {
        await apiRequest("DELETE", `/api/admin/easter-eggs/${id}`);
        queryClient.invalidateQueries({ queryKey: ["/api/admin/easter-eggs"] });
      }},
    ]);
  };

  return (
    <View style={styles.container}>
      <Pressable style={styles.addBtn} onPress={() => setShowCreate(!showCreate)}>
        <Ionicons name={showCreate ? "close" : "add"} size={20} color={Colors.background} />
        <Text style={styles.addBtnText}>{showCreate ? "Annulla" : "Nuovo Easter Egg"}</Text>
      </Pressable>

      {showCreate && (
        <View style={styles.form}>
          <TextInput style={styles.input} placeholder="Nome" placeholderTextColor={Colors.textSecondary} value={name} onChangeText={setName} />
          <TextInput style={styles.input} placeholder="Latitudine" placeholderTextColor={Colors.textSecondary} value={lat} onChangeText={setLat} keyboardType="numeric" />
          <TextInput style={styles.input} placeholder="Longitudine" placeholderTextColor={Colors.textSecondary} value={lng} onChangeText={setLng} keyboardType="numeric" />
          <TextInput style={styles.input} placeholder="Raggio (m)" placeholderTextColor={Colors.textSecondary} value={radius} onChangeText={setRadius} keyboardType="numeric" />
          <Pressable style={styles.createBtn} onPress={createEgg}>
            <Text style={styles.createBtnText}>Crea</Text>
          </Pressable>
        </View>
      )}

      {isLoading ? (
        <ActivityIndicator size="large" color={Colors.accent} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={eggs}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <Ionicons name="gift" size={24} color={item.isActive ? Colors.accent : Colors.textSecondary} />
              <View style={styles.cardInfo}>
                <Text style={styles.cardTitle}>{item.name}</Text>
                <Text style={styles.cardDetail}>Raggio: {item.radius}m • {item.isActive ? "Attivo" : "Inattivo"}</Text>
              </View>
              <Pressable onPress={() => toggleEgg(item.id, item.isActive)}>
                <Ionicons name={item.isActive ? "pause" : "play"} size={20} color={Colors.accent} />
              </Pressable>
              <Pressable onPress={() => deleteEgg(item.id)}>
                <Ionicons name="trash" size={20} color={Colors.accentRed} />
              </Pressable>
            </View>
          )}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          scrollEnabled={eggs.length > 0}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  addBtn: { flexDirection: "row", backgroundColor: Colors.accent, padding: 12, margin: 16, borderRadius: 10, alignItems: "center", justifyContent: "center", gap: 6 },
  addBtnText: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: Colors.background },
  form: { paddingHorizontal: 16, gap: 8, marginBottom: 16 },
  input: { backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, borderRadius: 10, padding: 12, fontSize: 15, fontFamily: "Inter_400Regular", color: Colors.text },
  createBtn: { backgroundColor: Colors.success, paddingVertical: 12, borderRadius: 10, alignItems: "center" },
  createBtnText: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: "#fff" },
  list: { paddingHorizontal: 16 },
  card: { flexDirection: "row", alignItems: "center", backgroundColor: Colors.surface, borderRadius: 12, padding: 14, marginBottom: 8, gap: 10 },
  cardInfo: { flex: 1 },
  cardTitle: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: Colors.text },
  cardDetail: { fontSize: 13, fontFamily: "Inter_400Regular", color: Colors.textSecondary },
});
