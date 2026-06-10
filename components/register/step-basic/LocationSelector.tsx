import React from "react";
import { View, Text, TouchableOpacity, Modal, ScrollView, FlatList, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/colors";
import { CONTINENT_MAP, getCountriesForContinent, getRegionsForCountry, CountryData, ContinentData, getCountryName } from "@/lib/countries-regions";

interface LocationSelectorProps {
  country: string;
  setCountry: (v: string) => void;
  showCountries: boolean;
  setShowCountries: (v: boolean) => void;
  region: string;
  setRegion: (v: string) => void;
  showRegions: boolean;
  setShowRegions: (v: boolean) => void;
  expandedContinents: Set<string>;
  setExpandedContinents: (v: Set<string>) => void;
}

export const LocationSelector: React.FC<LocationSelectorProps> = ({
  country,
  setCountry,
  showCountries,
  setShowCountries,
  region,
  setRegion,
  showRegions,
  setShowRegions,
  expandedContinents,
  setExpandedContinents,
}) => {
  const insets = useSafeAreaInsets();
  const regions = country ? getRegionsForCountry(country) : [];

  const toggleContinent = (continent: string) => {
    const next = new Set(expandedContinents);
    if (next.has(continent)) next.delete(continent);
    else next.add(continent);
    setExpandedContinents(next);
  };

  return (
    <>
      <TouchableOpacity
        style={[styles.inputWrapper, styles.inputWrapperRequired]}
        onPress={() => setShowCountries(true)}
        testID="open-countries-modal"
      >
        <Ionicons name="globe-outline" size={22} color={Colors.textSecondary} style={styles.inputIcon} />
        <Text style={[styles.input, !country && { color: Colors.textSecondary }, { lineHeight: 58 }]}>
          {country ? getCountryName(country) : "Seleziona il tuo paese"}
        </Text>
        <Ionicons name="chevron-down" size={20} color={Colors.textSecondary} />
      </TouchableOpacity>

      {country && regions.length > 0 && (
        <TouchableOpacity
          style={styles.inputWrapper}
          onPress={() => setShowRegions(true)}
          testID="open-regions-modal"
        >
          <Ionicons name="map-outline" size={22} color={Colors.textSecondary} style={styles.inputIcon} />
          <Text style={[styles.input, !region && { color: Colors.textSecondary }, { lineHeight: 58 }]}>
            {region ? region : "Seleziona la tua regione (opzionale)"}
          </Text>
          <Ionicons name="chevron-down" size={20} color={Colors.textSecondary} />
        </TouchableOpacity>
      )}

      {/* Country Modal */}
      <Modal visible={showCountries} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { paddingBottom: insets.bottom }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Seleziona Paese</Text>
              <TouchableOpacity onPress={() => setShowCountries(false)}>
                <Ionicons name="close" size={24} color={Colors.text} />
              </TouchableOpacity>
            </View>
            <ScrollView>
              {CONTINENT_MAP.map((cont: ContinentData) => (
                <View key={cont.key}>
                  <TouchableOpacity
                    style={styles.continentHeader}
                    onPress={() => toggleContinent(cont.key)}
                  >
                    <Text style={styles.continentLabel}>{cont.label}</Text>
                    <Ionicons
                      name={expandedContinents.has(cont.key) ? "chevron-up" : "chevron-down"}
                      size={16}
                      color={Colors.textSecondary}
                    />
                  </TouchableOpacity>
                  {expandedContinents.has(cont.key) &&
                    getCountriesForContinent(cont.key).map((c: CountryData) => (
                      <TouchableOpacity
                        key={c.code}
                        style={[styles.prefixItem, country === c.code && styles.prefixItemSelected]}
                        onPress={() => {
                          setCountry(c.code);
                          setRegion("");
                          setShowCountries(false);
                        }}
                      >
                        <Text style={[styles.prefixItemCountry, country === c.code && styles.prefixItemCountrySelected]}>
                          {c.name}
                        </Text>
                        {country === c.code && <Ionicons name="checkmark" size={20} color={Colors.accent} />}
                      </TouchableOpacity>
                    ))}
                </View>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Region Modal */}
      <Modal visible={showRegions} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { paddingBottom: insets.bottom }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Seleziona Regione</Text>
              <TouchableOpacity onPress={() => setShowRegions(false)}>
                <Ionicons name="close" size={24} color={Colors.text} />
              </TouchableOpacity>
            </View>
            <FlatList
              data={regions}
              keyExtractor={(item) => item.name}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[styles.prefixItem, region === item.name && styles.prefixItemSelected]}
                  onPress={() => {
                    setRegion(item.name);
                    setShowRegions(false);
                  }}
                >
                  <Text style={[styles.prefixItemCountry, region === item.name && styles.prefixItemCountrySelected]}>
                    {item.name}
                  </Text>
                  {region === item.name && <Ionicons name="checkmark" size={20} color={Colors.accent} />}
                </TouchableOpacity>
              )}
            />
          </View>
        </View>
      </Modal>
    </>
  );
};

const styles = StyleSheet.create({
  inputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 14,
    height: 58,
  },
  inputWrapperRequired: {
    borderColor: Colors.accent + "88",
  },
  inputIcon: {
    marginRight: 10,
  },
  input: {
    flex: 1,
    color: Colors.text,
    fontSize: 19,
    fontFamily: "Inter_400Regular",
    height: "100%",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: "60%",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  modalTitle: {
    fontSize: 18,
    fontFamily: "Inter_600SemiBold",
    color: Colors.text,
  },
  prefixItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  prefixItemSelected: {
    backgroundColor: Colors.surfaceLight,
  },
  prefixItemCountry: {
    flex: 1,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
  },
  prefixItemCountrySelected: {
    color: Colors.accent,
  },
  continentHeader: {
    backgroundColor: Colors.background,
    paddingVertical: 8,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  continentLabel: {
    color: Colors.textSecondary,
    fontSize: 12,
    fontFamily: "Inter_700Bold",
    textTransform: "uppercase" as const,
    letterSpacing: 1,
  },
});
