import React from "react";
import { View, Text, ScrollView, Pressable, StyleSheet } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import Slider from "@react-native-community/slider";
import { useColors } from "@/hooks/useColors";
import type { ThemeColors } from "@/constants/colors";

interface UserMotorcycle { id: string; brand: string; model: string; year?: number | null; ridingStyle?: string | null; }

interface GarageIntegrationSectionProps {
  motorcycles: UserMotorcycle[];
  selectedMotoId: string | null;
  setSelectedMotoId: (id: string | null) => void;
  fuelLevel: number;
  setFuelLevel: (level: number) => void;
  autonomyKm: number;
  fuelStopsNeeded: number;
}

export const GarageIntegrationSection: React.FC<GarageIntegrationSectionProps> = ({
  motorcycles,
  selectedMotoId,
  setSelectedMotoId,
  fuelLevel,
  setFuelLevel,
  autonomyKm,
  fuelStopsNeeded,
}) => {
  const colors = useColors();
  const s = styles(colors);

  if (motorcycles.length === 0) return null;

  return (
    <View style={s.section}>
      <Text style={s.sectionLabel}>La tua moto (soste benzina)</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 10 }}>
        {motorcycles.map((moto) => (
          <Pressable
            key={moto.id}
            style={[s.motoChip, selectedMotoId === moto.id && { borderColor: colors.accent, borderWidth: 2 }]}
            onPress={() => setSelectedMotoId(selectedMotoId === moto.id ? null : moto.id)}
          >
            <MaterialCommunityIcons name="motorbike" size={16} color={selectedMotoId === moto.id ? colors.accent : colors.textSecondary} />
            <Text style={[s.motoChipText, selectedMotoId === moto.id && { color: colors.accent }]}>
              {moto.brand} {moto.model}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
      {selectedMotoId && (
        <View style={s.sliderSection}>
          <View style={s.sliderLabelRow}>
            <MaterialCommunityIcons name="gas-station" size={16} color={colors.textSecondary} />
            <Text style={s.sliderLabel}>Livello carburante</Text>
            <Text style={s.sliderValue}>{fuelLevel}%</Text>
          </View>
          <Slider
            style={{ width: "100%", height: 36 }}
            minimumValue={10} maximumValue={100} step={5}
            value={fuelLevel} onValueChange={setFuelLevel}
            minimumTrackTintColor={fuelLevel < 30 ? colors.accentRed : colors.accent}
            maximumTrackTintColor={colors.border}
            thumbTintColor={colors.accent}
          />
          <Text style={s.hint}>
            Autonomia stimata: ~{autonomyKm} km
            {fuelStopsNeeded > 0 ? ` — ${fuelStopsNeeded} sosta/e benzina previste` : " — nessuna sosta benzina necessaria"}
          </Text>
        </View>
      )}
    </View>
  );
};

const styles = (colors: ThemeColors) => StyleSheet.create({
  section: { marginBottom: 20 },
  sectionLabel: { fontFamily: "Inter_600SemiBold", fontSize: 13, color: colors.textSecondary, marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.5 },
  motoChip: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, backgroundColor: colors.surface, marginRight: 8, borderWidth: 1, borderColor: colors.border },
  motoChipText: { fontFamily: "Inter_500Medium", fontSize: 13, color: colors.textSecondary },
  sliderSection: { marginTop: 8, paddingHorizontal: 4 },
  sliderLabelRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 4 },
  sliderLabel: { fontFamily: "Inter_500Medium", fontSize: 14, color: colors.textSecondary, marginLeft: 4 },
  sliderValue: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: colors.accent },
  hint: { fontFamily: "Inter_400Regular", fontSize: 12, color: colors.textSecondary, marginTop: 4 },
});
