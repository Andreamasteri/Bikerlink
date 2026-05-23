import React from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { useT } from "@/lib/language-context";

interface EditMotoProps {
  isBikerOrCoppia: boolean;
  motorcycles: any[];
  showAddMoto: boolean;
  setShowAddMoto: (show: boolean) => void;
  motoBrand: string;
  setMotoBrand: (brand: string) => void;
  motoModel: string;
  setMotoModel: (model: string) => void;
  motoYear: string;
  setMotoYear: (year: string) => void;
  motoDisplacement: string;
  setMotoDisplacement: (disp: string) => void;
  motoType: string;
  setMotoType: (type: string) => void;
  ridingStyle: string;
  setRidingStyle: (style: string) => void;
  handleAddMoto: () => void;
  isPending: boolean;
}

const MOTO_TYPES = [
  "Naked", "Sport", "Touring", "Adventure", "Enduro",
  "Cruiser", "Café Racer", "Scrambler", "Custom", "Scooter",
];

const RIDING_STYLES = [
  "Tranquillo", "Moderato", "Sportivo", "Turistico", "Off-road",
];

export function EditMoto({
  isBikerOrCoppia,
  motorcycles,
  showAddMoto,
  setShowAddMoto,
  motoBrand,
  setMotoBrand,
  motoModel,
  setMotoModel,
  motoYear,
  setMotoYear,
  motoDisplacement,
  setMotoDisplacement,
  motoType,
  setMotoType,
  ridingStyle,
  setRidingStyle,
  handleAddMoto,
  isPending,
}: EditMotoProps) {
  const t = useT();

  if (!isBikerOrCoppia) return null;

  return (
    <View style={styles.fieldGroup}>
      <Text style={styles.groupTitle}>{t("profile.motorcycles")}</Text>

      {motorcycles.length > 0 && (
        <View style={styles.motoList}>
          {motorcycles.map((moto) => (
            <View key={moto.id} style={styles.motoCard}>
              <MaterialCommunityIcons
                name="motorbike"
                size={20}
                color={Colors.accent}
              />
              <View style={styles.motoCardInfo}>
                <Text style={styles.motoCardTitle}>
                  {moto.brand} {moto.model}
                </Text>
                {moto.year && (
                  <Text style={styles.motoCardSub}>{moto.year}</Text>
                )}
              </View>
            </View>
          ))}
        </View>
      )}

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
                placeholder="es. Multistrada"
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
                keyboardType="number-pad"
                placeholderTextColor={Colors.textSecondary}
              />
            </View>
            <View style={[styles.field, { flex: 1 }]}>
              <Text style={styles.fieldLabel}>Cilindrata</Text>
              <TextInput
                style={styles.input}
                value={motoDisplacement}
                onChangeText={setMotoDisplacement}
                placeholder="es. 1200"
                keyboardType="number-pad"
                placeholderTextColor={Colors.textSecondary}
              />
            </View>
          </View>

          <View style={styles.field}>
            <Text style={styles.fieldLabel}>Tipo di moto</Text>
            <View style={styles.chipRow}>
              {MOTO_TYPES.map((type) => (
                <TouchableOpacity
                  key={type}
                  style={[
                    styles.chip,
                    motoType === type && styles.chipSelected,
                  ]}
                  onPress={() => setMotoType(type)}
                >
                  <Text
                    style={[
                      styles.chipText,
                      motoType === type && styles.chipTextSelected,
                    ]}
                  >
                    {type}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={styles.field}>
            <Text style={styles.fieldLabel}>Stile di guida</Text>
            <View style={styles.chipRow}>
              {RIDING_STYLES.map((style) => (
                <TouchableOpacity
                  key={style}
                  style={[
                    styles.chip,
                    ridingStyle === style && styles.chipSelected,
                  ]}
                  onPress={() => setRidingStyle(style)}
                >
                  <Text
                    style={[
                      styles.chipText,
                      ridingStyle === style && styles.chipTextSelected,
                    ]}
                  >
                    {style}
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
              <Text style={styles.chipText}>Annulla</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.saveMotoBtn}
              onPress={handleAddMoto}
              disabled={isPending}
            >
              {isPending ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <>
                  <Ionicons name="add" size={18} color="#FFFFFF" />
                  <Text style={styles.saveMotoText}>Aggiungi</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      )}

      {!showAddMoto && (
        <TouchableOpacity
          style={styles.addMotoBtn}
          onPress={() => setShowAddMoto(true)}
        >
          <Ionicons name="add-circle-outline" size={24} color={Colors.accent} />
          <Text style={styles.addMotoBtnText}>Aggiungi una moto</Text>
        </TouchableOpacity>
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
  input: {
    backgroundColor: Colors.surfaceLight,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: Colors.text,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  motoList: {
    gap: 8,
    marginBottom: 12,
  },
  motoCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: Colors.surfaceLight,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  motoCardInfo: {
    flex: 1,
  },
  motoCardTitle: {
    fontSize: 14,
    fontWeight: "600" as const,
    color: Colors.text,
  },
  motoCardSub: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  addMotoBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 4,
  },
  addMotoBtnText: {
    fontSize: 15,
    color: Colors.accent,
    fontWeight: "600" as const,
  },
  addMotoForm: {
    backgroundColor: Colors.surfaceLight,
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
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
    backgroundColor: Colors.background,
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
    backgroundColor: Colors.background,
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
