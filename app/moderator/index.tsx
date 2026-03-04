import React from "react";
import { View, Text, StyleSheet, FlatList, Pressable, Alert, ActivityIndicator } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { apiRequest, queryClient } from "@/lib/query-client";

export default function ModeratorScreen() {
  const { data, isLoading } = useQuery({ queryKey: ["/api/moderator/photos"] });
  const photos = (data as any)?.photos || [];

  const removePhoto = (id: string) => {
    Alert.alert("Rimuovi Foto", "Sei sicuro di voler rimuovere questa foto?", [
      { text: "Annulla", style: "cancel" },
      {
        text: "Rimuovi",
        style: "destructive",
        onPress: async () => {
          try {
            await apiRequest("DELETE", `/api/moderator/photos/${id}`, { reason: "Rimossa dal moderatore" });
            queryClient.invalidateQueries({ queryKey: ["/api/moderator/photos"] });
            Alert.alert("Fatto", "Foto rimossa");
          } catch (err) {
            Alert.alert("Errore", "Errore nella rimozione");
          }
        },
      },
    ]);
  };

  const warnUser = async (id: string) => {
    try {
      await apiRequest("POST", `/api/moderator/photos/${id}/warn`, { reason: "Foto non conforme alle regole" });
      Alert.alert("Fatto", "Avvertimento inviato");
    } catch (err) {
      Alert.alert("Errore", "Errore nell'invio avvertimento");
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.infoBar}>
        <Ionicons name="shield-checkmark" size={16} color={Colors.accent} />
        <Text style={styles.infoText}>Gestisci le foto del concorso. Le azioni vengono registrate.</Text>
      </View>

      {isLoading ? (
        <ActivityIndicator size="large" color={Colors.accent} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={photos}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <Ionicons name="person-circle" size={28} color={item.user?.sex === "male" ? Colors.maleIcon : Colors.femaleIcon} />
                <View style={styles.cardInfo}>
                  <Text style={styles.nickname}>{item.user?.nickname}</Text>
                  <Text style={styles.detail}>Segnalazioni: {item.reportCount || 0}</Text>
                </View>
                {(item.reportCount || 0) > 0 && (
                  <View style={styles.reportBadge}>
                    <Ionicons name="warning" size={14} color={Colors.warning} />
                  </View>
                )}
              </View>
              <View style={styles.photoPlaceholder}>
                <Ionicons name="image" size={40} color={Colors.textSecondary} />
              </View>
              {item.caption && <Text style={styles.caption}>{item.caption}</Text>}
              <View style={styles.actions}>
                <Pressable style={styles.warnBtn} onPress={() => warnUser(item.id)}>
                  <Ionicons name="warning" size={16} color={Colors.warning} />
                  <Text style={styles.warnText}>Avverti</Text>
                </Pressable>
                <Pressable style={styles.removeBtn} onPress={() => removePhoto(item.id)}>
                  <Ionicons name="trash" size={16} color={Colors.accentRed} />
                  <Text style={styles.removeText}>Rimuovi</Text>
                </Pressable>
              </View>
            </View>
          )}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={<View style={styles.empty}><Text style={styles.emptyText}>Nessuna foto da moderare</Text></View>}
          scrollEnabled={photos.length > 0}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  infoBar: { flexDirection: "row", padding: 12, paddingHorizontal: 16, gap: 8, backgroundColor: Colors.accent + "15", alignItems: "center" },
  infoText: { flex: 1, fontSize: 13, fontFamily: "Inter_400Regular", color: Colors.accent },
  list: { padding: 16 },
  card: { backgroundColor: Colors.surface, borderRadius: 12, overflow: "hidden", marginBottom: 12 },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12 },
  cardInfo: { flex: 1 },
  nickname: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: Colors.text },
  detail: { fontSize: 12, fontFamily: "Inter_400Regular", color: Colors.textSecondary },
  reportBadge: { padding: 4 },
  photoPlaceholder: { width: "100%", height: 150, backgroundColor: Colors.surfaceLight, alignItems: "center", justifyContent: "center" },
  caption: { fontSize: 13, fontFamily: "Inter_400Regular", color: Colors.textSecondary, padding: 12, paddingBottom: 0 },
  actions: { flexDirection: "row", gap: 12, padding: 12 },
  warnBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4, backgroundColor: Colors.warning + "20", paddingVertical: 8, borderRadius: 8 },
  warnText: { fontSize: 14, fontFamily: "Inter_500Medium", color: Colors.warning },
  removeBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4, backgroundColor: Colors.accentRed + "20", paddingVertical: 8, borderRadius: 8 },
  removeText: { fontSize: 14, fontFamily: "Inter_500Medium", color: Colors.accentRed },
  empty: { alignItems: "center", paddingTop: 60 },
  emptyText: { fontSize: 16, fontFamily: "Inter_400Regular", color: Colors.textSecondary },
});
