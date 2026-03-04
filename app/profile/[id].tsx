import React from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, Alert, Platform } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { useAuth } from "@/lib/auth-context";
import { apiRequest } from "@/lib/query-client";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function UserProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user: currentUser } = useAuth();
  const insets = useSafeAreaInsets();

  const { data, isLoading } = useQuery({
    queryKey: ["/api/users", id],
  });

  const profileUser = (data as any)?.user;
  const profile = (data as any)?.profile;

  if (isLoading) {
    return <View style={styles.loading}><ActivityIndicator size="large" color={Colors.accent} /></View>;
  }

  if (!profileUser) {
    return <View style={styles.loading}><Text style={styles.errorText}>Utente non trovato</Text></View>;
  }

  const getUserColor = () => {
    if (profileUser.userType === "coppia") {
      if (profileUser.coupleSexConfig === "mm") return Colors.maleIcon;
      if (profileUser.coupleSexConfig === "ff") return Colors.femaleIcon;
      return Colors.accent;
    }
    return profileUser.sex === "male" ? Colors.maleIcon : Colors.femaleIcon;
  };

  const startChat = async () => {
    try {
      const res = await apiRequest("POST", `/api/conversations/private/${profileUser.id}`);
      const data = await res.json();
      router.push(`/chat/${data.conversation.id}` as any);
    } catch (err) {
      Alert.alert("Errore", "Impossibile avviare la chat");
    }
  };

  const reportUser = () => {
    Alert.alert("Segnala Utente", "Scegli la categoria", [
      { text: "Annulla", style: "cancel" },
      { text: "Comportamento piacevole", onPress: () => sendReport("comportamento_piacevole") },
      { text: "Comportamento scorretto", onPress: () => sendReport("comportamento_scorretto") },
      { text: "Foto inappropriata", onPress: () => sendReport("foto_inappropriata") },
    ]);
  };

  const sendReport = async (category: string) => {
    try {
      await apiRequest("POST", "/api/reports", {
        reportedUserId: profileUser.id,
        category,
        description: `Segnalazione da ${currentUser?.nickname}`,
      });
      Alert.alert("Inviata", "La segnalazione è stata inviata");
    } catch (err) {
      Alert.alert("Errore", "Errore nell'invio della segnalazione");
    }
  };

  const isOwnProfile = currentUser?.id === profileUser.id;

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: Platform.OS === "web" ? 34 : insets.bottom + 16 }}>
      <View style={styles.header}>
        <View style={[styles.avatar, { borderColor: getUserColor() }]}>
          <Ionicons
            name={profileUser.userType === "coppia" ? "people" : profileUser.userType === "biker" ? "bicycle" : "person"}
            size={48}
            color={getUserColor()}
          />
        </View>
        <Text style={styles.nickname}>{profileUser.nickname}</Text>
        <Text style={styles.type}>
          {profileUser.userType === "biker" ? "Biker" : profileUser.userType === "zavorrina" ? "Zavorrina/o" : "Coppia"} • {profileUser.region}
        </Text>
      </View>

      {profile && (profileUser.userType === "biker" || profileUser.userType === "coppia") && (
        <View style={styles.section}>
          {profile.motorcycleType && <Text style={styles.detail}>Moto: {profile.motorcycleType}</Text>}
          {profile.ridingStyle && <Text style={styles.detail}>Stile: {profile.ridingStyle}</Text>}
          {profile.isAvailable && <Text style={[styles.detail, { color: Colors.success }]}>Disponibile per giri</Text>}
        </View>
      )}

      {!isOwnProfile && (
        <View style={styles.actions}>
          <Pressable style={styles.chatBtn} onPress={startChat}>
            <Ionicons name="chatbubble" size={20} color={Colors.background} />
            <Text style={styles.chatBtnText}>Invia Messaggio</Text>
          </Pressable>
          <Pressable style={styles.reportBtn} onPress={reportUser}>
            <Ionicons name="flag" size={18} color={Colors.accentRed} />
            <Text style={styles.reportBtnText}>Segnala</Text>
          </Pressable>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  loading: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: Colors.background },
  errorText: { fontSize: 16, fontFamily: "Inter_400Regular", color: Colors.textSecondary },
  header: { alignItems: "center", padding: 24 },
  avatar: { width: 96, height: 96, borderRadius: 48, borderWidth: 3, backgroundColor: Colors.surface, alignItems: "center", justifyContent: "center" },
  nickname: { fontSize: 24, fontFamily: "Inter_700Bold", color: Colors.text, marginTop: 12 },
  type: { fontSize: 16, fontFamily: "Inter_400Regular", color: Colors.textSecondary, marginTop: 4 },
  section: { paddingHorizontal: 24, gap: 8, marginBottom: 16 },
  detail: { fontSize: 16, fontFamily: "Inter_400Regular", color: Colors.text },
  actions: { paddingHorizontal: 24, gap: 12 },
  chatBtn: { flexDirection: "row", backgroundColor: Colors.accent, paddingVertical: 14, borderRadius: 12, alignItems: "center", justifyContent: "center", gap: 8 },
  chatBtnText: { fontSize: 16, fontFamily: "Inter_600SemiBold", color: Colors.background },
  reportBtn: { flexDirection: "row", paddingVertical: 12, alignItems: "center", justifyContent: "center", gap: 6 },
  reportBtnText: { fontSize: 14, fontFamily: "Inter_400Regular", color: Colors.accentRed },
});
