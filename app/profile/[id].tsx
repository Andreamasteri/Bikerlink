import React from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
  Alert,
} from "react-native";
import { useLocalSearchParams, useRouter, Stack } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/colors";
import { apiRequest, getApiUrl } from "@/lib/query-client";
import { useAuth } from "@/lib/auth-context";

export default function PublicProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const baseUrl = getApiUrl();

  const { data: profile, isLoading } = useQuery({
    queryKey: ["/api/users", id, "public"],
    queryFn: async () => {
      const res = await fetch(new URL(`/api/users/${id}/public`, baseUrl).toString(), {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Errore");
      return res.json();
    },
    enabled: !!id,
  });

  const getUserColor = (userType: string) => {
    if (userType === "biker") return Colors.maleIcon;
    if (userType === "zavorrina") return Colors.femaleIcon;
    return Colors.accent;
  };

  const getUserTypeLabel = (userType: string) => {
    if (userType === "biker") return "Biker";
    if (userType === "zavorrina") return "Zavorrina/o";
    return "Coppia";
  };

  const handleStartChat = async () => {
    try {
      const res = await apiRequest("POST", "/api/chat/conversations", {
        conversationType: "direct",
        participantIds: [id],
      });
      const conv = await res.json();
      router.push(`/chat/${conv.id}` as any);
    } catch (e: any) {
      Alert.alert("Errore", e.message || "Impossibile aprire la chat");
    }
  };

  const webTopInset = Platform.OS === "web" ? 67 : 0;

  if (isLoading) {
    return (
      <>
        <Stack.Screen options={{ headerShown: true, title: "", headerStyle: { backgroundColor: Colors.surface }, headerTintColor: Colors.text }} />
        <View style={[styles.centered, { paddingTop: webTopInset }]}>
          <ActivityIndicator size="large" color={Colors.accent} />
        </View>
      </>
    );
  }

  if (!profile) {
    return (
      <>
        <Stack.Screen options={{ headerShown: true, title: "", headerStyle: { backgroundColor: Colors.surface }, headerTintColor: Colors.text }} />
        <View style={[styles.centered, { paddingTop: webTopInset }]}>
          <Ionicons name="person-outline" size={48} color={Colors.textSecondary} />
          <Text style={styles.emptyText}>Utente non trovato</Text>
        </View>
      </>
    );
  }

  const color = getUserColor(profile.userType);
  const isSelf = user?.id === id;

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          title: profile.nickname,
          headerStyle: { backgroundColor: Colors.surface },
          headerTintColor: Colors.text,
        }}
      />
      <ScrollView
        style={styles.container}
        contentContainerStyle={{ paddingTop: webTopInset, paddingBottom: 40 }}
      >
        <View style={styles.avatarSection}>
          <View style={[styles.avatar, { backgroundColor: color + "33" }]}>
            <Ionicons
              name={profile.userType === "coppia" ? "people" : profile.userType === "zavorrina" ? "person" : "bicycle"}
              size={48}
              color={color}
            />
          </View>
          <Text style={[styles.nickname, { color }]}>{profile.nickname}</Text>
          <Text style={styles.userType}>
            {getUserTypeLabel(profile.userType)}
            {profile.sex ? ` · ${profile.sex === "M" ? "Maschio" : "Femmina"}` : ""}
          </Text>
          {!!profile.region && (
            <View style={styles.locationRow}>
              <Ionicons name="location" size={14} color={Colors.textSecondary} />
              <Text style={styles.locationText}>
                {profile.city ? `${profile.city}, ` : ""}{profile.region}
              </Text>
            </View>
          )}
        </View>

        {!!profile.bio && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Bio</Text>
            <Text style={styles.bioText}>{profile.bio}</Text>
          </View>
        )}

        {profile.motorcycles && profile.motorcycles.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Moto</Text>
            {profile.motorcycles.map((m: any) => (
              <View key={m.id} style={styles.motoCard}>
                <MaterialCommunityIcons name="motorbike" size={24} color={Colors.accent} />
                <View style={styles.motoInfo}>
                  <Text style={styles.motoName}>{m.brand} {m.model}</Text>
                  {!!m.year && <Text style={styles.motoDetail}>Anno: {m.year}</Text>}
                  {!!m.engineSize && <Text style={styles.motoDetail}>{m.engineSize}cc</Text>}
                  {!!m.ridingStyle && <Text style={styles.motoDetail}>Stile: {m.ridingStyle}</Text>}
                </View>
              </View>
            ))}
          </View>
        )}

        {!isSelf && (
          <TouchableOpacity style={styles.chatButton} onPress={handleStartChat} activeOpacity={0.8}>
            <Ionicons name="chatbubbles" size={22} color={Colors.background} />
            <Text style={styles.chatButtonText}>Scrivi un messaggio</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  centered: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: Colors.background },
  emptyText: { fontSize: 16, color: Colors.textSecondary, fontFamily: "Inter_400Regular", marginTop: 12 },
  avatarSection: { alignItems: "center", paddingTop: 24, paddingBottom: 16 },
  avatar: { width: 96, height: 96, borderRadius: 48, justifyContent: "center", alignItems: "center", marginBottom: 12 },
  nickname: { fontSize: 24, fontFamily: "Inter_700Bold" },
  userType: { fontSize: 15, fontFamily: "Inter_500Medium", color: Colors.textSecondary, marginTop: 4 },
  locationRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 8 },
  locationText: { fontSize: 13, fontFamily: "Inter_400Regular", color: Colors.textSecondary },
  section: { paddingHorizontal: 20, marginTop: 16 },
  sectionTitle: { fontSize: 16, fontFamily: "Inter_600SemiBold", color: Colors.accent, marginBottom: 8 },
  bioText: { fontSize: 15, fontFamily: "Inter_400Regular", color: Colors.text, lineHeight: 22 },
  motoCard: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: Colors.surface, borderRadius: 12, padding: 14, marginBottom: 8 },
  motoInfo: { flex: 1 },
  motoName: { fontSize: 16, fontFamily: "Inter_600SemiBold", color: Colors.text },
  motoDetail: { fontSize: 13, fontFamily: "Inter_400Regular", color: Colors.textSecondary, marginTop: 2 },
  chatButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: Colors.accent,
    borderRadius: 14,
    paddingVertical: 16,
    marginHorizontal: 20,
    marginTop: 24,
  },
  chatButtonText: { fontSize: 16, fontWeight: "700" as const, color: Colors.background },
});
