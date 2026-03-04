import React from "react";
import {
  View,
  Text,
  Pressable,
  Modal,
  ScrollView,
  StyleSheet,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";

const REGIONS = [
  "Abruzzo", "Basilicata", "Calabria", "Campania", "Emilia-Romagna",
  "Friuli Venezia Giulia", "Lazio", "Liguria", "Lombardia", "Marche",
  "Molise", "Piemonte", "Puglia", "Sardegna", "Sicilia", "Toscana",
  "Trentino-Alto Adige", "Umbria", "Valle d'Aosta", "Veneto",
];

interface RegionPickerProps {
  visible: boolean;
  selectedRegion: string;
  onSelect: (region: string) => void;
  onClose: () => void;
}

export default function RegionPicker({ visible, selectedRegion, onSelect, onClose }: RegionPickerProps) {
  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.container}>
          <View style={styles.header}>
            <Text style={styles.title}>Seleziona Regione</Text>
            <Pressable onPress={onClose} hitSlop={12}>
              <Ionicons name="close" size={24} color={Colors.text} />
            </Pressable>
          </View>
          <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
            {REGIONS.map((region) => {
              const isSelected = region === selectedRegion;
              return (
                <Pressable
                  key={region}
                  style={[styles.item, isSelected && styles.itemSelected]}
                  onPress={() => {
                    onSelect(region);
                    onClose();
                  }}
                >
                  <Text style={[styles.itemText, isSelected && styles.itemTextSelected]}>
                    {region}
                  </Text>
                  {isSelected && (
                    <Ionicons name="checkmark" size={22} color={Colors.accent} />
                  )}
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "flex-end",
  },
  container: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: "70%",
    paddingBottom: 24,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  title: {
    fontSize: 18,
    fontFamily: "Inter_600SemiBold",
    color: Colors.text,
  },
  list: {
    paddingHorizontal: 8,
  },
  item: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 10,
    marginVertical: 2,
  },
  itemSelected: {
    backgroundColor: Colors.accent + "15",
  },
  itemText: {
    fontSize: 16,
    fontFamily: "Inter_400Regular",
    color: Colors.text,
  },
  itemTextSelected: {
    color: Colors.accent,
    fontFamily: "Inter_600SemiBold",
  },
});
