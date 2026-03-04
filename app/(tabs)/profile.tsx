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
  FlatList,
  Dimensions,
  RefreshControl,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MaterialCommunityIcons, Feather, Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import * as ImagePicker from "expo-image-picker";
import { Colors } from "@/constants/colors";
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
  profile?: {
    isAvailable: boolean;
    bio?: string;
    totalKm: number;
    totalRides: number;
    easterEggsCollected: number;
    maxPickupDistance?: number;
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

function getUserTypeColor(userType: string): string {
  switch (userType) {
    case "biker":
      return Colors.dark.bikerColor;
    case "zavorrina":
      return Colors.dark.zavorrinaColor;
    case "coppia":
      return Colors.dark.coppiaColor;
    default:
      return Colors.dark.accent;
  }
}

function getUserTypeLabel(userType: string): string {
  switch (userType) {
    case "biker":
      return "Biker";
    case "zavorrina":
      return "Zavorrina";
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

  const profileQuery = useQuery<ProfileData>({
    queryKey: ["/api/users/me"],
    enabled: !!user,
  });

  const profile = profileQuery.data;
  const typeColor = getUserTypeColor(profile?.userType ?? user?.userType ?? "biker");

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

  const handleLogout = useCallback(() => {
    Alert.alert(t("auth.logout"), "Sei sicuro di voler uscire?", [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("auth.logout"),
        style: "destructive",
        onPress: () => logoutMutation.mutate(),
      },
    ]);
  }, []);

  const avatarSource = profile?.avatarUrl
    ? { uri: profile.avatarUrl.startsWith("http") ? profile.avatarUrl : `${getApiUrl()}${profile.avatarUrl}` }
    : profile?.photos && profile.photos.length > 0
    ? { uri: profile.photos[0].photoUrl.startsWith("http") ? profile.photos[0].photoUrl : `${getApiUrl()}${profile.photos[0].photoUrl}` }
    : null;

  const totalRides = profile?.profile?.totalRides ?? 0;
  const totalKm = profile?.profile?.totalKm ?? 0;
  const easterEggs = profile?.profile?.easterEggsCollected ?? 0;
  const isZavorrina = (profile?.userType ?? user?.userType) === "zavorrina";
  const isBikerOrCoppia = (profile?.userType ?? user?.userType) === "biker" || (profile?.userType ?? user?.userType) === "coppia";

  return (
    <View
      style={[
        styles.container,
        { paddingTop: Platform.OS === "web" ? 67 : insets.top },
      ]}
    >
      <View style={styles.header}>
        <View style={{ width: 40 }} />
        <Text style={styles.headerTitle}>{t("profile.title")}</Text>
        <TouchableOpacity
          onPress={() => router.push("/profile/edit" as any)}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Feather name="edit-2" size={22} color={Colors.dark.accent} />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={profileQuery.isRefetching}
            onRefresh={() => profileQuery.refetch()}
            tintColor={Colors.dark.accent}
          />
        }
      >
        <View style={styles.avatarContainer}>
          <TouchableOpacity onPress={pickImage} activeOpacity={0.8}>
            <View style={[styles.avatarCircle, { borderColor: typeColor }]}>
              {avatarSource ? (
                <Image source={avatarSource} style={styles.avatarImage} />
              ) : (
                <MaterialCommunityIcons
                  name="account"
                  size={48}
                  color={Colors.dark.textMuted}
                />
              )}
              <View style={[styles.cameraBadge, { backgroundColor: typeColor }]}>
                <Feather name="camera" size={14} color="#FFFFFF" />
              </View>
            </View>
          </TouchableOpacity>
          {uploadAvatarMutation.isPending && (
            <ActivityIndicator
              size="small"
              color={Colors.dark.accent}
              style={{ marginTop: 8 }}
            />
          )}
          <Text style={styles.nickname}>
            {profile?.nickname ?? user?.nickname ?? ""}
          </Text>
          <View style={[styles.typeBadge, { backgroundColor: typeColor + "22" }]}>
            <Text style={[styles.typeLabel, { color: typeColor }]}>
              {getUserTypeLabel(profile?.userType ?? user?.userType ?? "")}
            </Text>
          </View>
          {profile?.region && (
            <View style={styles.regionRow}>
              <Ionicons name="location-outline" size={14} color={Colors.dark.textSecondary} />
              <Text style={styles.regionText}>{profile.region}</Text>
            </View>
          )}
        </View>

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

        {profile?.profile?.bio ? (
          <View style={styles.bioSection}>
            <Text style={styles.bioText}>{profile.profile.bio}</Text>
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
                <Ionicons name="add-circle-outline" size={24} color={Colors.dark.accent} />
              </TouchableOpacity>
            </View>
            {profile?.motorcycles && profile.motorcycles.length > 0 ? (
              profile.motorcycles.map((moto) => (
                <View key={moto.id} style={styles.motoCard}>
                  <View style={styles.motoIconContainer}>
                    <MaterialCommunityIcons
                      name="motorbike"
                      size={28}
                      color={Colors.dark.accent}
                    />
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
                    <Feather name="trash-2" size={18} color={Colors.dark.error} />
                  </TouchableOpacity>
                </View>
              ))
            ) : (
              <View style={styles.emptySection}>
                <MaterialCommunityIcons
                  name="motorbike"
                  size={32}
                  color={Colors.dark.textMuted}
                />
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
                  <Ionicons name="add-circle-outline" size={24} color={Colors.dark.accent} />
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
                        <Feather name="x" size={14} color="#FFFFFF" />
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
                    <Ionicons name="add" size={32} color={Colors.dark.textMuted} />
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
                <Feather name="image" size={32} color={Colors.dark.textMuted} />
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
              icon="mail"
              label="Email"
              value={profile?.email ?? user?.email ?? ""}
            />
            {(profile?.phone || user?.phone) && (
              <InfoRow
                icon="phone"
                label={t("auth.phone")}
                value={profile?.phone ?? user?.phone ?? ""}
              />
            )}
            {(profile?.birthYear || user?.birthYear) && (
              <InfoRow
                icon="calendar"
                label={t("auth.birthYear")}
                value={String(profile?.birthYear ?? user?.birthYear ?? "")}
              />
            )}
            {profile?.coupleSexConfig && (
              <InfoRow
                icon="users"
                label={t("register.step2.coupleConfig")}
                value={profile.coupleSexConfig}
              />
            )}
          </View>
        </View>

        <TouchableOpacity
          style={styles.feedbackButton}
          onPress={() => router.push("/feedback" as any)}
          activeOpacity={0.7}
        >
          <Feather name="message-circle" size={20} color={Colors.dark.accent} />
          <Text style={styles.feedbackText}>{t("feedback.title")}</Text>
          <Feather name="chevron-right" size={18} color={Colors.dark.textMuted} />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.logoutButton}
          onPress={handleLogout}
          activeOpacity={0.7}
        >
          <MaterialCommunityIcons
            name="logout"
            size={20}
            color={Colors.dark.error}
          />
          <Text style={styles.logoutText}>{t("auth.logout")}</Text>
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

function InfoRow({
  icon,
  label,
  value,
}: {
  icon: string;
  label: string;
  value: string;
}) {
  return (
    <View style={styles.infoRow}>
      <Feather name={icon as any} size={16} color={Colors.dark.textMuted} />
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
    backgroundColor: Colors.dark.background,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "700" as const,
    color: Colors.dark.text,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 100,
  },
  avatarContainer: {
    alignItems: "center",
    paddingVertical: 16,
    gap: 6,
  },
  avatarCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: Colors.dark.surface,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 3,
    overflow: "hidden",
  },
  avatarImage: {
    width: 96,
    height: 96,
    borderRadius: 48,
  },
  cameraBadge: {
    position: "absolute",
    bottom: 2,
    right: 2,
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: Colors.dark.background,
  },
  nickname: {
    fontSize: 24,
    fontWeight: "700" as const,
    color: Colors.dark.text,
    marginTop: 4,
  },
  typeBadge: {
    paddingHorizontal: 14,
    paddingVertical: 4,
    borderRadius: 12,
  },
  typeLabel: {
    fontSize: 13,
    fontWeight: "700" as const,
    textTransform: "uppercase" as const,
    letterSpacing: 1,
  },
  regionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 2,
  },
  regionText: {
    fontSize: 13,
    color: Colors.dark.textSecondary,
  },
  statsRow: {
    flexDirection: "row",
    backgroundColor: Colors.dark.surface,
    borderRadius: 16,
    paddingVertical: 18,
    marginBottom: 20,
  },
  statItem: {
    flex: 1,
    alignItems: "center",
    gap: 4,
  },
  statValue: {
    fontSize: 22,
    fontWeight: "700" as const,
    color: Colors.dark.text,
  },
  statLabel: {
    fontSize: 11,
    color: Colors.dark.textSecondary,
    textTransform: "uppercase" as const,
    letterSpacing: 0.5,
  },
  statDivider: {
    width: 1,
    backgroundColor: Colors.dark.border,
  },
  bioSection: {
    backgroundColor: Colors.dark.surface,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 20,
  },
  bioText: {
    fontSize: 14,
    color: Colors.dark.textSecondary,
    lineHeight: 20,
  },
  section: {
    marginBottom: 20,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: "700" as const,
    color: Colors.dark.text,
  },
  emptySection: {
    backgroundColor: Colors.dark.surface,
    borderRadius: 12,
    paddingVertical: 32,
    alignItems: "center",
    gap: 8,
  },
  emptyText: {
    color: Colors.dark.textMuted,
    fontSize: 14,
  },
  emptySubtext: {
    color: Colors.dark.textMuted,
    fontSize: 12,
  },
  motoCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.dark.surface,
    borderRadius: 14,
    padding: 14,
    marginBottom: 8,
  },
  motoIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.dark.accent + "18",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  motoInfo: {
    flex: 1,
  },
  motoName: {
    fontSize: 16,
    fontWeight: "600" as const,
    color: Colors.dark.text,
  },
  motoDetails: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 4,
  },
  motoDetail: {
    fontSize: 13,
    color: Colors.dark.textSecondary,
  },
  motoTag: {
    backgroundColor: Colors.dark.accent + "22",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  motoTagText: {
    fontSize: 11,
    color: Colors.dark.accent,
    fontWeight: "600" as const,
  },
  motoRidingStyle: {
    fontSize: 12,
    color: Colors.dark.textMuted,
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
    color: Colors.dark.warning,
    fontWeight: "600" as const,
  },
  addPhotoSlot: {
    width: photoSize,
    height: photoSize,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: Colors.dark.border,
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  addPhotoText: {
    fontSize: 11,
    color: Colors.dark.textMuted,
  },
  infoCard: {
    backgroundColor: Colors.dark.surface,
    borderRadius: 14,
    paddingVertical: 4,
    paddingHorizontal: 16,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border + "44",
    gap: 10,
  },
  infoLabel: {
    fontSize: 13,
    color: Colors.dark.textMuted,
    width: 80,
  },
  infoValue: {
    flex: 1,
    fontSize: 14,
    color: Colors.dark.text,
    textAlign: "right",
  },
  feedbackButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.dark.surface,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginBottom: 12,
    gap: 10,
  },
  feedbackText: {
    flex: 1,
    color: Colors.dark.text,
    fontSize: 15,
    fontWeight: "500" as const,
  },
  logoutButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: Colors.dark.surface,
    borderRadius: 12,
    paddingVertical: 14,
  },
  logoutText: {
    color: Colors.dark.error,
    fontSize: 16,
    fontWeight: "600" as const,
  },
});
