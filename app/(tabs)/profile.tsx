import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  Platform,
  TouchableOpacity,
  ScrollView,
  Image,
  Alert,
  ActivityIndicator,
  Dimensions,
  RefreshControl,
  Pressable,
  Modal,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import * as ImagePicker from "expo-image-picker";
import Colors from "@/constants/colors";
import { t } from "@/lib/i18n";
import { useAuth } from "@/lib/auth-context";
import { apiRequest, getApiUrl, queryClient } from "@/lib/query-client";

interface ProfileData {
  id: string;
  nickname: string;
  email: string;
  phone?: string;
  userType: string;
  sex?: string;
  coupleSexConfig?: string;
  birthYear?: number;
  region?: string;
  avatarUrl?: string;
  role: string;
  status: string;
  deletionRequestedAt?: string;
  profile?: {
    isAvailable: boolean;
    bio?: string;
    totalKm: number;
    totalRides: number;
    easterEggsCollected: number;
    maxPickupDistance?: number;
    searchPreference?: string;
  };
  photos?: Array<{
    id: string;
    photoUrl: string;
    sortOrder: number;
    isApproved: boolean;
  }>;
  motorcycles?: Array<{
    id: string;
    brand: string;
    model: string;
    year?: number;
    displacement?: number;
    motorcycleType?: string;
    ridingStyle?: string;
    photoUrl?: string;
  }>;
}

function getUserTypeColor(userType: string, sex?: string, coupleSexConfig?: string): string {
  if (userType === "coppia") {
    return Colors.coupleIcon;
  }
  if (sex === "M") return Colors.maleIcon;
  if (sex === "F") return Colors.femaleIcon;
  if (userType === "zavorrina") return Colors.femaleIcon;
  return Colors.maleIcon;
}

function getUserTypeIcon(userType: string): keyof typeof Ionicons.glyphMap {
  if (userType === "coppia") return "people";
  if (userType === "zavorrina") return "person";
  return "bicycle";
}

function getUserTypeLabel(userType: string): string {
  switch (userType) {
    case "biker":
      return "Biker";
    case "zavorrina":
      return "Zavorrina/o";
    case "coppia":
      return "Coppia";
    default:
      return userType;
  }
}

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const { user, logoutMutation } = useAuth();
  const router = useRouter();
  const [showLogoutModal, setShowLogoutModal] = useState(false);

  const profileQuery = useQuery<ProfileData>({
    queryKey: ["/api/users/me"],
    enabled: !!user,
  });

  const profile = profileQuery.data;
  const currentUserType = profile?.userType ?? user?.userType ?? "biker";
  const currentSex = profile?.sex ?? (user as any)?.sex;
  const currentCoupleSexConfig = profile?.coupleSexConfig ?? (user as any)?.coupleSexConfig;
  const typeColor = getUserTypeColor(currentUserType, currentSex, currentCoupleSexConfig);

  const uploadAvatarMutation = useMutation({
    mutationFn: async (uri: string) => {
      const formData = new FormData();
      const filename = uri.split("/").pop() || "avatar.jpg";
      const match = /\.(\w+)$/.exec(filename);
      const type = match ? `image/${match[1]}` : "image/jpeg";
      formData.append("photo", {
        uri,
        name: filename,
        type,
      } as any);
      const baseUrl = getApiUrl();
      const url = new URL("/api/users/me/photos", baseUrl);
      const res = await fetch(url.toString(), {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text);
      }
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users/me"] });
    },
  });

  const deletePhotoMutation = useMutation({
    mutationFn: async (photoId: string) => {
      await apiRequest("DELETE", `/api/users/me/photos/${photoId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users/me"] });
    },
  });

  const searchPreference = profile?.profile?.searchPreference ?? "both";

  const searchPreferenceMutation = useMutation({
    mutationFn: async (value: "bikers" | "zavorrine" | "both") => {
      await apiRequest("PUT", "/api/users/profile/dynamic", { searchPreference: value });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users/me"] });
    },
  });

  const requestDeletionMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/users/me/request-deletion");
    },
    onSuccess: () => {
      Alert.alert("Account programmato per la cancellazione");
      logoutMutation.mutate();
    },
  });

  const cancelDeletionMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/users/me/cancel-deletion");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users/me"] });
    },
  });

  const deleteMotoMutation = useMutation({
    mutationFn: async (motoId: string) => {
      await apiRequest("DELETE", `/api/motorcycles/${motoId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users/me"] });
    },
  });

  const pickImage = useCallback(async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      uploadAvatarMutation.mutate(result.assets[0].uri);
    }
  }, []);

  const handleDeletePhoto = useCallback((photoId: string) => {
    Alert.alert("Elimina foto", "Sei sicuro di voler eliminare questa foto?", [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("common.delete"),
        style: "destructive",
        onPress: () => deletePhotoMutation.mutate(photoId),
      },
    ]);
  }, []);

  const handleDeleteMoto = useCallback((motoId: string) => {
    Alert.alert("Elimina moto", "Sei sicuro di voler eliminare questa moto?", [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("common.delete"),
        style: "destructive",
        onPress: () => deleteMotoMutation.mutate(motoId),
      },
    ]);
  }, []);

  const doLogout = async () => {
    logoutMutation.mutate();
  };

  const handleRequestDeletion = useCallback(() => {
    requestDeletionMutation.mutate();
  }, []);

  const handleDeleteAccount = useCallback(() => {
    if (Platform.OS === "web") {
      if (confirm("Il tuo account sarà cancellato definitivamente tra 30 giorni. Durante questo periodo puoi annullare la cancellazione effettuando il login. Vuoi procedere?")) {
        handleRequestDeletion();
      }
    } else {
      Alert.alert(
        "Elimina Account",
        "Il tuo account sarà cancellato definitivamente tra 30 giorni. Durante questo periodo puoi annullare la cancellazione effettuando il login. Vuoi procedere?",
        [
          { text: "Annulla", style: "cancel" },
          {
            text: "Elimina",
            style: "destructive",
            onPress: handleRequestDeletion,
          },
        ]
      );
    }
  }, []);

  const handleLogout = useCallback(() => {
    if (Platform.OS === "web") {
      setShowLogoutModal(true);
    } else {
      Alert.alert("Logout", "Sei sicuro di voler uscire?", [
        { text: "Annulla", style: "cancel" },
        {
          text: "Esci",
          style: "destructive",
          onPress: doLogout,
        },
      ]);
    }
  }, []);

  const avatarSource = profile?.avatarUrl
    ? { uri: profile.avatarUrl.startsWith("http") ? profile.avatarUrl : `${getApiUrl()}${profile.avatarUrl}` }
    : profile?.photos && profile.photos.length > 0
    ? { uri: profile.photos[0].photoUrl.startsWith("http") ? profile.photos[0].photoUrl : `${getApiUrl()}${profile.photos[0].photoUrl}` }
    : null;

  const totalRides = profile?.profile?.totalRides ?? 0;
  const totalKm = profile?.profile?.totalKm ?? 0;
  const easterEggs = profile?.profile?.easterEggsCollected ?? 0;
  const isZavorrina = currentUserType === "zavorrina";
  const isBikerOrCoppia = currentUserType === "biker" || currentUserType === "coppia";

  const MenuItem = ({ icon, label, onPress, color }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void; color?: string }) => (
    <Pressable style={styles.menuItem} onPress={onPress}>
      <Ionicons name={icon} size={22} color={color || Colors.text} />
      <Text style={[styles.menuLabel, color ? { color } : {}]}>{label}</Text>
      <Ionicons name="chevron-forward" size={18} color={Colors.textSecondary} />
    </Pressable>
  );

  return (
    <ScrollView
      style={[
        styles.container,
        { paddingTop: Platform.OS === "web" ? 67 : insets.top },
      ]}
      contentContainerStyle={{ paddingBottom: Platform.OS === "web" ? 34 : insets.bottom + 16 }}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={profileQuery.isRefetching}
          onRefresh={() => profileQuery.refetch()}
          tintColor={Colors.accent}
        />
      }
    >
      <View style={styles.profileHeader}>
        <TouchableOpacity onPress={pickImage} activeOpacity={0.8}>
          <View style={[styles.avatar, { borderColor: typeColor }]}>
            {avatarSource ? (
              <Image source={avatarSource} style={styles.avatarImage} />
            ) : (
              <Ionicons name={getUserTypeIcon(currentUserType)} size={48} color={typeColor} />
            )}
          </View>
        </TouchableOpacity>
        {uploadAvatarMutation.isPending && (
          <ActivityIndicator
            size="small"
            color={Colors.accent}
            style={{ marginTop: 8 }}
          />
        )}
        <Text style={styles.nickname}>
          {profile?.nickname ?? user?.nickname ?? ""}
        </Text>
        <View style={styles.badges}>
          <View style={[styles.badge, { backgroundColor: typeColor + "20" }]}>
            <Text style={[styles.badgeText, { color: typeColor }]}>
              {getUserTypeLabel(currentUserType)}
            </Text>
          </View>
          {profile?.region && (
            <View style={styles.badge}>
              <View style={styles.regionBadge}>
                <Ionicons name="location-outline" size={14} color={Colors.textSecondary} />
                <Text style={styles.badgeText}>{profile.region}</Text>
              </View>
            </View>
          )}
        </View>
      </View>

      <View style={styles.section}>
        <View style={styles.statsRow}>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{totalRides}</Text>
            <Text style={styles.statLabel}>{t("profile.rides")}</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statValue}>
              {totalKm >= 1000 ? `${(totalKm / 1000).toFixed(1)}k` : Math.round(totalKm)}
            </Text>
            <Text style={styles.statLabel}>{t("profile.totalKm")}</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{easterEggs}</Text>
            <Text style={styles.statLabel}>{t("profile.easterEggs")}</Text>
          </View>
        </View>
      </View>

      {profile?.deletionRequestedAt && (
        <View style={styles.deletionBanner}>
          <Ionicons name="warning" size={20} color="#000" />
          <Text style={styles.deletionBannerText}>
            Il tuo account sarà eliminato il{" "}
            {new Date(new Date(profile.deletionRequestedAt).getTime() + 30 * 24 * 60 * 60 * 1000).toLocaleDateString("it-IT")}.
            {" "}Puoi annullare questa richiesta.
          </Text>
          <Pressable
            style={styles.deletionCancelBtn}
            onPress={() => cancelDeletionMutation.mutate()}
          >
            <Text style={styles.deletionCancelBtnText}>Annulla cancellazione</Text>
          </Pressable>
        </View>
      )}

      {profile?.profile?.bio ? (
        <View style={styles.section}>
          <View style={styles.bioCard}>
            <Text style={styles.bioText}>{profile.profile.bio}</Text>
          </View>
        </View>
      ) : null}

      {isBikerOrCoppia && (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{t("profile.motorcycles")}</Text>
            <TouchableOpacity
              onPress={() => router.push("/profile/edit?addMoto=true" as any)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="add-circle-outline" size={24} color={Colors.accent} />
            </TouchableOpacity>
          </View>
          {profile?.motorcycles && profile.motorcycles.length > 0 ? (
            profile.motorcycles.map((moto) => (
              <View key={moto.id} style={styles.motoCard}>
                <View style={styles.motoIconContainer}>
                  <Ionicons name="bicycle" size={28} color={Colors.accent} />
                </View>
                <View style={styles.motoInfo}>
                  <Text style={styles.motoName}>
                    {moto.brand} {moto.model}
                  </Text>
                  <View style={styles.motoDetails}>
                    {moto.year && (
                      <Text style={styles.motoDetail}>{moto.year}</Text>
                    )}
                    {moto.displacement && (
                      <Text style={styles.motoDetail}>{moto.displacement}cc</Text>
                    )}
                    {moto.motorcycleType && (
                      <View style={styles.motoTag}>
                        <Text style={styles.motoTagText}>{moto.motorcycleType}</Text>
                      </View>
                    )}
                  </View>
                  {moto.ridingStyle && (
                    <Text style={styles.motoRidingStyle}>{moto.ridingStyle}</Text>
                  )}
                </View>
                <TouchableOpacity
                  onPress={() => handleDeleteMoto(moto.id)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons name="trash-outline" size={18} color={Colors.error} />
                </TouchableOpacity>
              </View>
            ))
          ) : (
            <View style={styles.emptySection}>
              <Ionicons name="bicycle" size={32} color={Colors.textSecondary} />
              <Text style={styles.emptyText}>{t("profile.addMoto")}</Text>
            </View>
          )}
        </View>
      )}

      {isZavorrina && (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{t("profile.photos")}</Text>
            {(profile?.photos?.length ?? 0) < 3 && (
              <TouchableOpacity
                onPress={pickImage}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="add-circle-outline" size={24} color={Colors.accent} />
              </TouchableOpacity>
            )}
          </View>
          {profile?.photos && profile.photos.length > 0 ? (
            <View style={styles.photoGrid}>
              {profile.photos.map((photo) => {
                const photoUri = photo.photoUrl.startsWith("http")
                  ? photo.photoUrl
                  : `${getApiUrl()}${photo.photoUrl}`;
                return (
                  <View key={photo.id} style={styles.photoItem}>
                    <Image source={{ uri: photoUri }} style={styles.photoImage} />
                    <TouchableOpacity
                      style={styles.photoDeleteBtn}
                      onPress={() => handleDeletePhoto(photo.id)}
                    >
                      <Ionicons name="close" size={14} color="#FFFFFF" />
                    </TouchableOpacity>
                    {!photo.isApproved && (
                      <View style={styles.pendingBadge}>
                        <Text style={styles.pendingText}>In attesa</Text>
                      </View>
                    )}
                  </View>
                );
              })}
              {profile.photos.length < 3 && (
                <TouchableOpacity
                  style={styles.addPhotoSlot}
                  onPress={pickImage}
                  activeOpacity={0.7}
                >
                  <Ionicons name="add" size={32} color={Colors.textSecondary} />
                  <Text style={styles.addPhotoText}>
                    {3 - profile.photos.length} rimaste
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          ) : (
            <TouchableOpacity
              style={styles.emptySection}
              onPress={pickImage}
              activeOpacity={0.7}
            >
              <Ionicons name="image-outline" size={32} color={Colors.textSecondary} />
              <Text style={styles.emptyText}>{t("profile.addPhoto")}</Text>
              <Text style={styles.emptySubtext}>Max 3 foto</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Info</Text>
        <View style={styles.infoCard}>
          <InfoRow
            icon="mail-outline"
            label="Email"
            value={profile?.email ?? user?.email ?? ""}
          />
          {(profile?.phone || user?.phone) && (
            <InfoRow
              icon="call-outline"
              label={t("auth.phone")}
              value={profile?.phone ?? user?.phone ?? ""}
            />
          )}
          {(profile?.birthYear || user?.birthYear) && (
            <InfoRow
              icon="calendar-outline"
              label={t("auth.birthYear")}
              value={String(profile?.birthYear ?? user?.birthYear ?? "")}
            />
          )}
          {profile?.coupleSexConfig && (
            <InfoRow
              icon="people-outline"
              label={t("register.step2.coupleConfig")}
              value={profile.coupleSexConfig}
            />
          )}
        </View>
      </View>

      {currentUserType === "biker" && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Cerco</Text>
          <View style={styles.searchPrefRow}>
            {([
              { value: "bikers" as const, label: "Solo Biker", icon: "bicycle" as keyof typeof Ionicons.glyphMap },
              { value: "zavorrine" as const, label: "Solo Zavorrine", icon: "person" as keyof typeof Ionicons.glyphMap },
              { value: "both" as const, label: "Entrambi", icon: "people" as keyof typeof Ionicons.glyphMap },
            ]).map((opt) => {
              const isSelected = searchPreference === opt.value;
              return (
                <Pressable
                  key={opt.value}
                  style={[
                    styles.searchPrefBtn,
                    isSelected && styles.searchPrefBtnActive,
                  ]}
                  onPress={() => searchPreferenceMutation.mutate(opt.value)}
                >
                  <Ionicons
                    name={opt.icon}
                    size={20}
                    color={isSelected ? Colors.background : Colors.textSecondary}
                  />
                  <Text
                    style={[
                      styles.searchPrefLabel,
                      isSelected && styles.searchPrefLabelActive,
                    ]}
                  >
                    {opt.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      )}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Menu</Text>
        <MenuItem icon="create" label="Modifica Profilo" onPress={() => router.push("/profile/edit" as any)} />
        <MenuItem icon="chatbox-ellipses" label={t("feedback.title")} onPress={() => router.push("/feedback" as any)} color={Colors.warning} />

        {(profile?.role === "admin" || (user as any)?.role === "admin") && (
          <MenuItem icon="shield" label="Pannello Admin" onPress={() => router.push("/admin" as any)} color={Colors.accent} />
        )}
        {((profile?.role === "moderator" || (user as any)?.role === "moderator") || (profile?.role === "admin" || (user as any)?.role === "admin")) && (
          <MenuItem icon="eye" label="Pannello Moderatore" onPress={() => router.push("/moderator" as any)} color={Colors.warning} />
        )}

        <MenuItem icon="document-text-outline" label="Privacy Policy" onPress={() => router.push("/privacy-policy" as any)} />
        <MenuItem icon="log-out" label="Logout" onPress={handleLogout} color={Colors.accentRed} />
        <MenuItem icon="trash-outline" label="Elimina account" onPress={handleDeleteAccount} color={Colors.accentRed} />
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

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

function InfoRow({
  icon,
  label,
  value,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
}) {
  return (
    <View style={styles.infoRow}>
      <Ionicons name={icon} size={16} color={Colors.textSecondary} />
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

const screenWidth = Dimensions.get("window").width;
const photoSize = (screenWidth - 32 - 16) / 3;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  profileHeader: {
    alignItems: "center",
    padding: 24,
    paddingTop: 12,
  },
  avatar: {
    width: 96,
    height: 96,
    borderRadius: 48,
    borderWidth: 3,
    backgroundColor: Colors.surface,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  avatarImage: {
    width: 96,
    height: 96,
    borderRadius: 48,
  },
  nickname: {
    fontSize: 24,
    fontFamily: "Inter_700Bold",
    color: Colors.text,
    marginTop: 12,
  },
  badges: {
    flexDirection: "row",
    gap: 8,
    marginTop: 8,
  },
  badge: {
    backgroundColor: Colors.surface,
    paddingVertical: 4,
    paddingHorizontal: 12,
    borderRadius: 12,
  },
  badgeText: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    color: Colors.textSecondary,
  },
  regionBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  section: {
    paddingHorizontal: 16,
    marginTop: 8,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontFamily: "Inter_600SemiBold",
    color: Colors.text,
    marginBottom: 12,
  },
  statsRow: {
    flexDirection: "row",
    backgroundColor: Colors.surface,
    borderRadius: 12,
    paddingVertical: 18,
  },
  statItem: {
    flex: 1,
    alignItems: "center",
    gap: 4,
  },
  statValue: {
    fontSize: 22,
    fontFamily: "Inter_700Bold",
    color: Colors.text,
  },
  statLabel: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    color: Colors.textSecondary,
    textTransform: "uppercase" as const,
    letterSpacing: 0.5,
  },
  statDivider: {
    width: 1,
    backgroundColor: Colors.border,
  },
  bioCard: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  bioText: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    color: Colors.textSecondary,
    lineHeight: 20,
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
  },
  menuLabel: {
    flex: 1,
    fontSize: 16,
    fontFamily: "Inter_500Medium",
    color: Colors.text,
  },
  emptySection: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    paddingVertical: 32,
    alignItems: "center",
    gap: 8,
  },
  emptyText: {
    fontFamily: "Inter_500Medium",
    color: Colors.textSecondary,
    fontSize: 14,
  },
  emptySubtext: {
    fontFamily: "Inter_500Medium",
    color: Colors.textSecondary,
    fontSize: 12,
  },
  motoCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
  },
  motoIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.accent + "18",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  motoInfo: {
    flex: 1,
  },
  motoName: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    color: Colors.text,
  },
  motoDetails: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 4,
  },
  motoDetail: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    color: Colors.textSecondary,
  },
  motoTag: {
    backgroundColor: Colors.accent + "22",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  motoTagText: {
    fontSize: 11,
    color: Colors.accent,
    fontFamily: "Inter_600SemiBold",
  },
  motoRidingStyle: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    color: Colors.textSecondary,
    marginTop: 2,
    fontStyle: "italic" as const,
  },
  photoGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  photoItem: {
    width: photoSize,
    height: photoSize,
    borderRadius: 12,
    overflow: "hidden",
  },
  photoImage: {
    width: "100%",
    height: "100%",
  },
  photoDeleteBtn: {
    position: "absolute",
    top: 6,
    right: 6,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "rgba(0,0,0,0.6)",
    alignItems: "center",
    justifyContent: "center",
  },
  pendingBadge: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "rgba(0,0,0,0.7)",
    paddingVertical: 4,
    alignItems: "center",
  },
  pendingText: {
    fontSize: 10,
    color: Colors.warning,
    fontFamily: "Inter_600SemiBold",
  },
  addPhotoSlot: {
    width: photoSize,
    height: photoSize,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: Colors.border,
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  addPhotoText: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    color: Colors.textSecondary,
  },
  infoCard: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    paddingVertical: 4,
    paddingHorizontal: 16,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border + "44",
    gap: 10,
  },
  infoLabel: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    color: Colors.textSecondary,
    width: 80,
  },
  infoValue: {
    flex: 1,
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    color: Colors.text,
    textAlign: "right",
  },
  searchPrefRow: {
    flexDirection: "row",
    gap: 8,
  },
  searchPrefBtn: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
    gap: 6,
    borderWidth: 2,
    borderColor: Colors.surface,
  },
  searchPrefBtnActive: {
    backgroundColor: Colors.accent,
    borderColor: Colors.accent,
  },
  searchPrefLabel: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    color: Colors.textSecondary,
  },
  searchPrefLabelActive: {
    color: Colors.background,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalContent: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 24,
    alignItems: "center",
    width: 300,
    gap: 16,
  },
  modalTitle: {
    fontSize: 18,
    fontFamily: "Inter_600SemiBold",
    color: Colors.text,
    textAlign: "center",
  },
  modalButtons: {
    flexDirection: "row",
    gap: 12,
    width: "100%",
  },
  modalBtnCancel: {
    flex: 1,
    backgroundColor: Colors.background,
    borderRadius: 10,
    padding: 12,
    alignItems: "center",
  },
  modalBtnCancelText: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    color: Colors.textSecondary,
  },
  modalBtnConfirm: {
    flex: 1,
    backgroundColor: Colors.accentRed,
    borderRadius: 10,
    padding: 12,
    alignItems: "center",
  },
  modalBtnConfirmText: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    color: "#fff",
  },
  deletionBanner: {
    marginHorizontal: 16,
    marginTop: 8,
    backgroundColor: Colors.warning,
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
    gap: 8,
  },
  deletionBannerText: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    color: "#000",
    textAlign: "center",
  },
  deletionCancelBtn: {
    backgroundColor: "#000",
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    marginTop: 4,
  },
  deletionCancelBtnText: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: "#fff",
  },
});
