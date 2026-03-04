import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  Platform,
  Alert,
  Modal,
} from "react-native";
import { useRouter } from "expo-router";
import { useAuth } from "@/lib/auth-context";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import RegionPicker from "@/components/RegionPicker";
import { apiRequest, queryClient } from "@/lib/query-client";

export default function ProfileScreen() {
  const router = useRouter();
  const { user, profile, logout, refreshUser } = useAuth();
  const insets = useSafeAreaInsets();
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [showRegionPicker, setShowRegionPicker] = useState(false);

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
      setShowLogoutModal(true);
    } else {
      Alert.alert("Logout", "Sei sicuro di voler uscire?", [
        { text: "Annulla", style: "cancel" },
        { text: "Esci", onPress: doLogout, style: "destructive" },
      ]);
    }
  };

  const handleRegionChange = async (region: string) => {
    try {
      await apiRequest("PUT", "/api/users/profile", { region });
      if (refreshUser) await refreshUser();
      queryClient.invalidateQueries({ queryKey: ["/api/users/profile"] });
    } catch {
      Alert.alert("Errore", "Errore nel cambio regione");
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
          <Pressable style={styles.badge} onPress={() => setShowRegionPicker(true)}>
            <View style={styles.regionBadge}>
              <Text style={styles.badgeText}>{user.region}</Text>
              <Ionicons name="chevron-down" size={12} color={Colors.textSecondary} />
            </View>
          </Pressable>
        </View>
      </View>

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

      <Modal visible={showLogoutModal} transparent animationType="fade" onRequestClose={() => setShowLogoutModal(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setShowLogoutModal(false)}>
          <View style={styles.modalContent}>
            <Ionicons name="log-out" size={32} color={Colors.accentRed} />
            <Text style={styles.modalTitle}>Sei sicuro di voler uscire?</Text>
            <View style={styles.modalButtons}>
              <Pressable style={styles.modalBtnCancel} onPress={() => setShowLogoutModal(false)}>
                <Text style={styles.modalBtnCancelText}>Annulla</Text>
              </Pressable>
              <Pressable style={styles.modalBtnConfirm} onPress={() => { setShowLogoutModal(false); doLogout(); }}>
                <Text style={styles.modalBtnConfirmText}>Esci</Text>
              </Pressable>
            </View>
          </View>
        </Pressable>
      </Modal>

      <RegionPicker
        visible={showRegionPicker}
        selectedRegion={user.region}
        onSelect={(region) => {
          setShowRegionPicker(false);
          handleRegionChange(region);
        }}
        onClose={() => setShowRegionPicker(false)}
      />
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
  regionBadge: { flexDirection: "row", alignItems: "center", gap: 4 },
  section: { paddingHorizontal: 16, marginTop: 8 },
  sectionTitle: { fontSize: 18, fontFamily: "Inter_600SemiBold", color: Colors.text, marginBottom: 12 },
  menuItem: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: Colors.surface, borderRadius: 12, padding: 14, marginBottom: 8 },
  menuLabel: { flex: 1, fontSize: 16, fontFamily: "Inter_500Medium", color: Colors.text },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "center", alignItems: "center" },
  modalContent: { backgroundColor: Colors.surface, borderRadius: 16, padding: 24, alignItems: "center", width: 300, gap: 16 },
  modalTitle: { fontSize: 18, fontFamily: "Inter_600SemiBold", color: Colors.text, textAlign: "center" },
  modalButtons: { flexDirection: "row", gap: 12, width: "100%" },
  modalBtnCancel: { flex: 1, backgroundColor: Colors.background, borderRadius: 10, padding: 12, alignItems: "center" },
  modalBtnCancelText: { fontSize: 16, fontFamily: "Inter_600SemiBold", color: Colors.textSecondary },
  modalBtnConfirm: { flex: 1, backgroundColor: Colors.accentRed, borderRadius: 10, padding: 12, alignItems: "center" },
  modalBtnConfirmText: { fontSize: 16, fontFamily: "Inter_600SemiBold", color: "#fff" },
});
