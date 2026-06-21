import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Modal,
  Pressable,
} from "react-native";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import Colors from "@/constants/colors";
import { useAuth } from "@/lib/auth-context";
import { useLanguage } from "@/lib/language-context";
import { getApiUrl, queryClient } from "@/lib/query-client";
import { findCountryByRegion } from "@/lib/countries-regions";
import { showImagePickerMenu, appendFileToForm } from "@/lib/image-picker-utils";
import { useT } from "@/lib/language-context";
import { updateUserSchema } from "@shared/validators";
import { useMutation } from "@tanstack/react-query";

import { EditBasicInfo } from "@/components/profile/edit/EditBasicInfo";
import { EditMoto } from "@/components/profile/edit/EditMoto";
import { EditLocation } from "@/components/profile/edit/EditLocation";
import { EditPreferences } from "@/components/profile/edit/EditPreferences";
import { EditAssistantPrefs } from "@/components/profile/edit/EditAssistantPrefs";
import { EditTags } from "@/components/profile/edit/EditTags";
import { useEditProfileMutations } from "@/hooks/useEditProfileMutations";
import { useFloatingWidget } from "@/lib/floating-widget-context";

interface ProfileData {
  id: string;
  nickname: string;
  email: string;
  userType: string;
  sex?: string;
  coupleSexConfig?: string;
  birthYear?: number;
  region?: string;
  country?: string;
  avatarUrl?: string;
  profile?: {
    bio?: string;
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
  }>;
}

export default function EditProfileScreen() {
  const t = useT();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams();
  const { user, logoutMutation } = useAuth();
  const { language, setLanguage } = useLanguage();

  const profileQuery = useQuery<ProfileData>({
    queryKey: ["/api/users/me"],
    enabled: !!user,
  });

  const profile = profileQuery.data;
  const [failedPhotos, setFailedPhotos] = useState<Set<string>>(new Set());

  useEffect(() => {
    setFailedPhotos(new Set());
  }, [profileQuery.dataUpdatedAt]);

  const [nickname, setNickname] = useState("");
  const [country, setCountry] = useState("");
  const [showCountryPicker, setShowCountryPicker] = useState(false);
  const [region, setRegion] = useState("");
  const [birthYear, setBirthYear] = useState("");
  const [bio, setBio] = useState("");
  const [showRegionPicker, setShowRegionPicker] = useState(false);
  const [showAddMoto, setShowAddMoto] = useState(params.addMoto === "true");

  const [motoBrand, setMotoBrand] = useState("");
  const [motoModel, setMotoModel] = useState("");
  const [motoYear, setMotoYear] = useState("");
  const [motoDisplacement, setMotoDisplacement] = useState("");
  const [motoType, setMotoType] = useState("");
  const [ridingStyle, setRidingStyle] = useState("");
  const [showLanguageDropdown, setShowLanguageDropdown] = useState(false);
  const [showRevokeConsentModal, setShowRevokeConsentModal] = useState(false);

  const [replacingSlot, setReplacingSlot] = useState<string | null>(null);
  const [optimisticPhoto, setOptimisticPhoto] = useState<{
    uri: string;
    replaceId: string | null;
  } | null>(null);
  const uploadTokenRef = useRef(0);

  useEffect(() => {
    if (profile) {
      setNickname(profile.nickname ?? "");
      if (profile.country) {
        setCountry(profile.country);
      } else if (profile.region) {
        const guessed = findCountryByRegion(profile.region);
        if (guessed) setCountry(guessed);
      }
      setRegion(profile.region ?? "");
      setBirthYear(profile.birthYear ? String(profile.birthYear) : "");
      setBio(profile.profile?.bio ?? "");
    }
  }, [profile]);

  const {
    updateProfileMutation,
    addMotoMutation,
    deletePhotoMutation,
    requestDeletionMutation,
  } = useEditProfileMutations();

  const { enabled: widgetEnabled, setEnabled: setWidgetEnabled, isUpdating: isUpdatingWidget } = useFloatingWidget();

  const { data: adminWidgetData } = useQuery<{ enabled: boolean }>({
    queryKey: ["/api/settings/floating-widget"],
    staleTime: 60_000,
  });
  const adminWidgetEnabled = adminWidgetData?.enabled !== false;

  const uploadPhotoMutation = useMutation({
    mutationFn: async ({ uri, replacePhotoId }: { uri: string; replacePhotoId?: string }) => {
      const formData = new FormData();
      const filename = uri.split("/").pop() || "photo.jpg";
      const ext = /\.(\w+)$/.exec(filename);
      const mimeType = ext ? `image/${ext[1]}` : "image/jpeg";

      await appendFileToForm(formData, "photo", uri, mimeType, filename);
      if (replacePhotoId) {
        formData.append("replacePhotoId", replacePhotoId);
      }

      const baseUrl = getApiUrl();
      const url = new URL("/api/users/me/photos", baseUrl);
      const res = await globalThis.fetch(url.toString(), {
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
    onError: (error: Error) => {
      let msg = (error as Error).message;
      try {
        const parsed = JSON.parse(msg);
        if (parsed?.message) msg = parsed.message;
      } catch {
        // no-op
      }
      Alert.alert(t("common.error"), msg);
    },
  });

  const handleRequestDeletion = useCallback(() => {
    requestDeletionMutation.mutate(undefined, {
      onSuccess: () => {
        Alert.alert(t("profile.accountScheduledDeletion"));
        logoutMutation.mutate(undefined, {
          onSuccess: () => {
            router.replace("/welcome");
          },
        });
      },
    });
  }, [requestDeletionMutation, logoutMutation, router, t]);

  const handleDeleteAccount = useCallback(() => {
    Alert.alert(
      t("profile.deleteAccount"),
      t("profile.deleteAccountDesc"),
      [
        { text: t("common.cancel"), style: "cancel" },
        { text: t("common.delete"), style: "destructive", onPress: handleRequestDeletion },
      ]
    );
  }, [t, handleRequestDeletion]);

  const pickImageForSlot = useCallback((existingPhotoId?: string) => {
    showImagePickerMenu(
      (uri) => {
        const token = ++uploadTokenRef.current;
        setOptimisticPhoto({ uri, replaceId: existingPhotoId ?? null });
        if (existingPhotoId) {
          setReplacingSlot(existingPhotoId);
        }
        uploadPhotoMutation.mutate(
          { uri, replacePhotoId: existingPhotoId },
          {
            onSettled: () => {
              if (uploadTokenRef.current !== token) return;
              setReplacingSlot(null);
              setOptimisticPhoto(null);
            },
          }
        );
      },
      { aspect: [1, 1], quality: 0.5 }
    );
  }, [uploadPhotoMutation]);

  const handleDeletePhoto = useCallback((photoId: string) => {
    Alert.alert(t("profile.deletePhoto"), t("profile.deletePhotoConfirm"), [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("common.delete"),
        style: "destructive",
        onPress: () => deletePhotoMutation.mutate(photoId),
      },
    ]);
  }, [t, deletePhotoMutation]);

  const handleSave = () => {
    const data: Record<string, unknown> = {};
    if (nickname && nickname !== profile?.nickname) data.nickname = nickname;
    if (country !== (profile?.country ?? "")) data.country = country || null;
    if (region !== (profile?.region ?? "")) data.region = region || null;
    if (birthYear !== String(profile?.birthYear ?? "")) {
      data.birthYear = birthYear ? parseInt(birthYear, 10) : null;
    }
    if (bio !== (profile?.profile?.bio ?? "")) data.bio = bio || null;

    if (Object.keys(data).length === 0) {
      router.back();
      return;
    }

    const parsed = updateUserSchema.safeParse(data);
    if (!parsed.success) {
      Alert.alert(t("common.error"), parsed.error.issues[0]?.message ?? "Dati non validi");
      return;
    }
    updateProfileMutation.mutate(parsed.data as Record<string, unknown>);
  };

  const handleAddMoto = () => {
    if (!motoBrand.trim() || !motoModel.trim()) {
      Alert.alert(t("common.error"), "Marca e modello sono obbligatori");
      return;
    }
    const data: Record<string, unknown> = {
      brand: motoBrand.trim(),
      model: motoModel.trim(),
    };
    if (motoYear) data.year = parseInt(motoYear, 10);
    if (motoDisplacement) data.displacement = parseInt(motoDisplacement, 10);
    if (motoType) data.motorcycleType = motoType;
    if (ridingStyle) data.ridingStyle = ridingStyle;
    addMotoMutation.mutate(data, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/users/me"] });
        setShowAddMoto(false);
        setMotoBrand("");
        setMotoModel("");
        setMotoYear("");
        setMotoDisplacement("");
        setMotoType("");
        setRidingStyle("");
        Alert.alert(t("common.success"), "Moto aggiunta");
      },
    });
  };

  const isBikerOrCoppia =
    (profile?.userType ?? user?.userType) === "biker" ||
    (profile?.userType ?? user?.userType) === "coppia";

  const photos = useMemo(() => profile?.photos ?? [], [profile?.photos]);

  const OPTIMISTIC_PHOTO_ID = "__optimistic__";
  const displayPhotos = useMemo(() => {
    if (!optimisticPhoto) return photos;
    if (optimisticPhoto.replaceId) {
      return photos.map((p) =>
        p.id === optimisticPhoto.replaceId
          ? { ...p, photoUrl: optimisticPhoto.uri, isApproved: true }
          : p
      );
    }
    return [
      ...photos,
      {
        id: OPTIMISTIC_PHOTO_ID,
        photoUrl: optimisticPhoto.uri,
        sortOrder: photos.length,
        isApproved: true,
      },
    ];
  }, [photos, optimisticPhoto]);

  return (
    <View style={styles.container}>
      <View style={[styles.headerBar, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity
          onPress={() => router.back()}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Ionicons name="arrow-back" size={24} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t("profile.edit")}</Text>
        <TouchableOpacity
          onPress={handleSave}
          disabled={updateProfileMutation.isPending}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          {updateProfileMutation.isPending ? (
            <ActivityIndicator size="small" color={Colors.accent} />
          ) : (
            <Ionicons name="checkmark" size={26} color={Colors.accent} />
          )}
        </TouchableOpacity>
      </View>

      <KeyboardAwareScrollViewCompat
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        bottomOffset={24}
      >
        <EditBasicInfo
          nickname={nickname}
          setNickname={setNickname}
          birthYear={birthYear}
          setBirthYear={setBirthYear}
          bio={bio}
          setBio={setBio}
          photos={displayPhotos}
          uploadPhotoMutation={uploadPhotoMutation}
          pickImageForSlot={pickImageForSlot}
          handleDeletePhoto={handleDeletePhoto}
          failedPhotos={failedPhotos}
          setFailedPhotos={setFailedPhotos}
          replacingSlot={replacingSlot}
        />

        <EditLocation
          country={country}
          setCountry={setCountry}
          showCountryPicker={showCountryPicker}
          setShowCountryPicker={setShowCountryPicker}
          region={region}
          setRegion={setRegion}
          showRegionPicker={showRegionPicker}
          setShowRegionPicker={setShowRegionPicker}
        />

        <EditMoto
          isBikerOrCoppia={isBikerOrCoppia}
          motorcycles={profile?.motorcycles ?? []}
          showAddMoto={showAddMoto}
          setShowAddMoto={setShowAddMoto}
          motoBrand={motoBrand}
          setMotoBrand={setMotoBrand}
          motoModel={motoModel}
          setMotoModel={setMotoModel}
          motoYear={motoYear}
          setMotoYear={setMotoYear}
          motoDisplacement={motoDisplacement}
          setMotoDisplacement={setMotoDisplacement}
          motoType={motoType}
          setMotoType={setMotoType}
          ridingStyle={ridingStyle}
          setRidingStyle={setRidingStyle}
          handleAddMoto={handleAddMoto}
          isPending={addMotoMutation.isPending}
        />

        <EditPreferences
          language={language}
          setLanguage={setLanguage}
          showLanguageDropdown={showLanguageDropdown}
          setShowLanguageDropdown={setShowLanguageDropdown}
          handleDeleteAccount={handleDeleteAccount}
          setShowRevokeConsentModal={setShowRevokeConsentModal}
        />

        <EditTags />

        <EditAssistantPrefs
          widgetEnabled={widgetEnabled}
          onToggleWidget={setWidgetEnabled}
          adminWidgetEnabled={adminWidgetEnabled}
          isUpdatingWidget={isUpdatingWidget}
        />

        <View style={{ height: 40 }} />
      </KeyboardAwareScrollViewCompat>

      <Modal
        visible={showRevokeConsentModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowRevokeConsentModal(false)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setShowRevokeConsentModal(false)}
        >
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Revoca consensi privacy</Text>
            <Text style={styles.modalBody}>
              Questa azione revocherà i consensi obbligatori per l'uso dell'app.
              Verrai disconnesso e il tuo account verrà programmato per la
              cancellazione automatica tra 30 giorni.
            </Text>
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.modalBtnCancel}
                onPress={() => setShowRevokeConsentModal(false)}
              >
                <Text style={styles.modalBtnCancelText}>{t("common.cancel")}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalBtnConfirm}
                onPress={() => {
                  setShowRevokeConsentModal(false);
                  handleRequestDeletion();
                }}
              >
                <Text style={styles.modalBtnConfirmText}>Revoca e disconnetti</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  headerBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 12,
    backgroundColor: Colors.background,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "700" as const,
    color: Colors.text,
  },
  scrollContent: {
    padding: 20,
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
    fontWeight: "600" as const,
    color: Colors.text,
    textAlign: "center",
  },
  modalBody: {
    fontSize: 14,
    color: Colors.textSecondary,
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
    fontWeight: "600" as const,
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
    fontWeight: "600" as const,
    color: "#fff",
  },
});
