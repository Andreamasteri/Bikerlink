import React from "react";
import { View, Text, StyleSheet, Switch, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { useT } from "@/lib/language-context";

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface, borderRadius: 12, padding: 16, marginBottom: 16,
    borderWidth: 1, borderColor: Colors.border,
  },
  cardHighlight: {
    backgroundColor: Colors.surface, borderRadius: 12, padding: 16, marginBottom: 16,
    borderWidth: 1, borderColor: "#003087",
  },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  info: { flexDirection: "row", alignItems: "center", gap: 10 },
  label: { fontFamily: "Inter_600SemiBold", fontSize: 16, color: Colors.text },
  desc: { fontFamily: "Inter_400Regular", fontSize: 13, color: Colors.textSecondary, marginTop: 8 },
});

interface AppFeaturesSectionProps {
  marketplaceEnabled: boolean;
  onMarketplaceToggle: (val: boolean) => void;
  marketplaceLoading: boolean;
  gpsRequired: boolean;
  onGpsRequiredToggle: (val: boolean) => void;
  gpsRequiredLoading: boolean;
  ghostModeEnabled: boolean;
  onGhostModeToggle: (val: boolean) => void;
  ghostModeLoading: boolean;
  unitsPrefEnabled: boolean;
  onUnitsPrefToggle: (val: boolean) => void;
  unitsPrefLoading: boolean;
}

export function AppFeaturesSection({
  marketplaceEnabled,
  onMarketplaceToggle,
  marketplaceLoading,
  gpsRequired,
  onGpsRequiredToggle,
  gpsRequiredLoading,
  ghostModeEnabled,
  onGhostModeToggle,
  ghostModeLoading,
  unitsPrefEnabled,
  onUnitsPrefToggle,
  unitsPrefLoading,
}: AppFeaturesSectionProps) {
  const t = useT();

  return (
    <View>
      <View style={styles.cardHighlight}>
        <View style={styles.row}>
          <View style={styles.info}>
            <Ionicons name="pricetag" size={20} color="#FF9800" />
            <Text style={styles.label}>Mercatino Moto</Text>
          </View>
          {marketplaceLoading ? (
            <ActivityIndicator size="small" color={Colors.textSecondary} />
          ) : (
            <Switch
              value={marketplaceEnabled}
              onValueChange={onMarketplaceToggle}
              trackColor={{ false: Colors.border, true: "#FF9800" }}
              thumbColor={marketplaceEnabled ? Colors.text : Colors.textSecondary}
            />
          )}
        </View>
        <Text style={styles.desc}>
          {marketplaceEnabled
            ? "I biker possono mettere in vendita le moto dal garage. Le moto in vendita appaiono nel profilo e nel motoclub."
            : t("admin.marketplaceInactive")}
        </Text>
      </View>

      <View style={styles.cardHighlight}>
        <View style={styles.row}>
          <View style={styles.info}>
            <Ionicons name="navigate" size={20} color="#4CAF50" />
            <Text style={styles.label}>GPS Obbligatorio</Text>
          </View>
          {gpsRequiredLoading ? (
            <ActivityIndicator size="small" color={Colors.textSecondary} />
          ) : (
            <Switch
              value={gpsRequired}
              onValueChange={onGpsRequiredToggle}
              trackColor={{ false: Colors.border, true: "#4CAF50" }}
              thumbColor={gpsRequired ? Colors.text : Colors.textSecondary}
            />
          )}
        </View>
        <Text style={styles.desc}>
          {gpsRequired
            ? "Senza permesso GPS, l'utente vede solo Profilo e Garage. Le altre tab sono nascoste."
            : "GPS non obbligatorio: tutte le tab sono sempre visibili, anche senza permesso di localizzazione."}
        </Text>
      </View>

      <View style={styles.cardHighlight}>
        <View style={styles.row}>
          <View style={styles.info}>
            <Ionicons name="eye-off" size={20} color="#9C27B0" />
            <Text style={styles.label}>Ghost Mode</Text>
          </View>
          {ghostModeLoading ? (
            <ActivityIndicator size="small" color={Colors.textSecondary} />
          ) : (
            <Switch
              value={ghostModeEnabled}
              onValueChange={onGhostModeToggle}
              trackColor={{ false: Colors.border, true: "#9C27B0" }}
              thumbColor={ghostModeEnabled ? Colors.text : Colors.textSecondary}
            />
          )}
        </View>
        <Text style={styles.desc}>
          {ghostModeEnabled
            ? t("admin.invisibleModeDesc")
            : "Ghost Mode disabilitato. Gli utenti non possono nascondersi dalla piattaforma."}
        </Text>
      </View>

      <View style={styles.card}>
        <View style={styles.row}>
          <View style={styles.info}>
            <Ionicons name="speedometer-outline" size={20} color={Colors.accent} />
            <Text style={styles.label}>Scelta Unità di Misura</Text>
          </View>
          {unitsPrefLoading ? (
            <ActivityIndicator size="small" color={Colors.textSecondary} />
          ) : (
            <Switch
              value={unitsPrefEnabled}
              onValueChange={onUnitsPrefToggle}
              trackColor={{ false: Colors.border, true: Colors.accent }}
              thumbColor={unitsPrefEnabled ? Colors.text : Colors.textSecondary}
            />
          )}
        </View>
        <Text style={styles.desc}>
          {unitsPrefEnabled ? "Gli utenti possono scegliere tra km/h e mph nel profilo" : "Unità di misura bloccate su KM/H (Italia)"}
        </Text>
      </View>
    </View>
  );
}
