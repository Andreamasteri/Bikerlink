import React from "react";
import { View, Text, StyleSheet, Pressable, Modal, ActivityIndicator, TextInput, Switch } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import Colors from "@/constants/colors";
import { useT } from "@/lib/language-context";
import MotoPicker from "@/components/MotoPicker";
import { MOTORCYCLE_BRANDS, getModelsForBrand, BRAND_NOTES } from "@/lib/motorcycle-data";
import { EdgeInsets } from "react-native-safe-area-context";

interface AddMotoFormProps {
  visible: boolean;
  onClose: () => void;
  form: any;
  setForm: React.Dispatch<React.SetStateAction<any>>;
  editingId: string | null;
  onSave: () => void;
  isPending: boolean;
  insets: EdgeInsets;
  marketplaceEnabled: boolean;
  MOTO_TYPES: readonly { value: string }[];
  RIDING_STYLES: readonly { value: string }[];
}

export const AddMotoForm: React.FC<AddMotoFormProps> = ({
  visible,
  onClose,
  form,
  setForm,
  editingId,
  onSave,
  isPending,
  insets,
  marketplaceEnabled,
  MOTO_TYPES,
  RIDING_STYLES,
}) => {
  const t = useT();

  const OptionButton = ({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) => (
    <Pressable style={[styles.optionBtn, selected && styles.optionBtnSelected]} onPress={onPress}>
      <Text style={[styles.optionText, selected && styles.optionTextSelected]}>{label}</Text>
    </Pressable>
  );

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.fullscreenModal}>
        <KeyboardAwareScrollViewCompat keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 100 }} bottomOffset={20}>
          <View style={[styles.modalHeader, { paddingTop: insets.top + 8 }]}>
            <Text style={styles.modalTitle}>{editingId ? t("garage.editMoto") : t("garage.addMoto")}</Text>
            <Pressable onPress={onClose}>
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
            onValueChange={(b) => setForm((p: any) => ({ ...p, brand: b, model: "" }))}
            placeholder={t("garage.brandPlaceholder")}
            items={MOTORCYCLE_BRANDS}
            label={t("garage.brand")}
          />
          {BRAND_NOTES[form.brand] ? (
            <View style={styles.brandNoteBox}>
              <Text style={styles.brandNoteText}>{BRAND_NOTES[form.brand]}</Text>
            </View>
          ) : null}

          <Text style={styles.label}>{t("garage.model")} *</Text>
          <MotoPicker
            value={form.model}
            onValueChange={(m) => setForm((p: any) => ({ ...p, model: m }))}
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
            onChangeText={(v) => setForm((p: any) => ({ ...p, displacement: v.replace(/[^0-9]/g, "") }))}
            keyboardType="numeric"
          />

          <Text style={styles.label}>{t("garage.motoType")} *</Text>
          <View style={styles.optionRow}>
            {MOTO_TYPES.map(mt => (
              <OptionButton key={mt.value} label={t(`garage.motoType.${mt.value}`)} selected={form.motorcycleType === mt.value} onPress={() => setForm((p: any) => ({ ...p, motorcycleType: mt.value }))} />
            ))}
          </View>

          <Text style={styles.label}>{t("garage.ridingStyle")} *</Text>
          <View style={styles.optionRow}>
            {RIDING_STYLES.map(s => (
              <OptionButton key={s.value} label={t(`garage.style.${s.value}`)} selected={form.ridingStyle === s.value} onPress={() => setForm((p: any) => ({ ...p, ridingStyle: s.value }))} />
            ))}
          </View>

          <Text style={styles.label}>{t("garage.motoDescription")}</Text>
          <TextInput
            style={[styles.input, { minHeight: 80, textAlignVertical: "top" }]}
            placeholder={t("garage.motoDescriptionPlaceholder")}
            placeholderTextColor={Colors.textSecondary}
            value={form.motoDescription}
            onChangeText={(v) => setForm((p: any) => ({ ...p, motoDescription: v }))}
            multiline
            maxLength={500}
          />

          <Pressable style={styles.defaultRow} onPress={() => setForm((p: any) => ({ ...p, isDefault: !p.isDefault }))}>
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
                  onValueChange={(val) => setForm((p: any) => ({ ...p, isForSale: val, saleDescription: val ? p.saleDescription : "" }))}
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
                    onChangeText={(v) => setForm((p: any) => ({ ...p, saleDescription: v }))}
                    multiline
                    numberOfLines={3}
                  />
                </>
              )}
            </>
          )}
        </KeyboardAwareScrollViewCompat>

        <View style={[styles.modalSaveBar, { paddingBottom: insets.bottom + 16 }]}>
          <Pressable style={styles.saveBtn} onPress={onSave} disabled={isPending}>
            {isPending ? (
              <ActivityIndicator color={Colors.background} />
            ) : (
              <Text style={styles.saveBtnText}>{editingId ? t("garage.saveChanges") : t("garage.addToGarage")}</Text>
            )}
          </Pressable>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
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
