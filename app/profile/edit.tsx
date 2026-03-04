import React, { useState, useEffect } from "react";
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
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather, Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import Colors from "@/constants/colors";
import { t } from "@/lib/i18n";
import { useAuth } from "@/lib/auth-context";
import { apiRequest, queryClient } from "@/lib/query-client";

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
  profile?: {
    bio?: string;
    maxPickupDistance?: number;
  };
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

const REGIONS = [
  "Abruzzo", "Basilicata", "Calabria", "Campania", "Emilia-Romagna",
  "Friuli Venezia Giulia", "Lazio", "Liguria", "Lombardia", "Marche",
  "Molise", "Piemonte", "Puglia", "Sardegna", "Sicilia",
  "Toscana", "Trentino-Alto Adige", "Umbria", "Valle d'Aosta", "Veneto",
];

const MOTO_TYPES = [
  "Naked", "Sport", "Touring", "Adventure", "Enduro",
  "Cruiser", "Cafe Racer", "Scrambler", "Custom", "Scooter",
];

const RIDING_STYLES = [
  "Tranquillo", "Moderato", "Sportivo", "Turistico", "Off-road",
];

export default function EditProfileScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams();
  const { user } = useAuth();

  const profileQuery = useQuery<ProfileData>({
    queryKey: ["/api/users/me"],
    enabled: !!user,
  });

  const profile = profileQuery.data;

  const [nickname, setNickname] = useState("");
  const [phone, setPhone] = useState("");
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

  useEffect(() => {
    if (profile) {
      setNickname(profile.nickname ?? "");
      setPhone(profile.phone ?? "");
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

  const handleSave = () => {
    const data: Record<string, unknown> = {};
    if (nickname && nickname !== profile?.nickname) data.nickname = nickname;
    if (phone !== (profile?.phone ?? "")) data.phone = phone || null;
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
            <Text style={styles.fieldLabel}>{t("auth.phone")}</Text>
            <TextInput
              style={styles.input}
              value={phone}
              onChangeText={setPhone}
              placeholder="+39..."
              placeholderTextColor={Colors.textSecondary}
              keyboardType="phone-pad"
              maxLength={30}
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
            <Text style={styles.fieldLabel}>{t("auth.region")}</Text>
            <TouchableOpacity
              style={styles.selectInput}
              onPress={() => setShowRegionPicker(!showRegionPicker)}
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
                  {REGIONS.map((r) => (
                    <TouchableOpacity
                      key={r}
                      style={[
                        styles.pickerItem,
                        region === r && styles.pickerItemSelected,
                      ]}
                      onPress={() => {
                        setRegion(r);
                        setShowRegionPicker(false);
                      }}
                    >
                      <Text
                        style={[
                          styles.pickerItemText,
                          region === r && styles.pickerItemTextSelected,
                        ]}
                      >
                        {r}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            )}
          </View>
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

        {isBikerOrCoppia && (
          <View style={styles.fieldGroup}>
            <View style={styles.groupHeader}>
              <Text style={styles.groupTitle}>{t("profile.motorcycles")}</Text>
              {!showAddMoto && (
                <TouchableOpacity onPress={() => setShowAddMoto(true)}>
                  <Ionicons
                    name="add-circle-outline"
                    size={24}
                    color={Colors.accent}
                  />
                </TouchableOpacity>
              )}
            </View>

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
          </View>
        )}

        <View style={{ height: 60 }} />
      </ScrollView>
    </KeyboardAvoidingView>
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
  groupHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
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
  addMotoForm: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 14,
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
});
