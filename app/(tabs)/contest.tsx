import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  Image,
  Alert,
  ActivityIndicator,
  RefreshControl,
  Platform,
} from "react-native";
import { useRouter } from "expo-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { useAuth } from "@/lib/auth-context";
import { apiRequest, queryClient } from "@/lib/query-client";
import * as ImagePicker from "expo-image-picker";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function ContestScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const [submitting, setSubmitting] = useState(false);
  const [cameraPermission, requestCameraPermission] = ImagePicker.useCameraPermissions();

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["/api/contest/current"],
  });

  const entries = (data as any)?.entries || [];
  const dailyVotesUsed = (data as any)?.dailyVotesUsed || 0;
  const contentPolicy = (data as any)?.contentPolicy || "";

  const voteMutation = useMutation({
    mutationFn: async (photoId: string) => {
      await apiRequest("POST", `/api/contest/${photoId}/vote`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/contest/current"] });
    },
    onError: (err: any) => {
      try {
        const msg = err.message || "";
        const parsed = msg.includes(":") ? msg.split(": ").slice(1).join(": ") : msg;
        const json = JSON.parse(parsed);
        Alert.alert("Errore", json.message || "Errore nel voto");
      } catch {
        Alert.alert("Errore", err.message || "Errore nel voto");
      }
    },
  });

  const handleSubmitPhoto = async () => {
    try {
      let result: ImagePicker.ImagePickerResult;

      if (Platform.OS === "web") {
        result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          allowsEditing: true,
          aspect: [4, 3],
          quality: 0.8,
        });
      } else {
        if (!cameraPermission?.granted) {
          const perm = await requestCameraPermission();
          if (!perm.granted) {
            Alert.alert("Permesso necessario", "Consenti l'accesso alla fotocamera per partecipare al concorso.");
            return;
          }
        }
        result = await ImagePicker.launchCameraAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          allowsEditing: true,
          aspect: [4, 3],
          quality: 0.8,
        });
      }

      if (result.canceled) return;

      Alert.alert(
        "Avviso",
        "Si prega di non utilizzare immagini generate con intelligenza artificiale.\n\nNon sono ammesse foto volgari, contenenti droga, sesso esplicito o scatti da pinup.",
        [
          { text: "Annulla", style: "cancel" },
          {
            text: "Conferma Invio",
            onPress: async () => {
              setSubmitting(true);
              try {
                const uri = result.assets[0].uri;
                await apiRequest("POST", "/api/contest/submit", {
                  photoUrl: uri,
                  caption: "",
                });
                queryClient.invalidateQueries({ queryKey: ["/api/contest/current"] });
                Alert.alert("Inviata!", "La tua foto è stata aggiunta al concorso");
              } catch (err) {
                Alert.alert("Errore", "Errore nell'invio della foto");
              } finally {
                setSubmitting(false);
              }
            },
          },
        ]
      );
    } catch (err) {
      Alert.alert("Errore", "Impossibile scattare la foto");
    }
  };

  const renderEntry = ({ item }: { item: any }) => {
    const isOwn = item.userId === user?.id;
    return (
      <View style={styles.photoCard}>
        <View style={styles.photoHeader}>
          <Ionicons name="person-circle" size={28} color={item.user?.sex === "male" ? Colors.maleIcon : Colors.femaleIcon} />
          <Text style={styles.photoNickname}>{item.user?.nickname}</Text>
        </View>
        <View style={styles.photoPlaceholder}>
          <Ionicons name="image" size={48} color={Colors.textSecondary} />
        </View>
        {item.caption ? <Text style={styles.caption}>{item.caption}</Text> : null}
        <View style={styles.photoFooter}>
          <Pressable
            style={[styles.voteBtn, isOwn && styles.voteBtnDisabled]}
            onPress={() => !isOwn && voteMutation.mutate(item.id)}
            disabled={isOwn || voteMutation.isPending}
          >
            <Ionicons name="heart" size={18} color={isOwn ? Colors.textSecondary : Colors.accentRed} />
            <Text style={[styles.voteCount, isOwn && { color: Colors.textSecondary }]}>
              {item.voteCount || 0}
            </Text>
          </Pressable>
          {!isOwn && (
            <Pressable onPress={() => {
              apiRequest("POST", `/api/contest/${item.id}/report`, { description: "Foto inappropriata" });
              Alert.alert("Segnalata", "La foto è stata segnalata ai moderatori");
            }}>
              <Ionicons name="flag" size={18} color={Colors.textSecondary} />
            </Pressable>
          )}
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.policyBar}>
        <Ionicons name="information-circle" size={16} color={Colors.warning} />
        <Text style={styles.policyText} numberOfLines={2}>{contentPolicy || "Carica le tue migliori foto in moto!"}</Text>
      </View>

      <View style={styles.votesBar}>
        <Text style={styles.votesText}>Voti oggi: {dailyVotesUsed}/10</Text>
        <Pressable style={styles.winnersBtn} onPress={() => router.push("/contest/winners" as any)}>
          <Ionicons name="trophy" size={16} color={Colors.accent} />
          <Text style={styles.winnersText}>Hall of Fame</Text>
        </Pressable>
      </View>

      {isLoading ? (
        <View style={styles.loading}>
          <ActivityIndicator size="large" color={Colors.accent} />
        </View>
      ) : (
        <FlatList
          data={entries}
          renderItem={renderEntry}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          numColumns={2}
          columnWrapperStyle={styles.columnWrapper}
          refreshControl={<RefreshControl refreshing={false} onRefresh={refetch} tintColor={Colors.accent} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="camera-outline" size={48} color={Colors.textSecondary} />
              <Text style={styles.emptyText}>Nessuna foto questa settimana</Text>
              <Text style={styles.emptySubtext}>Sii il primo a partecipare!</Text>
            </View>
          }
          scrollEnabled={entries.length > 0}
        />
      )}

      <Pressable
        style={[styles.fab, { bottom: Platform.OS === "web" ? 50 : 16 }]}
        onPress={handleSubmitPhoto}
        disabled={submitting}
      >
        {submitting ? (
          <ActivityIndicator color={Colors.background} />
        ) : (
          <Ionicons name="camera" size={28} color={Colors.background} />
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  policyBar: { flexDirection: "row", padding: 12, paddingHorizontal: 16, gap: 8, backgroundColor: Colors.warning + "15", alignItems: "center" },
  policyText: { flex: 1, fontSize: 12, fontFamily: "Inter_400Regular", color: Colors.warning },
  votesBar: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 16, paddingVertical: 8 },
  votesText: { fontSize: 14, fontFamily: "Inter_500Medium", color: Colors.textSecondary },
  winnersBtn: { flexDirection: "row", alignItems: "center", gap: 4 },
  winnersText: { fontSize: 14, fontFamily: "Inter_500Medium", color: Colors.accent },
  loading: { flex: 1, justifyContent: "center", alignItems: "center" },
  list: { padding: 8, paddingBottom: 80 },
  columnWrapper: { gap: 8 },
  photoCard: { flex: 1, backgroundColor: Colors.surface, borderRadius: 12, overflow: "hidden", marginBottom: 8 },
  photoHeader: { flexDirection: "row", alignItems: "center", gap: 6, padding: 8 },
  photoNickname: { fontSize: 13, fontFamily: "Inter_500Medium", color: Colors.text },
  photoPlaceholder: { width: "100%", aspectRatio: 4 / 3, backgroundColor: Colors.surfaceLight, alignItems: "center", justifyContent: "center" },
  caption: { fontSize: 12, fontFamily: "Inter_400Regular", color: Colors.textSecondary, paddingHorizontal: 8, paddingTop: 4 },
  photoFooter: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 8 },
  voteBtn: { flexDirection: "row", alignItems: "center", gap: 4 },
  voteBtnDisabled: { opacity: 0.5 },
  voteCount: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: Colors.accentRed },
  empty: { alignItems: "center", paddingTop: 60, gap: 8 },
  emptyText: { fontSize: 16, fontFamily: "Inter_500Medium", color: Colors.textSecondary },
  emptySubtext: { fontSize: 14, fontFamily: "Inter_400Regular", color: Colors.textSecondary },
  fab: {
    position: "absolute",
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.accent,
    alignItems: "center",
    justifyContent: "center",
    elevation: 4,
  },
});
