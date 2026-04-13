import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  Platform,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Image,
  Pressable,
  Modal,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather, Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import Colors from "@/constants/colors";
import { t, type AppLanguage } from "@/lib/i18n";
import { useAuth } from "@/lib/auth-context";
import { useLanguage } from "@/lib/language-context";
import { apiRequest, getApiUrl, queryClient } from "@/lib/query-client";
import { EUROPEAN_COUNTRIES, getRegionsForCountry, findCountryByRegion } from "@/lib/countries-regions";
import { showImagePickerMenu } from "@/lib/image-picker-utils";

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
  }>;
}

const MOTO_TYPES = [
  "Naked", "Sport", "Touring", "Adventure", "Enduro",
  "Cruiser", "Café Racer", "Scrambler", "Custom", "Scooter",
];

const RIDING_STYLES = [
  "Tranquillo", "Moderato", "Sportivo", "Turistico", "Off-road",
];

export default function EditProfileScreen() {
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

  // Clear failed photo state when query is refetched so transient errors don't persist
  useEffect(() => {
    setFailedPhotos(new Set());
  }, [profileQuery.dataUpdatedAt]);

  const [nickname, setNickname] = useState("");
  const [country, setCountry] = useState("");
  const [showCountryPicker, setShowCountryPicker] = useState(false);
  const [region, setRegion] = useState("");
  const [birthYear, setBirthYear] = useState("");
  const [bio, setBio] = useState("");
  const [maxPickupDistance, setMaxPickupDistance] = useState("50");
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
      setMaxPickupDistance(
        profile.profile?.maxPickupDistance
          ? String(profile.profile.maxPickupDistance)
          : "50"
      );
    }
  }, [profile]);

  const updateProfileMutation = useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const res = await apiRequest("PUT", "/api/users/me", data);
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users/me"] });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      Alert.alert(t("common.success"), "Profilo aggiornato");
      router.back();
    },
    onError: (error: Error) => {
      Alert.alert(t("common.error"), error.message);
    },
  });

  const addMotoMutation = useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const res = await apiRequest("POST", "/api/motorcycles", data);
      return await res.json();
    },
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
    onError: (error: Error) => {
      Alert.alert(t("common.error"), error.message);
    },
  });

  const uploadPhotoMutation = useMutation({
    mutationFn: async (uri: string) => {
      const formData = new FormData();
      const filename = uri.split("/").pop() || "photo.jpg";
      const ext = /\.(\w+)$/.exec(filename);
      const mimeType = ext ? `image/${ext[1]}` : "image/jpeg";

      if (Platform.OS === "web") {
        const response = await globalThis.fetch(uri);
        const blob = await response.blob();
        formData.append("photo", blob, filename);
      } else {
        formData.append("photo", { uri, name: filename, type: mimeType } as any);
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
      Alert.alert(t("common.error"), error.message);
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

  const requestDeletionMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/users/me/request-deletion");
    },
    onSuccess: () => {
      Alert.alert(t("profile.accountScheduledDeletion"));
      logoutMutation.mutate(undefined, {
        onSuccess: () => {
          router.replace("/welcome");
        },
      });
    },
  });

  const handleRequestDeletion = useCallback(() => {
    requestDeletionMutation.mutate();
  }, []);

  const handleDeleteAccount = useCallback(() => {
    if (Platform.OS === "web") {
      if (confirm(t("profile.deleteAccountDesc"))) {
        handleRequestDeletion();
      }
    } else {
      Alert.alert(
        t("profile.deleteAccount"),
        t("profile.deleteAccountDesc"),
        [
          { text: t("common.cancel"), style: "cancel" },
          { text: t("common.delete"), style: "destructive", onPress: handleRequestDeletion },
        ]
      );
    }
  }, []);

  const pickImageForSlot = useCallback((existingPhotoId?: string) => {
    showImagePickerMenu(
      async (uri) => {
        if (existingPhotoId) {
          setReplacingSlot(existingPhotoId);
          try {
            await apiRequest("DELETE", `/api/users/me/photos/${existingPhotoId}`);
          } catch {}
        }
        uploadPhotoMutation.mutate(uri, {
          onSettled: () => setReplacingSlot(null),
        });
      },
      { aspect: [1, 1], quality: 0.8 }
    );
  }, []);

  const handleDeletePhoto = useCallback((photoId: string) => {
    Alert.alert(t("profile.deletePhoto"), t("profile.deletePhotoConfirm"), [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("common.delete"),
        style: "destructive",
        onPress: () => deletePhotoMutation.mutate(photoId),
      },
    ]);
  }, []);

  const handleSave = () => {
    const data: Record<string, unknown> = {};
    if (nickname && nickname !== profile?.nickname) data.nickname = nickname;
    if (country !== (profile?.country ?? "")) data.country = country || null;
    if (region !== (profile?.region ?? "")) data.region = region || null;
    if (birthYear !== String(profile?.birthYear ?? "")) {
      data.birthYear = birthYear ? parseInt(birthYear, 10) : null;
    }
    if (bio !== (profile?.profile?.bio ?? "")) data.bio = bio || null;
    const dist = parseInt(maxPickupDistance, 10);
    if (!isNaN(dist) && dist !== (profile?.profile?.maxPickupDistance ?? 50)) {
      data.maxPickupDistance = dist;
    }

    if (Object.keys(data).length === 0) {
      router.back();
      return;
    }
    updateProfileMutation.mutate(data);
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
    addMotoMutation.mutate(data);
  };

  const isBikerOrCoppia =
    (profile?.userType ?? user?.userType) === "biker" ||
    (profile?.userType ?? user?.userType) === "coppia";

  const photos = profile?.photos ?? [];

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={0}
    >
      <View
        style={[
          styles.headerBar,
          { paddingTop: (Platform.OS === "web" ? 67 : insets.top) + 8 },
        ]}
      >
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

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.fieldGroup}>
          <Text style={styles.groupTitle}>Informazioni personali</Text>

          <View style={styles.field}>
            <Text style={styles.fieldLabel}>{t("auth.nickname")}</Text>
            <TextInput
              style={styles.input}
              value={nickname}
              onChangeText={setNickname}
              placeholderTextColor={Colors.textSecondary}
              maxLength={50}
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.fieldLabel}>{t("auth.birthYear")}</Text>
            <TextInput
              style={styles.input}
              value={birthYear}
              onChangeText={setBirthYear}
              placeholder="1990"
              placeholderTextColor={Colors.textSecondary}
              keyboardType="number-pad"
              maxLength={4}
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.fieldLabel}>Paese</Text>
            <TouchableOpacity
              style={styles.selectInput}
              onPress={() => { setShowCountryPicker(!showCountryPicker); setShowRegionPicker(false); }}
              activeOpacity={0.7}
            >
              <Text
                style={[
                  styles.selectText,
                  !country && { color: Colors.textSecondary },
                ]}
              >
                {country ? `${EUROPEAN_COUNTRIES.find(c => c.code === country)?.flag} ${EUROPEAN_COUNTRIES.find(c => c.code === country)?.name}` : "Seleziona paese"}
              </Text>
              <Feather
                name={showCountryPicker ? "chevron-up" : "chevron-down"}
                size={18}
                color={Colors.textSecondary}
              />
            </TouchableOpacity>
            {showCountryPicker && (
              <View style={styles.pickerList}>
                <ScrollView
                  style={{ maxHeight: 200 }}
                  nestedScrollEnabled
                  showsVerticalScrollIndicator
                >
                  {EUROPEAN_COUNTRIES.map((c) => (
                    <TouchableOpacity
                      key={c.code}
                      style={[
                        styles.pickerItem,
                        country === c.code && styles.pickerItemSelected,
                      ]}
                      onPress={() => {
                        setCountry(c.code);
                        setRegion("");
                        setShowCountryPicker(false);
                      }}
                    >
                      <Text
                        style={[
                          styles.pickerItemText,
                          country === c.code && styles.pickerItemTextSelected,
                        ]}
                      >
                        {c.flag} {c.name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            )}
          </View>

          {country && (
            <View style={styles.field}>
              <Text style={styles.fieldLabel}>{t("auth.region")}</Text>
              <TouchableOpacity
                style={styles.selectInput}
                onPress={() => { setShowRegionPicker(!showRegionPicker); setShowCountryPicker(false); }}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.selectText,
                    !region && { color: Colors.textSecondary },
                  ]}
                >
                  {region || "Seleziona regione"}
                </Text>
                <Feather
                  name={showRegionPicker ? "chevron-up" : "chevron-down"}
                  size={18}
                  color={Colors.textSecondary}
                />
              </TouchableOpacity>
              {showRegionPicker && (
                <View style={styles.pickerList}>
                  <ScrollView
                    style={{ maxHeight: 200 }}
                    nestedScrollEnabled
                    showsVerticalScrollIndicator
                  >
                    {getRegionsForCountry(country).map((r) => (
                      <TouchableOpacity
                        key={r.name}
                        style={[
                          styles.pickerItem,
                          region === r.name && styles.pickerItemSelected,
                        ]}
                        onPress={() => {
                          setRegion(r.name);
                          setShowRegionPicker(false);
                        }}
                      >
                        <Text
                          style={[
                            styles.pickerItemText,
                            region === r.name && styles.pickerItemTextSelected,
                          ]}
                        >
                          {r.name}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              )}
            </View>
          )}
        </View>

        <View style={styles.fieldGroup}>
          <Text style={styles.groupTitle}>Bio</Text>
          <TextInput
            style={[styles.input, styles.bioInput]}
            value={bio}
            onChangeText={setBio}
            placeholder="Scrivi qualcosa di te..."
            placeholderTextColor={Colors.textSecondary}
            multiline
            maxLength={500}
            textAlignVertical="top"
          />
          <Text style={styles.charCount}>{bio.length}/500</Text>
        </View>

        <View style={styles.fieldGroup}>
          <Text style={styles.groupTitle}>{t("profile.photos")}</Text>
          <View style={styles.photoGrid}>
            {[0, 1, 2].map((slotIndex) => {
              const photo = photos[slotIndex];
              const isUploading = uploadPhotoMutation.isPending && !photo;
              const isReplacing = photo && replacingSlot === photo.id;
              if (photo) {
                const photoUri = photo.photoUrl.startsWith("http")
                  ? photo.photoUrl
                  : `${getApiUrl()}${photo.photoUrl}`;
                return (
                  <View key={photo.id} style={styles.photoItem}>
                    {failedPhotos.has(photo.id) ? (
                      <View style={styles.photoBroken}>
                        <Ionicons name="image-outline" size={28} color={Colors.textSecondary} />
                      </View>
                    ) : (
                      <Image
                        source={{ uri: photoUri }}
                        style={styles.photoImage}
                        resizeMode="cover"
                        onError={() => setFailedPhotos(prev => new Set(prev).add(photo.id))}
                      />
                    )}
                    {isReplacing && (
                      <View style={styles.photoOverlay}>
                        <ActivityIndicator color="#FFFFFF" />
                      </View>
                    )}
                    <View style={styles.photoActions}>
                      <TouchableOpacity
                        style={styles.photoActionBtn}
                        onPress={() => pickImageForSlot(photo.id)}
                      >
                        <Ionicons name="swap-horizontal" size={14} color="#FFFFFF" />
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.photoActionBtn, { backgroundColor: "rgba(220,50,50,0.8)" }]}
                        onPress={() => handleDeletePhoto(photo.id)}
                      >
                        <Ionicons name="trash" size={14} color="#FFFFFF" />
                      </TouchableOpacity>
                    </View>
                    {!photo.isApproved && (
                      <View style={styles.pendingBadge}>
                        <Text style={styles.pendingText}>In attesa</Text>
                      </View>
                    )}
                    <View style={styles.slotLabel}>
                      <Text style={styles.slotLabelText}>Foto {slotIndex + 1}</Text>
                    </View>
                  </View>
                );
              }
              return (
                <TouchableOpacity
                  key={`empty-${slotIndex}`}
                  style={styles.addPhotoSlot}
                  onPress={() => pickImageForSlot()}
                  activeOpacity={0.7}
                  disabled={isUploading}
                >
                  {isUploading ? (
                    <ActivityIndicator color={Colors.accent} />
                  ) : (
                    <>
                      <Ionicons name="camera-outline" size={24} color={Colors.textSecondary} />
                      <Text style={styles.addPhotoText}>Aggiungi foto</Text>
                    </>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {isBikerOrCoppia && (
          <View style={styles.fieldGroup}>
            <Text style={styles.groupTitle}>{t("profile.motorcycles")}</Text>

            {(profile?.motorcycles ?? []).length > 0 && (
              <View style={styles.motoList}>
                {(profile?.motorcycles ?? []).map((moto) => (
                  <View key={moto.id} style={styles.motoCard}>
                    <MaterialCommunityIcons
                      name="motorbike"
                      size={20}
                      color={Colors.accent}
                    />
                    <View style={styles.motoCardInfo}>
                      <Text style={styles.motoCardTitle}>
                        {moto.brand} {moto.model}
                      </Text>
                      {moto.year && (
                        <Text style={styles.motoCardSub}>{moto.year}</Text>
                      )}
                    </View>
                  </View>
                ))}
              </View>
            )}

            {showAddMoto && (
              <View style={styles.addMotoForm}>
                <View style={styles.motoRow}>
                  <View style={[styles.field, { flex: 1 }]}>
                    <Text style={styles.fieldLabel}>Marca *</Text>
                    <TextInput
                      style={styles.input}
                      value={motoBrand}
                      onChangeText={setMotoBrand}
                      placeholder="es. Ducati"
                      placeholderTextColor={Colors.textSecondary}
                    />
                  </View>
                  <View style={[styles.field, { flex: 1 }]}>
                    <Text style={styles.fieldLabel}>Modello *</Text>
                    <TextInput
                      style={styles.input}
                      value={motoModel}
                      onChangeText={setMotoModel}
                      placeholder="es. Monster"
                      placeholderTextColor={Colors.textSecondary}
                    />
                  </View>
                </View>

                <View style={styles.motoRow}>
                  <View style={[styles.field, { flex: 1 }]}>
                    <Text style={styles.fieldLabel}>Anno</Text>
                    <TextInput
                      style={styles.input}
                      value={motoYear}
                      onChangeText={setMotoYear}
                      placeholder="2023"
                      placeholderTextColor={Colors.textSecondary}
                      keyboardType="number-pad"
                      maxLength={4}
                    />
                  </View>
                  <View style={[styles.field, { flex: 1 }]}>
                    <Text style={styles.fieldLabel}>Cilindrata (cc)</Text>
                    <TextInput
                      style={styles.input}
                      value={motoDisplacement}
                      onChangeText={setMotoDisplacement}
                      placeholder="821"
                      placeholderTextColor={Colors.textSecondary}
                      keyboardType="number-pad"
                    />
                  </View>
                </View>

                <View style={styles.field}>
                  <Text style={styles.fieldLabel}>Tipo moto</Text>
                  <View style={styles.chipRow}>
                    {MOTO_TYPES.map((mt) => (
                      <TouchableOpacity
                        key={mt}
                        style={[
                          styles.chip,
                          motoType === mt && styles.chipSelected,
                        ]}
                        onPress={() =>
                          setMotoType(motoType === mt ? "" : mt)
                        }
                      >
                        <Text
                          style={[
                            styles.chipText,
                            motoType === mt && styles.chipTextSelected,
                          ]}
                        >
                          {mt}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>

                <View style={styles.field}>
                  <Text style={styles.fieldLabel}>Stile di guida</Text>
                  <View style={styles.chipRow}>
                    {RIDING_STYLES.map((rs) => (
                      <TouchableOpacity
                        key={rs}
                        style={[
                          styles.chip,
                          ridingStyle === rs && styles.chipSelected,
                        ]}
                        onPress={() =>
                          setRidingStyle(ridingStyle === rs ? "" : rs)
                        }
                      >
                        <Text
                          style={[
                            styles.chipText,
                            ridingStyle === rs && styles.chipTextSelected,
                          ]}
                        >
                          {rs}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>

                <View style={styles.motoActions}>
                  <TouchableOpacity
                    style={styles.cancelMotoBtn}
                    onPress={() => setShowAddMoto(false)}
                  >
                    <Feather name="x" size={18} color={Colors.textSecondary} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.saveMotoBtn}
                    onPress={handleAddMoto}
                    disabled={addMotoMutation.isPending}
                  >
                    {addMotoMutation.isPending ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                      <>
                        <Ionicons name="checkmark" size={18} color="#FFFFFF" />
                        <Text style={styles.saveMotoText}>
                          {t("profile.addMoto")}
                        </Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {!showAddMoto && (
              <TouchableOpacity
                style={styles.addMotoBtn}
                onPress={() => setShowAddMoto(true)}
                activeOpacity={0.7}
              >
                <Ionicons name="add-circle-outline" size={18} color={Colors.accent} />
                <Text style={styles.addMotoBtnText}>Aggiungi moto</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

          <View style={{ height: 24 }} />

          <View style={styles.langSection}>
            <Pressable
              style={styles.langDropdownTrigger}
              onPress={() => setShowLanguageDropdown(!showLanguageDropdown)}
            >
              <Text style={styles.langDropdownFlag}>
                {({ it: "🇮🇹", en: "🇬🇧", de: "🇩🇪", es: "🇪🇸", fr: "🇫🇷", tr: "🇹🇷" } as Record<string, string>)[language] ?? "🌐"}
              </Text>
              <Text style={styles.langDropdownLabel}>
                {({ it: "Italiano", en: "English", de: "Deutsch", es: "Español", fr: "Français", tr: "Türkçe" } as Record<string, string>)[language] ?? language}
              </Text>
              <Ionicons
                name={showLanguageDropdown ? "chevron-up" : "chevron-down"}
                size={20}
                color={Colors.textSecondary}
              />
            </Pressable>
            {showLanguageDropdown && (
              <View style={styles.langDropdownList}>
                {([
                  { code: "it" as AppLanguage, flag: "🇮🇹", label: "Italiano" },
                  { code: "en" as AppLanguage, flag: "🇬🇧", label: "English" },
                  { code: "de" as AppLanguage, flag: "🇩🇪", label: "Deutsch" },
                  { code: "es" as AppLanguage, flag: "🇪🇸", label: "Español" },
                  { code: "fr" as AppLanguage, flag: "🇫🇷", label: "Français" },
                  { code: "tr" as AppLanguage, flag: "🇹🇷", label: "Türkçe" },
                ]).map((lang) => {
                  const isActive = language === lang.code;
                  return (
                    <Pressable
                      key={lang.code}
                      style={[styles.langDropdownItem, isActive && styles.langDropdownItemActive]}
                      onPress={() => {
                        setLanguage(lang.code);
                        setShowLanguageDropdown(false);
                      }}
                    >
                      <Text style={styles.langDropdownItemFlag}>{lang.flag}</Text>
                      <Text style={[styles.langDropdownItemLabel, isActive && styles.langDropdownItemLabelActive]}>
                        {lang.label}
                      </Text>
                      {isActive && (
                        <Ionicons name="checkmark" size={20} color={Colors.accent} />
                      )}
                    </Pressable>
                  );
                })}
              </View>
            )}
          </View>

          <View style={{ height: 16 }} />

          <Pressable style={styles.dangerMenuItem} onPress={() => setShowRevokeConsentModal(true)}>
            <Ionicons name="shield-checkmark-outline" size={22} color={Colors.accentRed} />
            <Text style={styles.dangerMenuLabel}>{t("profile.revokeConsent")}</Text>
            <Ionicons name="chevron-forward" size={18} color={Colors.textSecondary} />
          </Pressable>

          <Pressable style={[styles.dangerMenuItem, { marginTop: 8 }]} onPress={handleDeleteAccount}>
            <Ionicons name="trash-outline" size={22} color={Colors.accentRed} />
            <Text style={styles.dangerMenuLabel}>{t("profile.deleteAccount")}</Text>
            <Ionicons name="chevron-forward" size={18} color={Colors.textSecondary} />
          </Pressable>

        <View style={{ height: 60 }} />
      </ScrollView>

      <Modal visible={showRevokeConsentModal} transparent animationType="fade" onRequestClose={() => setShowRevokeConsentModal(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setShowRevokeConsentModal(false)}>
          <View style={[styles.modalContent, { maxHeight: "80%" }]}>
            <Ionicons name="shield-checkmark-outline" size={32} color={Colors.accentRed} />
            <Text style={[styles.modalTitle, { fontSize: 16, fontWeight: "700", marginBottom: 8 }]}>{t("profile.revokeConsentTitle")}</Text>
            <Text style={[styles.modalTitle, { fontSize: 13, fontWeight: "400", lineHeight: 20, textAlign: "left" }]}>{t("profile.revokeConsentDesc")}</Text>
            <View style={styles.modalButtons}>
              <Pressable style={styles.modalBtnCancel} onPress={() => setShowRevokeConsentModal(false)}>
                <Text style={styles.modalBtnCancelText}>{t("common.cancel")}</Text>
              </Pressable>
              <Pressable style={styles.modalBtnConfirm} onPress={() => { setShowRevokeConsentModal(false); handleRequestDeletion(); }}>
                <Text style={styles.modalBtnConfirmText}>{t("common.confirm")}</Text>
              </Pressable>
            </View>
          </View>
        </Pressable>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const photoSize = 100;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  headerBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border + "44",
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "700" as const,
    color: Colors.text,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 100,
  },
  fieldGroup: {
    marginBottom: 24,
  },
  groupTitle: {
    fontSize: 16,
    fontWeight: "700" as const,
    color: Colors.text,
    marginBottom: 14,
  },
  field: {
    marginBottom: 14,
  },
  fieldLabel: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginBottom: 6,
    fontWeight: "500" as const,
  },
  input: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: Colors.text,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  bioInput: {
    height: 100,
    paddingTop: 12,
  },
  charCount: {
    fontSize: 11,
    color: Colors.textSecondary,
    textAlign: "right",
    marginTop: 4,
  },
  selectInput: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  selectText: {
    fontSize: 15,
    color: Colors.text,
  },
  pickerList: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    marginTop: 6,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: "hidden",
  },
  pickerItem: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border + "44",
  },
  pickerItemSelected: {
    backgroundColor: Colors.accent + "22",
  },
  pickerItemText: {
    fontSize: 14,
    color: Colors.text,
  },
  pickerItemTextSelected: {
    color: Colors.accent,
    fontWeight: "600" as const,
  },
  photoGrid: {
    flexDirection: "row",
    gap: 10,
    flexWrap: "wrap",
  },
  photoItem: {
    width: photoSize,
    height: photoSize,
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: Colors.surfaceLight,
  },
  photoImage: {
    width: "100%",
    height: "100%",
  },
  photoBroken: {
    width: "100%",
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.surfaceLight,
  },
  photoOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center",
  },
  photoActions: {
    position: "absolute",
    top: 5,
    right: 5,
    flexDirection: "row",
    gap: 5,
  },
  photoActionBtn: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: "rgba(0,0,0,0.6)",
    alignItems: "center",
    justifyContent: "center",
  },
  slotLabel: {
    position: "absolute",
    top: 5,
    left: 5,
    backgroundColor: "rgba(0,0,0,0.5)",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  slotLabelText: {
    fontSize: 10,
    color: "#FFFFFF",
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
    fontWeight: "600" as const,
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
    fontSize: 10,
    color: Colors.textSecondary,
  },
  motoList: {
    gap: 8,
    marginBottom: 12,
  },
  motoCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  motoCardInfo: {
    flex: 1,
  },
  motoCardTitle: {
    fontSize: 14,
    fontWeight: "600" as const,
    color: Colors.text,
  },
  motoCardSub: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  addMotoBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 4,
  },
  addMotoBtnText: {
    fontSize: 15,
    color: Colors.accent,
    fontWeight: "600" as const,
  },
  addMotoForm: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
  },
  motoRow: {
    flexDirection: "row",
    gap: 10,
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: Colors.surfaceLight,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  chipSelected: {
    backgroundColor: Colors.accent + "22",
    borderColor: Colors.accent,
  },
  chipText: {
    fontSize: 13,
    color: Colors.textSecondary,
  },
  chipTextSelected: {
    color: Colors.accent,
    fontWeight: "600" as const,
  },
  motoActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 12,
    marginTop: 8,
  },
  cancelMotoBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: Colors.surfaceLight,
    alignItems: "center",
    justifyContent: "center",
  },
  saveMotoBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: Colors.accent,
  },
  saveMotoText: {
    fontSize: 14,
    color: "#FFFFFF",
    fontWeight: "600" as const,
  },
  langSection: {
    marginBottom: 4,
  },
  langDropdownTrigger: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 14,
    gap: 10,
  },
  langDropdownFlag: {
    fontSize: 22,
  },
  langDropdownLabel: {
    flex: 1,
    fontSize: 16,
    fontWeight: "500" as const,
    color: Colors.text,
  },
  langDropdownList: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    marginTop: 4,
    overflow: "hidden" as const,
  },
  langDropdownItem: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    paddingVertical: 12,
    paddingHorizontal: 14,
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border + "44",
  },
  langDropdownItemActive: {
    backgroundColor: Colors.accent + "12",
  },
  langDropdownItemFlag: {
    fontSize: 20,
  },
  langDropdownItemLabel: {
    flex: 1,
    fontSize: 15,
    fontWeight: "500" as const,
    color: Colors.text,
  },
  langDropdownItemLabelActive: {
    color: Colors.accent,
    fontWeight: "600" as const,
  },
  dangerMenuItem: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 12,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 14,
  },
  dangerMenuLabel: {
    flex: 1,
    fontSize: 16,
    fontWeight: "500" as const,
    color: Colors.accentRed,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center" as const,
    alignItems: "center" as const,
  },
  modalContent: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 24,
    alignItems: "center" as const,
    width: 300,
    gap: 16,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "600" as const,
    color: Colors.text,
    textAlign: "center" as const,
  },
  modalButtons: {
    flexDirection: "row" as const,
    gap: 12,
    width: "100%" as any,
  },
  modalBtnCancel: {
    flex: 1,
    backgroundColor: Colors.background,
    borderRadius: 10,
    padding: 12,
    alignItems: "center" as const,
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
    alignItems: "center" as const,
  },
  modalBtnConfirmText: {
    fontSize: 16,
    fontWeight: "600" as const,
    color: "#fff",
  },
});
