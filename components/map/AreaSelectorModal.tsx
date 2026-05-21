import React from "react";
import {
  Modal,
  Pressable,
  View,
  Text,
  ScrollView,
  StyleSheet,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { useT } from "@/lib/language-context";
import {
  CONTINENT_MAP,
  getCountriesForContinent,
} from "@/lib/countries-regions";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type Props = {
  visible: boolean;
  selectedCountries: string[];
  onToggleCountry: (code: string) => void;
  onToggleContinent: (key: string) => void;
  onSave: () => void;
  onClose: () => void;
};

export default function AreaSelectorModal({
  visible,
  selectedCountries,
  onToggleCountry,
  onToggleContinent,
  onSave,
  onClose,
}: Props) {
  const t = useT();
  const insets = useSafeAreaInsets();
  const [expandedContinents, setExpandedContinents] = React.useState<Set<string>>(new Set());
  const [expandedCountries, setExpandedCountries] = React.useState<Set<string>>(new Set());

  const handleClose = () => {
    onSave();
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <Pressable style={styles.overlay} onPress={handleClose}>
        <Pressable
          style={[styles.sheet, { paddingBottom: insets.bottom || 16 }]}
          onPress={(e) => e.stopPropagation()}
        >
          <View style={styles.handle} />
          <View style={styles.header}>
            <Ionicons name="globe-outline" size={20} color={Colors.accent} />
            <Text style={styles.headerTitle}>{t("home.defineArea")}</Text>
            <Pressable onPress={handleClose}>
              <Ionicons name="close" size={24} color={Colors.textSecondary} />
            </Pressable>
          </View>
          <Text style={styles.subtitle}>{t("home.defineAreaDesc")}</Text>

          <ScrollView style={{ maxHeight: 460 }} showsVerticalScrollIndicator={false}>
            {/* World option */}
            <Pressable
              style={[styles.continentRow, selectedCountries.length === 0 && styles.continentRowSelected]}
              onPress={() => onToggleCountry("__world__")}
            >
              <Text style={styles.countryFlag}>🌍</Text>
              <Text
                style={[
                  styles.continentLabel,
                  selectedCountries.length === 0 && { color: Colors.accent },
                ]}
              >
                Tutto il mondo
              </Text>
              <Ionicons
                name={selectedCountries.length === 0 ? "radio-button-on" : "radio-button-off"}
                size={20}
                color={selectedCountries.length === 0 ? Colors.accent : Colors.textSecondary}
              />
            </Pressable>

            {CONTINENT_MAP.map((continent) => {
              const isContinentExpanded = expandedContinents.has(continent.key);
              const continentCountries = getCountriesForContinent(continent.key);
              const selectedInContinent = continent.countryCodes.filter((c) =>
                selectedCountries.includes(c)
              );
              const allSelected = selectedInContinent.length === continent.countryCodes.length;
              const partialSelected = selectedInContinent.length > 0 && !allSelected;

              return (
                <View key={continent.key}>
                  <View style={[styles.continentRow, allSelected && styles.continentRowSelected]}>
                    <Pressable
                      style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 10 }}
                      onPress={() => {
                        setExpandedContinents((prev) => {
                          const next = new Set(prev);
                          if (next.has(continent.key)) next.delete(continent.key);
                          else next.add(continent.key);
                          return next;
                        });
                      }}
                    >
                      <Ionicons
                        name={isContinentExpanded ? "chevron-down" : "chevron-forward"}
                        size={16}
                        color={Colors.textSecondary}
                      />
                      <Text
                        style={[
                          styles.continentLabel,
                          (allSelected || partialSelected) && { color: Colors.accent },
                        ]}
                      >
                        {continent.label}
                      </Text>
                      {partialSelected && (
                        <View style={styles.partialBadge}>
                          <Text style={styles.partialBadgeText}>{selectedInContinent.length}</Text>
                        </View>
                      )}
                    </Pressable>
                    <Pressable
                      onPress={() => onToggleContinent(continent.key)}
                      style={{ flexDirection: "row", alignItems: "center", gap: 6 }}
                    >
                      <Text style={styles.selectAllText}>
                        {allSelected ? "Deseleziona tutti" : "Seleziona tutti"}
                      </Text>
                      <Ionicons
                        name={
                          allSelected
                            ? "checkbox"
                            : partialSelected
                            ? "remove-circle"
                            : "square-outline"
                        }
                        size={22}
                        color={allSelected || partialSelected ? Colors.accent : Colors.textSecondary}
                      />
                    </Pressable>
                  </View>

                  {isContinentExpanded &&
                    continentCountries.map((country) => {
                      const isSelected = selectedCountries.includes(country.code);
                      const isCountryExpanded = expandedCountries.has(country.code);
                      const hasSubLevel = country.regions.length > 0;
                      const hasCities = country.regions.some(
                        (r) => r.cities && r.cities.length > 0
                      );

                      return (
                        <View key={country.code}>
                          <View
                            style={[
                              styles.countryRow,
                              { paddingLeft: 32 },
                              isSelected && styles.countryRowSelected,
                            ]}
                          >
                            {hasSubLevel ? (
                              <Pressable
                                onPress={() => {
                                  setExpandedCountries((prev) => {
                                    const next = new Set(prev);
                                    if (next.has(country.code)) next.delete(country.code);
                                    else next.add(country.code);
                                    return next;
                                  });
                                }}
                                style={{ paddingRight: 4 }}
                              >
                                <Ionicons
                                  name={isCountryExpanded ? "chevron-down" : "chevron-forward"}
                                  size={14}
                                  color={Colors.textSecondary}
                                />
                              </Pressable>
                            ) : (
                              <View style={{ width: 18 }} />
                            )}
                            <Text style={styles.countryFlag}>{country.flag}</Text>
                            <Pressable style={{ flex: 1 }} onPress={() => onToggleCountry(country.code)}>
                              <Text
                                style={[styles.countryName, isSelected && { color: Colors.accent }]}
                              >
                                {country.name}
                              </Text>
                            </Pressable>
                            <Pressable onPress={() => onToggleCountry(country.code)}>
                              <Ionicons
                                name={isSelected ? "checkbox" : "square-outline"}
                                size={20}
                                color={isSelected ? Colors.accent : Colors.textSecondary}
                              />
                            </Pressable>
                          </View>

                          {isCountryExpanded &&
                            country.regions.map((region) => {
                              const regionHasCities =
                                hasCities && region.cities && region.cities.length > 0;
                              const regionKey = `${country.code}:${region.name}`;
                              return (
                                <View key={region.name}>
                                  <View style={[styles.regionRow, { paddingLeft: 56 }]}>
                                    {regionHasCities ? (
                                      <Pressable
                                        onPress={() => {
                                          setExpandedCountries((prev) => {
                                            const next = new Set(prev);
                                            if (next.has(regionKey)) next.delete(regionKey);
                                            else next.add(regionKey);
                                            return next;
                                          });
                                        }}
                                        style={{ paddingRight: 4 }}
                                      >
                                        <Ionicons
                                          name={
                                            expandedCountries.has(regionKey)
                                              ? "chevron-down"
                                              : "chevron-forward"
                                          }
                                          size={12}
                                          color={Colors.textSecondary}
                                        />
                                      </Pressable>
                                    ) : (
                                      <View style={styles.regionDot} />
                                    )}
                                    <Text style={styles.regionName}>{region.name}</Text>
                                  </View>
                                  {regionHasCities &&
                                    region.cities &&
                                    expandedCountries.has(regionKey) &&
                                    region.cities.map((city) => (
                                      <View
                                        key={city.name}
                                        style={[styles.regionRow, { paddingLeft: 76 }]}
                                      >
                                        <View
                                          style={[
                                            styles.regionDot,
                                            { backgroundColor: Colors.textSecondary + "60" },
                                          ]}
                                        />
                                        <Text
                                          style={[
                                            styles.regionName,
                                            { fontSize: 12, color: Colors.textSecondary },
                                          ]}
                                        >
                                          {city.name}
                                        </Text>
                                      </View>
                                    ))}
                                </View>
                              );
                            })}
                        </View>
                      );
                    })}
                </View>
              );
            })}
          </ScrollView>

          <Pressable style={styles.saveBtn} onPress={handleClose}>
            <Text style={styles.saveBtnText}>
              {selectedCountries.length === 0
                ? `${t("common.confirm")} — Tutto il mondo`
                : `${t("common.confirm")} (${selectedCountries.length})`}
            </Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    maxHeight: "80%",
  },
  handle: {
    width: 40,
    height: 4,
    backgroundColor: Colors.border,
    borderRadius: 2,
    alignSelf: "center",
    marginBottom: 16,
  },
  header: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 },
  headerTitle: { flex: 1, fontSize: 18, fontFamily: "Inter_700Bold", color: Colors.text },
  subtitle: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
    marginBottom: 12,
  },
  continentRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 11,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginBottom: 1,
    gap: 8,
  },
  continentRowSelected: { backgroundColor: Colors.accent + "15" },
  continentLabel: { flex: 1, fontSize: 15, fontFamily: "Inter_600SemiBold", color: Colors.text },
  selectAllText: { fontSize: 12, fontFamily: "Inter_500Medium", color: Colors.accent },
  partialBadge: {
    backgroundColor: Colors.accent + "30",
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  partialBadgeText: { fontSize: 11, fontFamily: "Inter_600SemiBold", color: Colors.accent },
  countryRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginBottom: 1,
    gap: 8,
  },
  countryRowSelected: { backgroundColor: Colors.accent + "10" },
  countryFlag: { fontSize: 18 },
  countryName: { flex: 1, fontSize: 14, fontFamily: "Inter_500Medium", color: Colors.text },
  regionRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 5,
    paddingHorizontal: 12,
    gap: 8,
  },
  regionDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: Colors.textSecondary + "80",
  },
  regionName: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
    flex: 1,
  },
  saveBtn: {
    backgroundColor: Colors.accent,
    padding: 14,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 12,
  },
  saveBtnText: { fontSize: 16, fontFamily: "Inter_700Bold", color: Colors.background },
});
