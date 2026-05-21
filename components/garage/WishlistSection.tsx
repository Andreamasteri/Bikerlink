import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  Modal,
  TextInput,
  Alert,
} from "react-native";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { EdgeInsets } from "react-native-safe-area-context";
import Colors from "@/constants/colors";
import { useAuth } from "@/lib/auth-context";
import { apiRequest, queryClient } from "@/lib/query-client";
import { useT } from "@/lib/language-context";
import MotoPicker from "@/components/MotoPicker";
import { MOTORCYCLE_BRANDS, getModelsForBrand, BRAND_NOTES } from "@/lib/motorcycle-data";

interface WishlistSectionProps {
  insets: EdgeInsets;
  MOTO_TYPES: readonly { value: string }[];
  RIDING_STYLES: readonly { value: string }[];
}

export const WishlistSection: React.FC<WishlistSectionProps> = ({
  insets,
  MOTO_TYPES,
  RIDING_STYLES,
}) => {
  const { user, isLoading: authIsLoading } = useAuth();
  const router = useRouter();
  const t = useT();
  const [showMotoForm, setShowMotoForm] = useState(false);
  const [editingMotoId, setEditingMotoId] = useState<string | null>(null);
  const [description, setDescription] = useState("");
  const [motoForm, setMotoForm] = useState({ brand: "", model: "", motorcycleType: "", ridingStyle: "" });

  const { data, isLoading } = useQuery({
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
          .map((m: any) => `${m.bikerNickname || "Biker"} ${t("garage.hasBike")} ${m.brand} ${m.model}`)
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

  const getMotoTypeLabel = (v: string) => t(`garage.motoType.${v}`) || v;
  const getStyleLabel = (v: string) => t(`garage.style.${v}`) || v;

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
    Alert.alert(t("common.delete"), `${t("garage.deleteFromWishlist")} "${name}"`, [
      { text: t("common.cancel"), style: "cancel" },
      { text: t("common.delete"), style: "destructive", onPress: () => deleteMotoMutation.mutate(id) },
    ]);
  };

  const OptionButton = ({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) => (
    <Pressable style={[styles.optionBtn, selected && styles.optionBtnSelected]} onPress={onPress}>
      <Text style={[styles.optionText, selected && styles.optionTextSelected]}>{label}</Text>
    </Pressable>
  );

  if (isLoading || authIsLoading) {
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
        contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 80 }]}
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
                        <MaterialCommunityIcons name="motorbike" size={14} color={Colors.textSecondary} />
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
          <KeyboardAwareScrollViewCompat keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 100 }} bottomOffset={20}>
              <View style={[styles.modalHeader, { paddingTop: insets.top + 8 }]}>
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
              {BRAND_NOTES[motoForm.brand] ? (
                <View style={styles.brandNoteBox}>
                  <Text style={styles.brandNoteText}>{BRAND_NOTES[motoForm.brand]}</Text>
                </View>
              ) : null}

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
                  <OptionButton key={mt.value} label={t(`garage.motoType.${mt.value}`)} selected={motoForm.motorcycleType === mt.value} onPress={() => setMotoForm(p => ({ ...p, motorcycleType: p.motorcycleType === mt.value ? "" : mt.value }))} />
                ))}
              </View>

              <Text style={styles.label}>{t("garage.ridingStyle")}</Text>
              <View style={styles.optionRow}>
                {RIDING_STYLES.map(s => (
                  <OptionButton key={s.value} label={t(`garage.style.${s.value}`)} selected={motoForm.ridingStyle === s.value} onPress={() => setMotoForm(p => ({ ...p, ridingStyle: s.value }))} />
                ))}
              </View>
          </KeyboardAwareScrollViewCompat>

          <View style={[styles.modalSaveBar, { paddingBottom: insets.bottom + 16 }]}>
            <Pressable style={styles.saveBtn} onPress={handleSaveMoto} disabled={addMotoMutation.isPending || updateMotoMutation.isPending}>
              {(addMotoMutation.isPending || updateMotoMutation.isPending) ? (
                <ActivityIndicator color={Colors.background} />
              ) : (
                <Text style={styles.saveBtnText}>{editingMotoId ? t("garage.saveChanges") : t("garage.addToWishlist")}</Text>
              )}
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
};

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
  detailChip: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: Colors.surfaceLight, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  detailText: { fontSize: 13, fontFamily: "Inter_400Regular", color: Colors.textSecondary },
  empty: { alignItems: "center", paddingTop: 80, paddingHorizontal: 32, gap: 14 },
  emptyText: { fontSize: 20, fontFamily: "Inter_600SemiBold", color: Colors.text, textAlign: "center" },
  emptySubtext: { fontSize: 14, fontFamily: "Inter_400Regular", color: Colors.textSecondary },
  fullscreenModal: { flex: 1, backgroundColor: Colors.background, paddingHorizontal: 24 },
  modalSaveBar: {
    paddingTop: 12,
    paddingHorizontal: 0,
    backgroundColor: Colors.background,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  modalTitle: { fontSize: 20, fontFamily: "Inter_700Bold", color: Colors.text },
  label: { fontSize: 14, fontFamily: "Inter_500Medium", color: Colors.text, marginTop: 12, marginBottom: 6 },
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
  saveBtn: { backgroundColor: Colors.accent, paddingVertical: 16, borderRadius: 10, alignItems: "center", marginTop: 20 },
  saveBtnText: { fontSize: 16, fontFamily: "Inter_600SemiBold", color: Colors.background },
  brandNoteBox: {
    backgroundColor: Colors.warning + "15",
    borderWidth: 1,
    borderColor: Colors.warning + "40",
    borderRadius: 8,
    padding: 10,
    marginTop: 8,
  },
  brandNoteText: { fontSize: 12, fontFamily: "Inter_400Regular", color: Colors.warning },
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
