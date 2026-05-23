import React from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { EUROPEAN_COUNTRIES, getRegionsForCountry } from "@/lib/countries-regions";
import { useT } from "@/lib/language-context";

interface EditLocationProps {
  country: string;
  setCountry: (country: string) => void;
  showCountryPicker: boolean;
  setShowCountryPicker: (show: boolean) => void;
  region: string;
  setRegion: (region: string) => void;
  showRegionPicker: boolean;
  setShowRegionPicker: (show: boolean) => void;
}

export function EditLocation({
  country,
  setCountry,
  showCountryPicker,
  setShowCountryPicker,
  region,
  setRegion,
  showRegionPicker,
  setShowRegionPicker,
}: EditLocationProps) {
  const t = useT();

  return (
    <View style={styles.fieldGroup}>
      <Text style={styles.groupTitle}>Paese</Text>
      <View style={styles.field}>
        <TouchableOpacity
          style={styles.selectInput}
          onPress={() => {
            setShowCountryPicker(!showCountryPicker);
            setShowRegionPicker(false);
          }}
          activeOpacity={0.7}
        >
          <Text
            style={[
              styles.selectText,
              !country && { color: Colors.textSecondary },
            ]}
          >
            {country
              ? `${EUROPEAN_COUNTRIES.find((c) => c.code === country)?.flag} ${
                  EUROPEAN_COUNTRIES.find((c) => c.code === country)?.name
                }`
              : "Seleziona paese"}
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
            onPress={() => {
              setShowRegionPicker(!showRegionPicker);
              setShowCountryPicker(false);
            }}
            activeOpacity={0.7}
          >
            <Text
              style={[
                styles.selectText,
                !region && { color: Colors.textSecondary },
              ]}
            >
              {region || t("profile.selectRegion")}
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
  );
}

const styles = StyleSheet.create({
  fieldGroup: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  groupTitle: {
    fontSize: 16,
    fontWeight: "600" as const,
    color: Colors.text,
    marginBottom: 16,
  },
  field: {
    marginBottom: 16,
  },
  fieldLabel: {
    fontSize: 14,
    color: Colors.textSecondary,
    marginBottom: 8,
    fontWeight: "500" as const,
  },
  selectInput: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: Colors.surfaceLight,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  selectText: {
    fontSize: 16,
    color: Colors.text,
  },
  pickerList: {
    marginTop: 8,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: "hidden",
  },
  pickerItem: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border + "44",
  },
  pickerItemSelected: {
    backgroundColor: Colors.accent + "12",
  },
  pickerItemText: {
    fontSize: 15,
    color: Colors.text,
  },
  pickerItemTextSelected: {
    color: Colors.accent,
    fontWeight: "600" as const,
  },
});
