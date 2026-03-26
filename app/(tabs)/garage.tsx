import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  ActivityIndicator,
  RefreshControl,
  Modal,
  TextInput,
  Alert,
  Platform,
} from "react-native";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { useAuth } from "@/lib/auth-context";
import { apiRequest, queryClient } from "@/lib/query-client";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Switch } from "react-native";
import { useT } from "@/lib/language-context";
import MotoPicker from "@/components/MotoPicker";
import { MOTORCYCLE_BRANDS, getModelsForBrand } from "@/lib/motorcycle-data";
import { useRouter } from "expo-router";

const MOTO_TYPES = [
  { value: "sportiva", label: "Sportiva" },
  { value: "supersportiva", label: "Supersportiva" },
  { value: "custom", label: "Custom" },
  { value: "harley", label: "Harley" },
  { value: "touring", label: "Touring" },
  { value: "naked", label: "Naked" },
  { value: "enduro", label: "Enduro" },
  { value: "cafe_racer", label: "Café Racer" },
  { value: "altro", label: "Altro" },
] as const;

const RIDING_STYLES = [
  { value: "passeggio", label: "Passeggio" },
  { value: "tranquilla", label: "Tranquilla" },
  { value: "allegra", label: "Allegra" },
  { value: "mozzafiato", label: "Mozzafiato" },
] as const;

function WishlistScreen() {
  const { user, isLoading: authIsLoading } = useAuth();
  const router = useRouter();
  const t = useT();
  const insets = useSafeAreaInsets();
  const [showMotoForm, setShowMotoForm] = useState(false);
  const [editingMotoId, setEditingMotoId] = useState<string | null>(null);
  const [description, setDescription] = useState("");
  const [motoForm, setMotoForm] = useState({ brand: "", model: "", motorcycleType: "", ridingStyle: "" });

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["/api/wishlist"],
    enabled: !!user,
    refetchOnMount: true,
  });

  const wishlist = (data as any)?.wishlist;
  const motos: any[] = (data as any)?.motos || [];

  React.useEffect(() => {
    if (wishlist?.description && !description) {
      setDescription(wishlist.description);
    }
  }, [wishlist]);

  const descMutation = useMutation({
    mutationFn: async (desc: string) => {
      await apiRequest("PUT", "/api/wishlist", { description: desc });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/wishlist"] });
    },
  });

  const addMotoMutation = useMutation({
    mutationFn: async (motoData: any) => {
      const res = await apiRequest("POST", "/api/wishlist/motos", motoData);
      return res.json();
    },
    onSuccess: (responseData: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/wishlist"] });
      setShowMotoForm(false);
      setMotoForm({ brand: "", model: "", motorcycleType: "", ridingStyle: "" });
      setEditingMotoId(null);
      if (responseData?.matches && responseData.matches.length > 0) {
        const matchInfo = responseData.matches
          .map((m: any) => `${m.bikerNickname || "Biker"} ha ${m.brand} ${m.model}`)
          .join("\n");
        Alert.alert("Here Comes Your Chance!!", matchInfo);
      }
    },
    onError: (err: any) => Alert.alert(t("common.error"), err.message),
  });

  const updateMotoMutation = useMutation({
    mutationFn: async ({ id, data: motoData }: { id: string; data: any }) => {
      await apiRequest("PUT", `/api/wishlist/motos/${id}`, motoData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/wishlist"] });
      setShowMotoForm(false);
      setMotoForm({ brand: "", model: "", motorcycleType: "", ridingStyle: "" });
      setEditingMotoId(null);
    },
  });

  const deleteMotoMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/wishlist/motos/${id}`);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/wishlist"] }),
  });

  const openEditMoto = (moto: any) => {
    setEditingMotoId(moto.id);
    setMotoForm({ brand: moto.brand || "", model: moto.model || "", motorcycleType: moto.motorcycleType || "", ridingStyle: moto.ridingStyle || "" });
    setShowMotoForm(true);
  };

  const getMotoTypeLabel = (v: string) => MOTO_TYPES.find(t => t.value === v)?.label || v;

  const handleSaveMoto = () => {
    const hasBrandModel = motoForm.brand.trim() && motoForm.model.trim();
    const hasType = !!motoForm.motorcycleType;
    if (!hasBrandModel && !hasType) {
      Alert.alert(t("common.error"), t("garage.errorSpecify"));
      return;
    }
    if (editingMotoId) {
      updateMotoMutation.mutate({ id: editingMotoId, data: motoForm });
    } else {
      addMotoMutation.mutate(motoForm);
    }
  };

  const handleDeleteMoto = (id: string, brand: string, model: string, motorcycleType?: string) => {
    const name = brand && model ? `${brand} ${model}` : getMotoTypeLabel(motorcycleType || "");
    if (Platform.OS === "web") {
      if (window.confirm(`${t("garage.deleteFromWishlist")} "${name}"`)) deleteMotoMutation.mutate(id);
    } else {
      Alert.alert(t("common.delete"), `${t("garage.deleteFromWishlist")} "${name}"`, [
        { text: t("common.cancel"), style: "cancel" },
        { text: t("common.delete"), style: "destructive", onPress: () => deleteMotoMutation.mutate(id) },
      ]);
    }
  };

  const OptionButton = ({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) => (
    <Pressable style={[styles.optionBtn, selected && styles.optionBtnSelected]} onPress={onPress}>
      <Text style={[styles.optionText, selected && styles.optionTextSelected]}>{label}</Text>
    </Pressable>
  );

  const getStyleLabel = (v: string) => RIDING_STYLES.find(t => t.value === v)?.label || v;

  if (isLoading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={Colors.accent} />
      </View>
    );
  }

  if (!authIsLoading && user === null) {
    return (
      <View style={[styles.empty, { flex: 1, justifyContent: "center" }]}>
        <Ionicons name="lock-closed-outline" size={64} color={Colors.textSecondary} />
        <Text style={styles.emptyText}>{t("auth.sessionExpired")}</Text>
        <Pressable
          style={sessionExpiredBtn}
          onPress={() => router.replace("/(auth)/login")}
        >
          <Text style={sessionExpiredBtnText}>{t("auth.loginToContinue")}</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <KeyboardAwareScrollViewCompat
        contentContainerStyle={[styles.list, { paddingBottom: Platform.OS === "web" ? 100 : insets.bottom + 80 }]}
        bottomOffset={20}
      >
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Ionicons name="person-circle-outline" size={28} color={Colors.accent} />
            <Text style={styles.motoName}>{t("garage.whoAmI")}</Text>
          </View>
          <TextInput
            style={[styles.input, { marginTop: 12, minHeight: 80, textAlignVertical: "top" }]}
            placeholder={t("garage.descPlaceholder")}
            placeholderTextColor={Colors.textSecondary}
            value={description}
            onChangeText={setDescription}
            multiline
            numberOfLines={4}
          />
          <Pressable
            style={[styles.saveBtn, { marginTop: 12 }]}
            onPress={() => descMutation.mutate(description)}
            disabled={descMutation.isPending}
          >
            {descMutation.isPending ? (
              <ActivityIndicator color={Colors.background} />
            ) : (
              <Text style={styles.saveBtnText}>{t("garage.saveDesc")}</Text>
            )}
          </Pressable>
        </View>

        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Ionicons name="heart-outline" size={28} color={Colors.accent} />
            <View style={styles.cardInfo}>
              <Text style={styles.motoName}>{t("garage.desiredMotos")} ({motos.length}/5)</Text>
            </View>
            {motos.length < 5 && (
              <Pressable onPress={() => { setEditingMotoId(null); setMotoForm({ brand: "", model: "", motorcycleType: "", ridingStyle: "" }); setShowMotoForm(true); }} hitSlop={10}>
                <Ionicons name="add-circle" size={24} color={Colors.accent} />
              </Pressable>
            )}
          </View>

          <View style={wStyles.warningBox}>
            <Ionicons name="information-circle-outline" size={16} color={Colors.accent} />
            <Text style={wStyles.warningText}>
              {t("garage.searchInfo")}
            </Text>
          </View>

          {motos.length === 0 ? (
            <View style={{ alignItems: "center", paddingVertical: 20 }}>
              <Ionicons name="heart-outline" size={40} color={Colors.textSecondary} />
              <Text style={styles.emptySubtext}>{t("garage.noWishlistMoto")}</Text>
            </View>
          ) : (
            motos.map((moto: any) => (
              <Pressable key={moto.id} style={wStyles.motoItem} onPress={() => openEditMoto(moto)}>
                <View style={{ flex: 1 }}>
                  <Text style={wStyles.motoItemTitle}>
                    {moto.brand && moto.model ? `${moto.brand} ${moto.model}` : getMotoTypeLabel(moto.motorcycleType || "")}
                  </Text>
                  <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap", marginTop: 4 }}>
                    {moto.motorcycleType && (
                      <View style={styles.detailChip}>
                        <Ionicons name="bicycle-outline" size={14} color={Colors.textSecondary} />
                        <Text style={styles.detailText}>{getMotoTypeLabel(moto.motorcycleType)}</Text>
                      </View>
                    )}
                    {moto.ridingStyle && (
                      <View style={styles.detailChip}>
                        <Ionicons name="flash-outline" size={14} color={Colors.textSecondary} />
                        <Text style={styles.detailText}>{getStyleLabel(moto.ridingStyle)}</Text>
                      </View>
                    )}
                  </View>
                </View>
                <Pressable onPress={() => handleDeleteMoto(moto.id, moto.brand, moto.model, moto.motorcycleType)} hitSlop={10}>
                  <Ionicons name="trash-outline" size={20} color={Colors.accentRed} />
                </Pressable>
              </Pressable>
            ))
          )}
        </View>
      </KeyboardAwareScrollViewCompat>

      <Modal visible={showMotoForm} animationType="slide" onRequestClose={() => setShowMotoForm(false)}>
        <View style={styles.fullscreenModal}>
          <KeyboardAwareScrollViewCompat keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 40 }} bottomOffset={20}>
              <View style={[styles.modalHeader, { paddingTop: Platform.OS === "web" ? 67 : insets.top + 8 }]}>
                  <Text style={styles.modalTitle}>{editingMotoId ? t("garage.editMoto") : t("garage.addDesiredMoto")}</Text>
                <Pressable onPress={() => setShowMotoForm(false)}>
                  <Ionicons name="close" size={24} color={Colors.textSecondary} />
                </Pressable>
              </View>

              <View style={wStyles.warningBox}>
                <Ionicons name="information-circle-outline" size={16} color={Colors.accent} />
                <Text style={wStyles.warningText}>
                  {t("garage.formInfo")}
                </Text>
              </View>

              <Text style={styles.label}>{t("garage.brand")}</Text>
              <MotoPicker
                value={motoForm.brand}
                onValueChange={(b) => setMotoForm(p => ({ ...p, brand: b, model: "" }))}
                placeholder={t("garage.brandPlaceholder")}
                items={MOTORCYCLE_BRANDS}
                label={t("garage.brand")}
              />

              <Text style={styles.label}>{t("garage.model")}</Text>
              <MotoPicker
                value={motoForm.model}
                onValueChange={(m) => setMotoForm(p => ({ ...p, model: m }))}
                placeholder={motoForm.brand ? t("garage.modelPlaceholder") : t("garage.selectBrandFirst")}
                items={getModelsForBrand(motoForm.brand)}
                disabled={!motoForm.brand}
                label={t("garage.model")}
              />

              <Text style={styles.label}>{t("garage.motoType")}</Text>
              <View style={styles.optionRow}>
                {MOTO_TYPES.map(mt => (
                  <OptionButton key={mt.value} label={mt.label} selected={motoForm.motorcycleType === mt.value} onPress={() => setMotoForm(p => ({ ...p, motorcycleType: p.motorcycleType === mt.value ? "" : mt.value }))} />
                ))}
              </View>

              <Text style={styles.label}>{t("garage.ridingStyle")}</Text>
              <View style={styles.optionRow}>
                {RIDING_STYLES.map(s => (
                  <OptionButton key={s.value} label={s.label} selected={motoForm.ridingStyle === s.value} onPress={() => setMotoForm(p => ({ ...p, ridingStyle: s.value }))} />
                ))}
              </View>

              <Pressable style={styles.saveBtn} onPress={handleSaveMoto} disabled={addMotoMutation.isPending || updateMotoMutation.isPending}>
                {(addMotoMutation.isPending || updateMotoMutation.isPending) ? (
                  <ActivityIndicator color={Colors.background} />
                ) : (
                  <Text style={styles.saveBtnText}>{editingMotoId ? t("garage.saveChanges") : t("garage.addToWishlist")}</Text>
                )}
              </Pressable>
          </KeyboardAwareScrollViewCompat>
        </View>
      </Modal>
    </View>
  );
}

const wStyles = StyleSheet.create({
  warningBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: Colors.warning + "15",
    borderWidth: 1,
    borderColor: Colors.warning + "40",
    borderRadius: 10,
    padding: 12,
    marginTop: 12,
  },
  warningText: { fontSize: 12, fontFamily: "Inter_400Regular", color: Colors.warning, flex: 1 },
  motoItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    gap: 12,
  },
  motoItemTitle: { fontSize: 16, fontFamily: "Inter_600SemiBold", color: Colors.text, marginBottom: 4 },
});

export default function GarageScreen() {
  const { user } = useAuth();

  if (user?.userType === "zavorrina") {
    return <WishlistScreen />;
  }

  return <GarageContent />;
}

function GarageContent() {
  const { user, isLoading: authIsLoading } = useAuth();
  const router = useRouter();
  const t = useT();
  const insets = useSafeAreaInsets();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    brand: "",
    model: "",
    displacement: "",
    motorcycleType: "",
    ridingStyle: "",
    isDefault: false,
    isForSale: false,
    saleDescription: "",
    motoDescription: "",
  });

  const { data: marketplaceData } = useQuery<{ enabled: boolean }>({
    queryKey: ["/api/settings/marketplace-enabled"],
  });
  const marketplaceEnabled = marketplaceData?.enabled !== false;

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["/api/motorcycles"],
    enabled: !!user,
    refetchOnMount: true,
  });

  const motorcycles = Array.isArray(data) ? data : [];

  const saveMutation = useMutation({
    mutationFn: async (motoData: any) => {
      const payload = {
        ...motoData,
        displacement: motoData.displacement ? parseInt(motoData.displacement, 10) : null,
      };
      let res: Response;
      if (editingId) {
        res = await apiRequest("PUT", `/api/motorcycles/${editingId}`, payload);
      } else {
        res = await apiRequest("POST", "/api/motorcycles", payload);
      }
      return res.json();
    },
    onSuccess: async (responseData: any) => {
      await queryClient.refetchQueries({ queryKey: ["/api/motorcycles"] });
      setShowForm(false);
      resetForm();

      if (responseData?.matches && responseData.matches.length > 0) {
        const matchInfo = responseData.matches
          .map((m: any) => `${m.zavarrinaNickname || "Zavorrina"} cerca ${m.brand} ${m.model}`)
          .join("\n");
        Alert.alert("Here Comes Your Chance!!", matchInfo);
      }
    },
    onError: (err: any) => {
      Alert.alert("Errore", err.message || "Errore nel salvataggio");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/motorcycles/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/motorcycles"] });
    },
  });

  const resetForm = () => {
    setForm({ brand: "", model: "", displacement: "", motorcycleType: "", ridingStyle: "", isDefault: false, isForSale: false, saleDescription: "", motoDescription: "" });
    setEditingId(null);
  };

  const openAdd = () => {
    resetForm();
    setShowForm(true);
  };

  const openEdit = (moto: any) => {
    setEditingId(moto.id);
    setForm({
      brand: moto.brand || "",
      model: moto.model || "",
      displacement: moto.displacement ? String(moto.displacement) : "",
      motorcycleType: moto.motorcycleType || "",
      ridingStyle: moto.ridingStyle || "",
      isDefault: moto.isDefault || false,
      isForSale: moto.isForSale || false,
      saleDescription: moto.saleDescription || "",
      motoDescription: moto.motoDescription || "",
    });
    setShowForm(true);
  };

  const handleSave = () => {
    if (!form.brand || !form.model || !form.motorcycleType || !form.ridingStyle) {
      Alert.alert("Errore", "Compila tutti i campi obbligatori");
      return;
    }
    saveMutation.mutate(form);
  };

  const handleDelete = (id: string, displayName: string) => {
    if (Platform.OS === "web") {
      if (window.confirm(`${t("garage.deleteMoto")} "${displayName}"?`)) {
        deleteMutation.mutate(id);
      }
    } else {
      Alert.alert(t("garage.deleteMoto"), `${t("garage.deleteMoto")} "${displayName}"?`, [
        { text: t("common.cancel"), style: "cancel" },
        { text: t("common.delete"), style: "destructive", onPress: () => deleteMutation.mutate(id) },
      ]);
    }
  };

  const OptionButton = ({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) => (
    <Pressable style={[styles.optionBtn, selected && styles.optionBtnSelected]} onPress={onPress}>
      <Text style={[styles.optionText, selected && styles.optionTextSelected]}>{label}</Text>
    </Pressable>
  );

  const getMotoTypeLabel = (v: string) => MOTO_TYPES.find(t => t.value === v)?.label || v;
  const getStyleLabel = (v: string) => RIDING_STYLES.find(t => t.value === v)?.label || v;

  const getMotoDisplayName = (item: any) => {
    const parts = [item.brand, item.model].filter(Boolean);
    const name = parts.join(" ");
    if (item.displacement) {
      return `${name} (${item.displacement} cc)`;
    }
    return name;
  };

  const renderMoto = ({ item }: { item: any }) => {
    const displayName = getMotoDisplayName(item);

    return (
      <Pressable style={styles.card} onPress={() => openEdit(item)}>
        <View style={styles.cardHeader}>
          <Ionicons name="bicycle" size={28} color={Colors.accent} />
          <View style={styles.cardInfo}>
            <Text style={styles.motoName}>{displayName}</Text>
            <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap" }}>
              {item.isDefault && (
                <View style={styles.defaultBadge}>
                  <Text style={styles.defaultBadgeText}>Predefinita</Text>
                </View>
              )}
              {marketplaceEnabled && item.isForSale && (
                <View style={[styles.defaultBadge, { backgroundColor: "#FF980020" }]}>
                  <Ionicons name="pricetag" size={10} color="#FF9800" />
                  <Text style={[styles.defaultBadgeText, { color: "#FF9800" }]}> In Vendita</Text>
                </View>
              )}
            </View>
          </View>
          <Pressable onPress={() => handleDelete(item.id, displayName)} hitSlop={10}>
            <Ionicons name="trash-outline" size={20} color={Colors.accentRed} />
          </Pressable>
        </View>
        <View style={styles.cardDetails}>
          <View style={styles.detailChip}>
            <Ionicons name="speedometer-outline" size={14} color={Colors.textSecondary} />
            <Text style={styles.detailText}>{getMotoTypeLabel(item.motorcycleType)}</Text>
          </View>
          <View style={styles.detailChip}>
            <Ionicons name="flash-outline" size={14} color={Colors.textSecondary} />
            <Text style={styles.detailText}>{getStyleLabel(item.ridingStyle)}</Text>
          </View>
        </View>
      </Pressable>
    );
  };

  if (!authIsLoading && user === null) {
    return (
      <View style={[styles.empty, { flex: 1, justifyContent: "center" }]}>
        <Ionicons name="lock-closed-outline" size={64} color={Colors.textSecondary} />
        <Text style={styles.emptyText}>{t("auth.sessionExpired")}</Text>
        <Pressable
          style={sessionExpiredBtn}
          onPress={() => router.replace("/(auth)/login")}
        >
          <Text style={sessionExpiredBtnText}>{t("auth.loginToContinue")}</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {isLoading ? (
        <View style={styles.loading}>
          <ActivityIndicator size="large" color={Colors.accent} />
        </View>
      ) : (
        <FlatList
          data={motorcycles}
          renderItem={renderMoto}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[styles.list, { paddingBottom: Platform.OS === "web" ? 100 : insets.bottom + 80 }]}
          refreshControl={<RefreshControl refreshing={false} onRefresh={refetch} tintColor={Colors.accent} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="bicycle" size={64} color={Colors.textSecondary} />
              <Text style={styles.emptyText}>{t("garage.noMotoInGarage")}</Text>
              <Text style={styles.emptySubtext}>{t("garage.addFirstMoto")}</Text>
            </View>
          }
          scrollEnabled={motorcycles.length > 0}
        />
      )}

      <Pressable style={[styles.fab, { bottom: Platform.OS === "web" ? 50 : 16 }]} onPress={openAdd}>
        <Ionicons name="add" size={28} color={Colors.background} />
      </Pressable>

      <Modal visible={showForm} animationType="slide" onRequestClose={() => { setShowForm(false); resetForm(); }}>
        <View style={styles.fullscreenModal}>
          <KeyboardAwareScrollViewCompat keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 40 }} bottomOffset={20}>
              <View style={[styles.modalHeader, { paddingTop: Platform.OS === "web" ? 67 : insets.top + 8 }]}>
                <Text style={styles.modalTitle}>{editingId ? t("garage.editMoto") : t("garage.addMoto")}</Text>
                <Pressable onPress={() => { setShowForm(false); resetForm(); }}>
                  <Ionicons name="close" size={24} color={Colors.textSecondary} />
                </Pressable>
              </View>

              <View style={styles.warningBox}>
                <Ionicons name="warning-outline" size={16} color={Colors.warning} />
                <Text style={styles.warningText}>
                  {t("garage.warningMatchingPrecision")}
                </Text>
              </View>

              <Text style={styles.label}>{t("garage.brand")} *</Text>
              <MotoPicker
                value={form.brand}
                onValueChange={(b) => setForm(p => ({ ...p, brand: b, model: "" }))}
                placeholder={t("garage.brandPlaceholder")}
                items={MOTORCYCLE_BRANDS}
                label={t("garage.brand")}
              />

              <Text style={styles.label}>{t("garage.model")} *</Text>
              <MotoPicker
                value={form.model}
                onValueChange={(m) => setForm(p => ({ ...p, model: m }))}
                placeholder={form.brand ? t("garage.modelPlaceholder") : t("garage.selectBrandFirst")}
                items={getModelsForBrand(form.brand)}
                disabled={!form.brand}
                label={t("garage.model")}
              />

              <View style={styles.labelRow}>
                <Text style={styles.label}>{t("garage.displacement")}</Text>
                <Text style={styles.optionalLabel}>{t("common.optional")}</Text>
              </View>
              <TextInput
                style={styles.input}
                placeholder={t("garage.displacementPlaceholder")}
                placeholderTextColor={Colors.textSecondary}
                value={form.displacement}
                onChangeText={(v) => setForm(p => ({ ...p, displacement: v.replace(/[^0-9]/g, "") }))}
                keyboardType="numeric"
              />

              <Text style={styles.label}>{t("garage.motoType")} *</Text>
              <View style={styles.optionRow}>
                {MOTO_TYPES.map(t => (
                  <OptionButton key={t.value} label={t.label} selected={form.motorcycleType === t.value} onPress={() => setForm(p => ({ ...p, motorcycleType: t.value }))} />
                ))}
              </View>

              <Text style={styles.label}>{t("garage.ridingStyle")} *</Text>
              <View style={styles.optionRow}>
                {RIDING_STYLES.map(s => (
                  <OptionButton key={s.value} label={s.label} selected={form.ridingStyle === s.value} onPress={() => setForm(p => ({ ...p, ridingStyle: s.value }))} />
                ))}
              </View>

              <Text style={styles.label}>{t("garage.motoDescription")}</Text>
              <TextInput
                style={[styles.input, { minHeight: 80, textAlignVertical: "top" }]}
                placeholder={t("garage.motoDescriptionPlaceholder")}
                placeholderTextColor={Colors.textSecondary}
                value={form.motoDescription}
                onChangeText={(v) => setForm(p => ({ ...p, motoDescription: v }))}
                multiline
                maxLength={500}
              />

              <Pressable style={styles.defaultRow} onPress={() => setForm(p => ({ ...p, isDefault: !p.isDefault }))}>
                <View style={[styles.checkbox, form.isDefault && styles.checkboxChecked]}>
                  {form.isDefault && <Text style={styles.checkmark}>✓</Text>}
                </View>
                <Text style={styles.defaultLabel}>{t("garage.defaultMoto")}</Text>
              </Pressable>

              {marketplaceEnabled && (
                <>
                  <View style={[styles.defaultRow, { marginTop: 12, borderTopWidth: 1, borderTopColor: Colors.border, paddingTop: 16 }]}>
                    <Switch
                      value={form.isForSale}
                      onValueChange={(val) => setForm(p => ({ ...p, isForSale: val, saleDescription: val ? p.saleDescription : "" }))}
                      trackColor={{ false: Colors.border, true: "#FF9800" }}
                      thumbColor={form.isForSale ? Colors.text : Colors.textSecondary}
                    />
                    <View style={{ marginLeft: 10, flex: 1 }}>
                      <Text style={styles.defaultLabel}>{t("garage.motoForSale")}</Text>
                      <Text style={{ fontSize: 12, fontFamily: "Inter_400Regular", color: Colors.textSecondary, marginTop: 2 }}>
                        {t("garage.motoForSaleDesc")}
                      </Text>
                    </View>
                  </View>
                  {form.isForSale && (
                    <>
                      <Text style={[styles.label, { marginTop: 12 }]}>{t("garage.saleDescription")}</Text>
                      <TextInput
                        style={[styles.input, { minHeight: 80 }]}
                        placeholder={t("garage.salePlaceholder")}
                        placeholderTextColor={Colors.textSecondary}
                        value={form.saleDescription}
                        onChangeText={(v) => setForm(p => ({ ...p, saleDescription: v }))}
                        multiline
                        numberOfLines={3}
                      />
                    </>
                  )}
                </>
              )}

              <Pressable style={styles.saveBtn} onPress={handleSave} disabled={saveMutation.isPending}>
                {saveMutation.isPending ? (
                  <ActivityIndicator color={Colors.background} />
                ) : (
                  <Text style={styles.saveBtnText}>{editingId ? t("garage.saveChanges") : t("garage.addToGarage")}</Text>
                )}
              </Pressable>
          </KeyboardAwareScrollViewCompat>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  loading: { flex: 1, justifyContent: "center", alignItems: "center" },
  list: { padding: 16 },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: 12 },
  cardInfo: { flex: 1 },
  motoName: { fontSize: 18, fontFamily: "Inter_600SemiBold", color: Colors.text },
  defaultBadge: { backgroundColor: Colors.accent + "20", paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8, alignSelf: "flex-start", marginTop: 2 },
  defaultBadgeText: { fontSize: 11, fontFamily: "Inter_500Medium", color: Colors.accent },
  cardDetails: { flexDirection: "row", gap: 12, marginTop: 12 },
  detailChip: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: Colors.surfaceLight, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  detailText: { fontSize: 13, fontFamily: "Inter_400Regular", color: Colors.textSecondary },
  empty: { alignItems: "center", paddingTop: 80, gap: 12 },
  emptyText: { fontSize: 18, fontFamily: "Inter_600SemiBold", color: Colors.textSecondary },
  emptySubtext: { fontSize: 14, fontFamily: "Inter_400Regular", color: Colors.textSecondary },
  fab: {
    position: "absolute",
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.accent,
    alignItems: "center",
    justifyContent: "center",
    elevation: 4,
  },
  fullscreenModal: { flex: 1, backgroundColor: Colors.background, paddingHorizontal: 24 },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  modalTitle: { fontSize: 20, fontFamily: "Inter_700Bold", color: Colors.text },
  warningBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: Colors.warning + "15",
    borderWidth: 1,
    borderColor: Colors.warning + "40",
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
  },
  warningText: { fontSize: 12, fontFamily: "Inter_400Regular", color: Colors.warning, flex: 1 },
  label: { fontSize: 14, fontFamily: "Inter_500Medium", color: Colors.text, marginTop: 12, marginBottom: 6 },
  labelRow: { flexDirection: "row", alignItems: "baseline", gap: 6, marginTop: 12, marginBottom: 6 },
  optionalLabel: { fontSize: 12, fontFamily: "Inter_400Regular", fontStyle: "italic", color: Colors.textSecondary },
  input: {
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 10,
    padding: 14,
    fontSize: 16,
    fontFamily: "Inter_400Regular",
    color: Colors.text,
  },
  optionRow: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  optionBtn: {
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 14,
    marginBottom: 4,
  },
  optionBtnSelected: { borderColor: Colors.accent, backgroundColor: Colors.accent + "20" },
  optionText: { fontSize: 13, fontFamily: "Inter_500Medium", color: Colors.textSecondary },
  optionTextSelected: { color: Colors.accent },
  defaultRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 16 },
  checkbox: { width: 24, height: 24, borderWidth: 2, borderColor: Colors.border, borderRadius: 6, alignItems: "center", justifyContent: "center" },
  checkboxChecked: { borderColor: Colors.accent, backgroundColor: Colors.accent + "20" },
  checkmark: { color: Colors.accent, fontSize: 16, fontFamily: "Inter_700Bold" },
  defaultLabel: { fontSize: 15, fontFamily: "Inter_400Regular", color: Colors.text },
  saveBtn: { backgroundColor: Colors.accent, paddingVertical: 16, borderRadius: 10, alignItems: "center", marginTop: 20 },
  saveBtnText: { fontSize: 16, fontFamily: "Inter_600SemiBold", color: Colors.background },
});

const sessionExpiredBtn = {
  backgroundColor: Colors.accent,
  paddingHorizontal: 24,
  paddingVertical: 12,
  borderRadius: 10,
  alignItems: "center" as const,
  marginTop: 8,
};

const sessionExpiredBtnText = {
  fontSize: 16,
  fontFamily: "Inter_600SemiBold",
  color: "#fff",
};
