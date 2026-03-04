import React from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  Platform,
  Alert,
} from "react-native";
import { useRouter } from "expo-router";
import { useAuth } from "@/lib/auth-context";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function ProfileScreen() {
  const router = useRouter();
  const { user, profile, logout } = useAuth();
  const insets = useSafeAreaInsets();

  if (!user) return null;

  const getUserColor = () => {
    if (user.userType === "coppia") {
      if (user.coupleSexConfig === "mm") return Colors.maleIcon;
      if (user.coupleSexConfig === "ff") return Colors.femaleIcon;
      return Colors.accent;
    }
    return user.sex === "male" ? Colors.maleIcon : Colors.femaleIcon;
  };

  const getUserIcon = (): keyof typeof Ionicons.glyphMap => {
    if (user.userType === "coppia") return "people";
    if (user.userType === "zavorrina") return "person";
    return "bicycle";
  };

  const getUserTypeLabel = () => {
    if (user.userType === "biker") return "Biker";
    if (user.userType === "zavorrina") return "Zavorrina/o";
    return "Coppia";
  };

  const doLogout = async () => {
    await logout();
    router.replace("/welcome");
  };

  const handleLogout = () => {
    if (Platform.OS === "web") {
      if (window.confirm("Vuoi davvero uscire?")) {
        doLogout();
      }
    } else {
      Alert.alert("Logout", "Vuoi davvero uscire?", [
        { text: "Annulla", style: "cancel" },
        { text: "Esci", onPress: doLogout, style: "destructive" },
      ]);
    }
  };

  const MenuItem = ({ icon, label, onPress, color }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void; color?: string }) => (
    <Pressable style={styles.menuItem} onPress={onPress}>
      <Ionicons name={icon} size={22} color={color || Colors.text} />
      <Text style={[styles.menuLabel, color ? { color } : {}]}>{label}</Text>
      <Ionicons name="chevron-forward" size={18} color={Colors.textSecondary} />
    </Pressable>
  );

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingBottom: Platform.OS === "web" ? 34 : insets.bottom + 16 }}
    >
      <View style={styles.profileHeader}>
        <View style={[styles.avatar, { borderColor: getUserColor() }]}>
          <Ionicons name={getUserIcon()} size={48} color={getUserColor()} />
        </View>
        <Text style={styles.nickname}>{user.nickname}</Text>
        <View style={styles.badges}>
          <View style={[styles.badge, { backgroundColor: getUserColor() + "20" }]}>
            <Text style={[styles.badgeText, { color: getUserColor() }]}>{getUserTypeLabel()}</Text>
          </View>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{user.region}</Text>
          </View>
        </View>
      </View>

      {profile && (user.userType === "biker" || user.userType === "coppia") && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Moto & Stile</Text>
          <View style={styles.infoGrid}>
            {profile.motorcycleType && (
              <View style={styles.infoItem}>
                <Text style={styles.infoLabel}>Tipo Moto</Text>
                <Text style={styles.infoValue}>{profile.motorcycleType}</Text>
              </View>
            )}
            {profile.ridingStyle && (
              <View style={styles.infoItem}>
                <Text style={styles.infoLabel}>Stile Guida</Text>
                <Text style={styles.infoValue}>{profile.ridingStyle}</Text>
              </View>
            )}
            <View style={styles.infoItem}>
              <Text style={styles.infoLabel}>Disponibile</Text>
              <Text style={[styles.infoValue, { color: profile.isAvailable ? Colors.success : Colors.textSecondary }]}>
                {profile.isAvailable ? "Sì" : "No"}
              </Text>
            </View>
          </View>
        </View>
      )}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Menu</Text>
        <MenuItem icon="create" label="Modifica Profilo" onPress={() => router.push("/profile/edit" as any)} />
        <MenuItem icon="chatbubbles" label="Le Mie Chat" onPress={() => router.push("/chat" as any)} />
        <MenuItem icon="gift" label="Easter Eggs Collezionati" onPress={() => router.push("/profile/easter-eggs" as any)} />
        <MenuItem icon="chatbox-ellipses" label="Segnala Bug / Richieste" onPress={() => router.push("/feedback" as any)} color={Colors.warning} />

        {user.role === "admin" && (
          <MenuItem icon="shield" label="Pannello Admin" onPress={() => router.push("/admin" as any)} color={Colors.accent} />
        )}
        {(user.role === "moderator" || user.role === "admin") && (
          <MenuItem icon="eye" label="Pannello Moderatore" onPress={() => router.push("/moderator" as any)} color={Colors.warning} />
        )}

        <MenuItem icon="log-out" label="Logout" onPress={handleLogout} color={Colors.accentRed} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  profileHeader: { alignItems: "center", padding: 24, paddingTop: 12 },
  avatar: { width: 96, height: 96, borderRadius: 48, borderWidth: 3, backgroundColor: Colors.surface, alignItems: "center", justifyContent: "center" },
  nickname: { fontSize: 24, fontFamily: "Inter_700Bold", color: Colors.text, marginTop: 12 },
  badges: { flexDirection: "row", gap: 8, marginTop: 8 },
  badge: { backgroundColor: Colors.surface, paddingVertical: 4, paddingHorizontal: 12, borderRadius: 12 },
  badgeText: { fontSize: 13, fontFamily: "Inter_500Medium", color: Colors.textSecondary },
  section: { paddingHorizontal: 16, marginTop: 8 },
  sectionTitle: { fontSize: 18, fontFamily: "Inter_600SemiBold", color: Colors.text, marginBottom: 12 },
  infoGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12, marginBottom: 16 },
  infoItem: { backgroundColor: Colors.surface, borderRadius: 12, padding: 12, minWidth: "30%", flex: 1 },
  infoLabel: { fontSize: 12, fontFamily: "Inter_400Regular", color: Colors.textSecondary },
  infoValue: { fontSize: 16, fontFamily: "Inter_600SemiBold", color: Colors.text, marginTop: 2 },
  menuItem: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: Colors.surface, borderRadius: 12, padding: 14, marginBottom: 8 },
  menuLabel: { flex: 1, fontSize: 16, fontFamily: "Inter_500Medium", color: Colors.text },
});
