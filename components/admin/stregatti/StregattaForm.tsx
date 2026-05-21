import React from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import Colors from "@/constants/colors";
import { MOTORCYCLE_BRANDS } from "@/lib/motorcycle-data";

const MOTORCYCLE_TYPES = ["Naked", "Sport", "Touring", "Enduro", "Cruiser", "Adventure", "Custom", "Scooter"];
const RIDING_STYLES = ["Allegra", "Tranquilla", "Sportiva", "Turistica"];

interface StregattaFormProps {
  formType: string;
  setFormType: (val: string) => void;
  formSex: string;
  setFormSex: (val: string) => void;
  formNickname: string;
  setFormNickname: (val: string) => void;
  formCountry: string;
  setFormCountry: (val: string) => void;
  formRegion: string;
  setFormRegion: (val: string) => void;
  formBirthYear: string;
  setFormBirthYear: (val: string) => void;
  formBio: string;
  setFormBio: (val: string) => void;
  formMotoBrand: string;
  setFormMotoBrand: (val: string) => void;
  formMotoModel: string;
  setFormMotoModel: (val: string) => void;
  formMotoType: string;
  setFormMotoType: (val: string) => void;
  formRidingStyle: string;
  setFormRidingStyle: (val: string) => void;
  formDisplacement: string;
  setFormDisplacement: (val: string) => void;
  formMotoYear: string;
  setFormMotoYear: (val: string) => void;
  formWishlistDesc: string;
  setFormWishlistDesc: (val: string) => void;
  formDesiredBrand: string;
  setFormDesiredBrand: (val: string) => void;
  formDesiredModel: string;
  setFormDesiredModel: (val: string) => void;
  formDesiredMotoType: string;
  setFormDesiredMotoType: (val: string) => void;
  showCountryPicker: boolean;
  setShowCountryPicker: (val: boolean) => void;
  showRegionPicker: boolean;
  setShowRegionPicker: (val: boolean) => void;
  showMotoBrandPicker: boolean;
  setShowMotoBrandPicker: (val: boolean) => void;
  showDesiredBrandPicker: boolean;
  setShowDesiredBrandPicker: (val: boolean) => void;
  countriesData: { code: string; name: string; regions: string[] }[];
  getRegionsForCountry: (code: string) => string[];
  onSubmit: () => void;
  isSubmitting: boolean;
}

export function StregattaForm({
  formType,
  setFormType,
  formSex,
  setFormSex,
  formNickname,
  setFormNickname,
  formCountry,
  setFormCountry,
  formRegion,
  setFormRegion,
  formBirthYear,
  setFormBirthYear,
  formBio,
  setFormBio,
  formMotoBrand,
  setFormMotoBrand,
  formMotoModel,
  setFormMotoModel,
  formMotoType,
  setFormMotoType,
  formRidingStyle,
  setFormRidingStyle,
  formDisplacement,
  setFormDisplacement,
  formMotoYear,
  setFormMotoYear,
  formWishlistDesc,
  setFormWishlistDesc,
  formDesiredBrand,
  setFormDesiredBrand,
  formDesiredModel,
  setFormDesiredModel,
  formDesiredMotoType,
  setFormDesiredMotoType,
  showCountryPicker,
  setShowCountryPicker,
  showRegionPicker,
  setShowRegionPicker,
  showMotoBrandPicker,
  setShowMotoBrandPicker,
  showDesiredBrandPicker,
  setShowDesiredBrandPicker,
  countriesData,
  getRegionsForCountry,
  onSubmit,
  isSubmitting,
}: StregattaFormProps) {
  return (
    <KeyboardAwareScrollViewCompat style={styles.modalScroll} bottomOffset={20} keyboardShouldPersistTaps="handled">
      <Text style={styles.fieldLabel}>Tipo utente</Text>
      <View style={styles.filterRow}>
        {["biker", "zavorrina", "coppia"].map((t) => (
          <TouchableOpacity
            key={t}
            style={[styles.filterTab, formType === t && styles.filterTabActive]}
            onPress={() => setFormType(t)}
          >
            <Text style={[styles.filterTabText, formType === t && styles.filterTabTextActive]}>
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.fieldLabel}>Sesso</Text>
      <View style={styles.filterRow}>
        {(formType === "coppia" ? ["MF"] : ["M", "F"]).map((s) => (
          <TouchableOpacity
            key={s}
            style={[styles.filterTab, formSex === s && styles.filterTabActive]}
            onPress={() => setFormSex(s)}
          >
            <Text style={[styles.filterTabText, formSex === s && styles.filterTabTextActive]}>{s}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.fieldLabel}>Nickname</Text>
      <TextInput
        style={styles.input}
        value={formNickname}
        onChangeText={setFormNickname}
        placeholder="Nickname"
        placeholderTextColor="#666"
      />

      <Text style={styles.fieldLabel}>Paese</Text>
      <TouchableOpacity style={styles.input} onPress={() => { setShowCountryPicker(!showCountryPicker); setShowRegionPicker(false); setShowMotoBrandPicker(false); setShowDesiredBrandPicker(false); }}>
        <Text style={styles.inputText}>{countriesData.find(c => c.code === formCountry)?.name ?? formCountry}</Text>
      </TouchableOpacity>
      {!!showCountryPicker && (
        <View style={styles.pickerList}>
          {countriesData.map((c) => (
            <TouchableOpacity
              key={c.code}
              style={[styles.pickerItem, formCountry === c.code && styles.pickerItemActive]}
              onPress={() => {
                setFormCountry(c.code);
                const firstRegion = c.regions[0] ?? "";
                setFormRegion(firstRegion);
                setShowCountryPicker(false);
              }}
            >
              <Text style={[styles.pickerItemText, formCountry === c.code && styles.pickerItemTextActive]}>{c.name}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      <Text style={styles.fieldLabel}>Regione</Text>
      <TouchableOpacity style={styles.input} onPress={() => { setShowRegionPicker(!showRegionPicker); setShowCountryPicker(false); setShowMotoBrandPicker(false); setShowDesiredBrandPicker(false); }}>
        <Text style={styles.inputText}>{formRegion || "— nessuna —"}</Text>
      </TouchableOpacity>
      {!!showRegionPicker && (
        <ScrollView style={styles.pickerList} keyboardShouldPersistTaps="handled" nestedScrollEnabled>
          {getRegionsForCountry(formCountry).map((r) => (
            <TouchableOpacity
              key={r}
              style={[styles.pickerItem, formRegion === r && styles.pickerItemActive]}
              onPress={() => { setFormRegion(r); setShowRegionPicker(false); }}
            >
              <Text style={[styles.pickerItemText, formRegion === r && styles.pickerItemTextActive]}>{r}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      <Text style={styles.fieldLabel}>Anno nascita</Text>
      <TextInput
        style={styles.input}
        value={formBirthYear}
        onChangeText={setFormBirthYear}
        placeholder="1990"
        placeholderTextColor="#666"
        keyboardType="number-pad"
      />

      <Text style={styles.fieldLabel}>Bio</Text>
      <TextInput
        style={[styles.input, styles.inputMultiline]}
        value={formBio}
        onChangeText={setFormBio}
        placeholder="Bio..."
        placeholderTextColor="#666"
        multiline
        numberOfLines={3}
      />

      {(formType === "biker" || formType === "coppia") && (
        <>
          <Text style={styles.sectionTitle}>Moto</Text>
          <Text style={styles.fieldLabel}>Marca</Text>
          <TouchableOpacity
            style={styles.input}
            onPress={() => { setShowMotoBrandPicker(!showMotoBrandPicker); setShowCountryPicker(false); setShowRegionPicker(false); setShowDesiredBrandPicker(false); }}
          >
            <Text style={styles.inputText}>{formMotoBrand || "— seleziona marca —"}</Text>
          </TouchableOpacity>
          {!!showMotoBrandPicker && (
            <ScrollView style={styles.pickerList} keyboardShouldPersistTaps="handled" nestedScrollEnabled>
              <TouchableOpacity
                style={[styles.pickerItem, !formMotoBrand && styles.pickerItemActive]}
                onPress={() => { setFormMotoBrand(""); setFormMotoModel(""); setShowMotoBrandPicker(false); }}
              >
                <Text style={[styles.pickerItemText, !formMotoBrand && styles.pickerItemTextActive]}>— nessuna —</Text>
              </TouchableOpacity>
              {MOTORCYCLE_BRANDS.map((b) => (
                <TouchableOpacity
                  key={b}
                  style={[styles.pickerItem, formMotoBrand === b && styles.pickerItemActive]}
                  onPress={() => { setFormMotoBrand(b); setFormMotoModel(""); setShowMotoBrandPicker(false); }}
                >
                  <Text style={[styles.pickerItemText, formMotoBrand === b && styles.pickerItemTextActive]}>{b}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}
          <Text style={styles.fieldLabel}>Modello</Text>
          <TextInput style={styles.input} value={formMotoModel} onChangeText={setFormMotoModel} placeholder="es. CBR 600" placeholderTextColor="#666" />

          <Text style={styles.fieldLabel}>Tipo moto</Text>
          <View style={styles.chipRow}>
            {MOTORCYCLE_TYPES.map((mt) => (
              <TouchableOpacity
                key={mt}
                style={[styles.chip, formMotoType === mt && styles.chipActive]}
                onPress={() => setFormMotoType(mt)}
              >
                <Text style={[styles.chipText, formMotoType === mt && styles.chipTextActive]}>{mt}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.fieldLabel}>Stile di guida</Text>
          <View style={styles.chipRow}>
            {RIDING_STYLES.map((rs) => (
              <TouchableOpacity
                key={rs}
                style={[styles.chip, formRidingStyle === rs && styles.chipActive]}
                onPress={() => setFormRidingStyle(rs)}
              >
                <Text style={[styles.chipText, formRidingStyle === rs && styles.chipTextActive]}>{rs}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.fieldLabel}>Cilindrata</Text>
          <TextInput style={styles.input} value={formDisplacement} onChangeText={setFormDisplacement} placeholder="600" placeholderTextColor="#666" keyboardType="number-pad" />
          <Text style={styles.fieldLabel}>Anno moto</Text>
          <TextInput style={styles.input} value={formMotoYear} onChangeText={setFormMotoYear} placeholder="2020" placeholderTextColor="#666" keyboardType="number-pad" />
        </>
      )}

      {formType === "zavorrina" && (
        <>
          <Text style={styles.sectionTitle}>Wishlist</Text>
          <Text style={styles.fieldLabel}>Descrizione</Text>
          <TextInput
            style={[styles.input, styles.inputMultiline]}
            value={formWishlistDesc}
            onChangeText={setFormWishlistDesc}
            placeholder="Cosa cerchi..."
            placeholderTextColor="#666"
            multiline
            numberOfLines={3}
          />
          <Text style={styles.fieldLabel}>Marca desiderata</Text>
          <TouchableOpacity
            style={styles.input}
            onPress={() => { setShowDesiredBrandPicker(!showDesiredBrandPicker); setShowCountryPicker(false); setShowRegionPicker(false); }}
          >
            <Text style={styles.inputText}>{formDesiredBrand || "— seleziona marca —"}</Text>
          </TouchableOpacity>
          {!!showDesiredBrandPicker && (
            <ScrollView style={styles.pickerList} keyboardShouldPersistTaps="handled" nestedScrollEnabled>
              <TouchableOpacity
                style={[styles.pickerItem, !formDesiredBrand && styles.pickerItemActive]}
                onPress={() => { setFormDesiredBrand(""); setFormDesiredModel(""); setShowDesiredBrandPicker(false); }}
              >
                <Text style={[styles.pickerItemText, !formDesiredBrand && styles.pickerItemTextActive]}>— nessuna preferenza —</Text>
              </TouchableOpacity>
              {MOTORCYCLE_BRANDS.map((b) => (
                <TouchableOpacity
                  key={b}
                  style={[styles.pickerItem, formDesiredBrand === b && styles.pickerItemActive]}
                  onPress={() => { setFormDesiredBrand(b); setFormDesiredModel(""); setShowDesiredBrandPicker(false); }}
                >
                  <Text style={[styles.pickerItemText, formDesiredBrand === b && styles.pickerItemTextActive]}>{b}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}
          <Text style={styles.fieldLabel}>Modello desiderato</Text>
          <TextInput style={styles.input} value={formDesiredModel} onChangeText={setFormDesiredModel} placeholder="es. Monster" placeholderTextColor="#666" />
          <Text style={styles.fieldLabel}>Tipo moto (opzionale)</Text>
          <View style={styles.chipRow}>
            {["", ...MOTORCYCLE_TYPES].map((t) => (
              <TouchableOpacity
                key={t || "__none__"}
                style={[styles.chip, formDesiredMotoType === t && styles.chipActive]}
                onPress={() => setFormDesiredMotoType(t)}
              >
                <Text style={[styles.chipText, formDesiredMotoType === t && styles.chipTextActive]}>{t || "Qualsiasi"}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </>
      )}

      <TouchableOpacity
        style={[styles.createBtn, isSubmitting && styles.createBtnDisabled]}
        onPress={onSubmit}
        disabled={isSubmitting}
      >
        {isSubmitting ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.createBtnText}>Crea Stregatto</Text>
        )}
      </TouchableOpacity>
    </KeyboardAwareScrollViewCompat>
  );
}

const styles = StyleSheet.create({
  modalScroll: {
    flex: 1,
  },
  sectionTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 18,
    color: Colors.accent,
    marginTop: 20,
    marginBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.accent + "40",
    paddingBottom: 4,
  },
  fieldLabel: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
    color: Colors.text,
    marginTop: 12,
    marginBottom: 6,
  },
  input: {
    backgroundColor: Colors.surface,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: Colors.text,
    fontFamily: "Inter_400Regular",
    fontSize: 15,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  inputMultiline: {
    height: 80,
    textAlignVertical: "top",
  },
  inputText: {
    color: Colors.text,
    fontFamily: "Inter_400Regular",
    fontSize: 15,
  },
  filterRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 8,
  },
  filterTab: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: "center",
  },
  filterTabActive: {
    backgroundColor: Colors.accent,
    borderColor: Colors.accent,
  },
  filterTabText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
    color: Colors.textSecondary,
  },
  filterTabTextActive: {
    color: "#fff",
  },
  pickerList: {
    backgroundColor: Colors.surface,
    borderRadius: 10,
    marginTop: 4,
    maxHeight: 200,
    borderWidth: 1,
    borderColor: Colors.border,
    zIndex: 10,
  },
  pickerItem: {
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  pickerItemActive: {
    backgroundColor: Colors.accent + "10",
  },
  pickerItemText: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    color: Colors.text,
  },
  pickerItemTextActive: {
    fontFamily: "Inter_600SemiBold",
    color: Colors.accent,
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 4,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  chipActive: {
    backgroundColor: Colors.accent,
    borderColor: Colors.accent,
  },
  chipText: {
    fontFamily: "Inter_500Medium",
    fontSize: 12,
    color: Colors.textSecondary,
  },
  chipTextActive: {
    color: "#fff",
  },
  createBtn: {
    backgroundColor: Colors.accent,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 24,
    marginBottom: 20,
  },
  createBtnDisabled: {
    opacity: 0.6,
  },
  createBtnText: {
    fontFamily: "Inter_700Bold",
    fontSize: 16,
    color: "#fff",
  },
});
