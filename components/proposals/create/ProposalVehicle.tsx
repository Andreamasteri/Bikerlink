import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { MaterialCommunityIcons, Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";

interface ProposalVehicleProps {
  needsMotoSelection: boolean;
  motos: { id: string; brand?: string | null; model?: string | null; motorcycleType?: string | null; ridingStyle?: string | null }[];
  selectedMotoId: string;
  setSelectedMotoId: (id: string) => void;
  needsWishlistMoto: boolean;
  anyMotoOk: boolean;
  setAnyMotoOk: (val: boolean) => void;
  selectedWishlistMotoId: string;
  setSelectedWishlistMotoId: (id: string) => void;
  wishlistMotos: { id: string; brand?: string | null; model?: string | null; motorcycleType?: string | null; ridingStyle?: string | null }[];
}

export const ProposalVehicle = ({
  needsMotoSelection,
  motos,
  selectedMotoId,
  setSelectedMotoId,
  needsWishlistMoto,
  anyMotoOk,
  setAnyMotoOk,
  selectedWishlistMotoId,
  setSelectedWishlistMotoId,
  wishlistMotos,
}: ProposalVehicleProps) => {
  if (!needsMotoSelection && !needsWishlistMoto) return null;

  return (
    <View>
      {needsMotoSelection && (
        <>
          <Text style={styles.sectionTitle}>Seleziona la moto *</Text>
          {motos.length === 0 ? (
            <Text style={styles.emptyText}>Nessuna moto nel garage. Aggiungine una prima.</Text>
          ) : (
            <View style={styles.motoList}>
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any -- moto from API */}
              {motos.map((m: any) => (
                <TouchableOpacity
                  key={m.id}
                  style={[
                    styles.motoCard,
                    selectedMotoId === m.id && styles.motoCardSelected,
                  ]}
                  onPress={() => setSelectedMotoId(m.id)}
                >
                  <MaterialCommunityIcons
                    name="motorbike"
                    size={24}
                    color={selectedMotoId === m.id ? Colors.accent : Colors.textSecondary}
                  />
                  <View style={styles.motoInfo}>
                    <Text style={[styles.motoName, selectedMotoId === m.id && { color: Colors.accent }]}>
                      {m.brand} {m.model}
                    </Text>
                    <Text style={styles.motoSub}>
                      {m.motorcycleType} • {m.ridingStyle}
                    </Text>
                  </View>
                  {selectedMotoId === m.id && (
                    <Ionicons name="checkmark-circle" size={22} color={Colors.accent} />
                  )}
                </TouchableOpacity>
              ))}
            </View>
          )}
        </>
      )}

      {needsWishlistMoto && (
        <>
          <Text style={styles.sectionTitle}>Con che tipo di moto? *</Text>
          <TouchableOpacity
            style={[styles.motoCard, anyMotoOk && styles.motoCardSelected]}
            onPress={() => {
              setAnyMotoOk(!anyMotoOk);
              if (!anyMotoOk) setSelectedWishlistMotoId("");
            }}
          >
            <Ionicons name="checkmark-circle" size={24} color={anyMotoOk ? Colors.accent : Colors.textSecondary} />
            <Text style={[styles.motoName, { flex: 1 }, anyMotoOk && { color: Colors.accent }]}>
              Qualsiasi moto va bene
            </Text>
          </TouchableOpacity>
          {!anyMotoOk && wishlistMotos.length > 0 && (
            <View style={styles.motoList}>
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any -- wishlist moto from API */}
              {wishlistMotos.map((m: any) => (
                <TouchableOpacity
                  key={m.id}
                  style={[
                    styles.motoCard,
                    selectedWishlistMotoId === m.id && styles.motoCardSelected,
                  ]}
                  onPress={() => setSelectedWishlistMotoId(m.id)}
                >
                  <MaterialCommunityIcons
                    name="motorbike"
                    size={24}
                    color={selectedWishlistMotoId === m.id ? Colors.accent : Colors.textSecondary}
                  />
                  <View style={styles.motoInfo}>
                    <Text style={[styles.motoName, selectedWishlistMotoId === m.id && { color: Colors.accent }]}>
                      {m.brand || ""} {m.model || ""} {m.motorcycleType || ""}
                    </Text>
                    {m.ridingStyle && <Text style={styles.motoSub}>{m.ridingStyle}</Text>}
                  </View>
                  {selectedWishlistMotoId === m.id && (
                    <Ionicons name="checkmark-circle" size={22} color={Colors.accent} />
                  )}
                </TouchableOpacity>
              ))}
            </View>
          )}
          {!anyMotoOk && wishlistMotos.length === 0 && (
            <Text style={styles.emptyText}>Nessun desiderio moto salvato. Puoi selezionare "Qualsiasi moto va bene".</Text>
          )}
        </>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  sectionTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: Colors.text,
    marginTop: 24,
    marginBottom: 12,
  },
  emptyText: {
    color: Colors.textSecondary,
    fontSize: 14,
    fontStyle: "italic",
    textAlign: "center",
    marginVertical: 10,
  },
  motoList: {
    gap: 10,
  },
  motoCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 12,
  },
  motoCardSelected: {
    borderColor: Colors.accent,
    backgroundColor: Colors.accent + "10",
  },
  motoInfo: {
    flex: 1,
  },
  motoName: {
    fontSize: 15,
    fontWeight: "600",
    color: Colors.text,
  },
  motoSub: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 2,
  },
});
