import React from "react";
import {
  Modal,
  Pressable,
  View,
  Text,
  ScrollView,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import Colors from "@/constants/colors";
import { useT } from "@/lib/language-context";
import { getCountryFlag, getCountryName } from "@/lib/countries-regions";
import FavoriteStar from "@/components/FavoriteStar";
import { useSafeAreaInsets } from "react-native-safe-area-context";


type UserItem = {
  id: string;
  nickname: string;
  userType?: string;
  sex?: string | null;
  country?: string | null;
  region?: string | null;
  isAvailable?: boolean;
  isOnline?: boolean;
  moto?: string;
  ridingStyle?: string;
  bio?: string;
  birthYear?: number;
  latitude?: number | null;
  longitude?: number | null;
  distance?: number | null;
};

type Props = {
  visible: boolean;
  onClose: () => void;
  title: string;
  icon: React.ReactNode;
  data: UserItem[] | undefined;
  isLoading: boolean;
  emptyIcon: React.ReactNode;
  emptyText: string;
  currentUserId: string | null | undefined;
  onLocateUser: (u: UserItem) => void;
  showMoto?: boolean;
  showOfflineToggle?: boolean;
  showOffline?: boolean;
  offlineCountdown?: number;
  onToggleOffline?: () => void;
};

function getUserColor(u: UserItem) {
  if (u.userType === "coppia") return Colors.accent;
  if (u.sex === "F") return Colors.femaleIcon;
  if (u.sex === "M") return Colors.maleIcon;
  if (u.userType?.startsWith("zavorrina")) return Colors.femaleIcon;
  if (u.userType?.startsWith("biker")) return Colors.maleIcon;
  return Colors.accent;
}

function getUserIcon(u: UserItem): "people" | "person" | "bicycle" {
  if (u.userType === "coppia") return "people";
  if (u.userType?.startsWith("zavorrina")) return "person";
  return "bicycle";
}

function getUserTypeLabel(u: UserItem, t: (k: string) => string) {
  if (u.userType?.startsWith("biker")) return t("profile.bikerType");
  if (u.userType?.startsWith("zavorrina")) return t("profile.zavorrinaType");
  return t("profile.coupleType");
}

export default function UserListSheet({
  visible,
  onClose,
  title,
  icon,
  data,
  isLoading,
  emptyIcon,
  emptyText,
  currentUserId,
  onLocateUser,
  showMoto = false,
  showOfflineToggle = false,
  showOffline = false,
  offlineCountdown = 0,
  onToggleOffline,
}: Props) {
  const t = useT();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable
          style={[styles.sheet, { paddingBottom: insets.bottom || 16 }]}
          onPress={(e) => e.stopPropagation()}
        >
          <View style={styles.handle} />
          <View style={styles.header}>
            {icon}
            <Text style={styles.headerTitle}>{title}</Text>
            <Pressable onPress={onClose}>
              <Ionicons name="close" size={24} color={Colors.textSecondary} />
            </Pressable>
          </View>

          {showOfflineToggle && (
            <Pressable
              style={[styles.offlineToggle, showOffline && styles.offlineToggleActive]}
              onPress={onToggleOffline}
            >
              <Ionicons
                name={showOffline ? "eye" : "eye-off"}
                size={16}
                color={showOffline ? Colors.accent : Colors.textSecondary}
              />
              <Text style={[styles.offlineToggleText, showOffline && { color: Colors.accent }]}>
                {showOffline
                  ? `${t("home.alsoOffline")} (${offlineCountdown}s)`
                  : t("home.showOffline")}
              </Text>
            </Pressable>
          )}

          {isLoading ? (
            <ActivityIndicator size="large" color={Colors.accent} style={{ marginVertical: 40 }} />
          ) : (data || []).length === 0 ? (
            <View style={styles.emptyState}>
              {emptyIcon}
              <Text style={styles.emptyText}>{emptyText}</Text>
            </View>
          ) : (
            <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 500 }}>
              {(data || []).map((u) => (
                <Pressable
                  key={u.id}
                  style={[
                    styles.userCard,
                    u.isOnline === false && showOffline && { opacity: 0.5 },
                  ]}
                  onPress={() => {
                    onClose();
                    router.push(`/profile/${u.id}` as never);
                  }}
                >
                  <View style={styles.userLeft}>
                    <Ionicons name={getUserIcon(u)} size={28} color={getUserColor(u)} />
                    {u.isAvailable ? (
                      <View style={styles.availableDot} />
                    ) : showOffline ? (
                      <View style={[styles.availableDot, { backgroundColor: "#666" }]} />
                    ) : null}
                  </View>
                  <View style={styles.userInfo}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                      <Text style={styles.userName}>{u.nickname}</Text>
                      {u.id !== currentUserId && <FavoriteStar targetUserId={u.id} size={14} />}
                    </View>
                    <Text style={styles.userDetail}>
                      {getUserTypeLabel(u, t)}
                      {u.sex ? ` · ${u.sex === "M" ? "M" : "F"}` : ""}
                      {u.country ? ` · ${getCountryFlag(u.country)} ${getCountryName(u.country)}` : ""}
                      {u.region ? ` · ${u.region}` : ""}
                    </Text>
                    {showMoto && !!u.moto && (
                      <Text style={styles.userDetail}>
                        {u.moto}
                        {u.ridingStyle ? ` · ${u.ridingStyle}` : ""}
                      </Text>
                    )}
                    {!!u.bio && (
                      <Text style={styles.userBio} numberOfLines={1}>
                        {u.bio}
                      </Text>
                    )}
                    {!!u.birthYear && (
                      <Text style={styles.userDetail}>Anno: {u.birthYear}</Text>
                    )}
                  </View>
                  {u.latitude != null && u.longitude != null && u.id !== currentUserId && (
                    <Pressable
                      style={styles.locateBtn}
                      onPress={(e) => {
                        e.stopPropagation();
                        onLocateUser(u);
                      }}
                    >
                      <Ionicons name="navigate" size={18} color={Colors.accent} />
                    </Pressable>
                  )}
                  {u.distance != null && u.id !== currentUserId && (
                    <View style={styles.distanceBadge}>
                      <Text style={styles.distanceText}>{u.distance} km</Text>
                    </View>
                  )}
                </Pressable>
              ))}
            </ScrollView>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 16,
    maxHeight: "80%",
  },
  handle: {
    width: 40,
    height: 4,
    backgroundColor: Colors.border,
    borderRadius: 2,
    alignSelf: "center",
    marginBottom: 16,
  },
  header: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 16 },
  headerTitle: { flex: 1, fontSize: 18, fontFamily: "Inter_700Bold", color: Colors.text },
  offlineToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginBottom: 8,
    borderRadius: 8,
    backgroundColor: Colors.surfaceLight,
  },
  offlineToggleActive: {
    backgroundColor: Colors.accent + "20",
    borderWidth: 1,
    borderColor: Colors.accent + "40",
  },
  offlineToggleText: { fontSize: 13, fontFamily: "Inter_500Medium", color: Colors.textSecondary },
  emptyState: { alignItems: "center", padding: 24, gap: 8 },
  emptyText: { fontSize: 14, fontFamily: "Inter_400Regular", color: Colors.textSecondary },
  userCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.background,
    borderRadius: 10,
    padding: 10,
    marginBottom: 6,
    gap: 12,
  },
  userLeft: { position: "relative" },
  availableDot: {
    position: "absolute",
    bottom: -2,
    right: -2,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.success,
    borderWidth: 2,
    borderColor: Colors.background,
  },
  userInfo: { flex: 1, gap: 2 },
  userName: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: Colors.text },
  userDetail: { fontSize: 12, fontFamily: "Inter_400Regular", color: Colors.textSecondary },
  userBio: { fontSize: 12, fontFamily: "Inter_400Regular", color: Colors.textSecondary, fontStyle: "italic" },
  locateBtn: { padding: 8, justifyContent: "center", alignItems: "center" },
  distanceBadge: {
    backgroundColor: Colors.accent + "20",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  distanceText: { fontSize: 12, fontFamily: "Inter_600SemiBold", color: Colors.accent },
});
