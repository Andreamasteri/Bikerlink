import React, { useState } from "react";
import {
  View, Text, TextInput, TouchableOpacity, Modal,
  ScrollView, StyleSheet, ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/query-client";
import { useColors } from "@/hooks/useColors";
import { HAZARD_TYPES, HAZARD_LABELS, HAZARD_ICONS, type HazardType } from "@shared/db/road-hazards";

interface HazardReportSheetProps {
  visible: boolean;
  onClose: () => void;
  userLocation: { latitude: number; longitude: number } | null;
}

export function HazardReportSheet({ visible, onClose, userLocation }: HazardReportSheetProps) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [selectedType, setSelectedType] = useState<HazardType | null>(null);
  const [description, setDescription] = useState("");

  const mutation = useMutation({
    mutationFn: async () => {
      if (!selectedType || !userLocation) throw new Error("Missing data");
      return apiRequest("POST", "/api/road-hazards", {
        type: selectedType,
        lat: userLocation.latitude,
        lng: userLocation.longitude,
        description: description.trim() || undefined,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/road-hazards"] });
      setSelectedType(null);
      setDescription("");
      onClose();
    },
  });

  const handleClose = () => {
    setSelectedType(null);
    setDescription("");
    mutation.reset();
    onClose();
  };

  const HAZARD_COLORS: Record<HazardType, string> = {
    oil: "#FF6F00",
    gravel: "#795548",
    animals: "#2E7D32",
    roadwork: "#F57C00",
    wet: "#1565C0",
    accident: "#C62828",
    fog: "#546E7A",
    slowdown: "#6A1B9A",
  };

  const bottomPad = insets.bottom;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={handleClose}
    >
      <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={handleClose} />
      <View style={[styles.sheet, { backgroundColor: colors.card, paddingBottom: bottomPad + 16 }]}>
        <View style={[styles.handle, { backgroundColor: colors.border }]} />

        <Text style={[styles.title, { color: colors.text }]}>Segnala un pericolo</Text>

        {!userLocation && (
          <Text style={[styles.noLocation, { color: colors.textMuted }]}>
            Posizione non disponibile. Attiva il GPS per segnalare.
          </Text>
        )}

        <ScrollView showsVerticalScrollIndicator={false} style={styles.scroll}>
          <View style={styles.grid}>
            {(HAZARD_TYPES as readonly HazardType[]).map((type) => {
              const isSelected = selectedType === type;
              const color = HAZARD_COLORS[type];
              return (
                <TouchableOpacity
                  key={type}
                  style={[
                    styles.typeBtn,
                    { borderColor: isSelected ? color : colors.border, backgroundColor: isSelected ? color + "22" : colors.surface },
                  ]}
                  onPress={() => setSelectedType(type)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.typeEmoji}>{HAZARD_ICONS[type]}</Text>
                  <Text
                    style={[styles.typeLabel, { color: isSelected ? color : colors.textMuted }]}
                    numberOfLines={2}
                  >
                    {HAZARD_LABELS[type]}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <TextInput
            style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]}
            placeholder="Note aggiuntive (opzionale)"
            placeholderTextColor={colors.textMuted}
            value={description}
            onChangeText={setDescription}
            maxLength={140}
            multiline
            numberOfLines={2}
          />

          {mutation.isError && (
            <Text style={styles.errorText}>
              {(mutation.error as Error)?.message ?? "Errore invio segnalazione"}
            </Text>
          )}
        </ScrollView>

        <TouchableOpacity
          style={[
            styles.submitBtn,
            {
              backgroundColor: selectedType && userLocation ? HAZARD_COLORS[selectedType] : colors.border,
              opacity: selectedType && userLocation && !mutation.isPending ? 1 : 0.6,
            },
          ]}
          onPress={() => mutation.mutate()}
          disabled={!selectedType || !userLocation || mutation.isPending}
          activeOpacity={0.8}
        >
          {mutation.isPending ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={styles.submitText}>Invia segnalazione</Text>
          )}
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 12,
    paddingHorizontal: 16,
    maxHeight: "80%",
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    alignSelf: "center",
    marginBottom: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 12,
    textAlign: "center",
  },
  noLocation: {
    fontSize: 13,
    textAlign: "center",
    marginBottom: 12,
  },
  scroll: {
    flexGrow: 0,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 16,
  },
  typeBtn: {
    width: "47%",
    borderWidth: 1.5,
    borderRadius: 12,
    padding: 10,
    alignItems: "center",
    gap: 4,
  },
  typeEmoji: {
    fontSize: 24,
  },
  typeLabel: {
    fontSize: 11,
    fontWeight: "600",
    textAlign: "center",
    lineHeight: 14,
  },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    fontSize: 14,
    marginBottom: 12,
    minHeight: 60,
    textAlignVertical: "top",
  },
  errorText: {
    color: "#C62828",
    fontSize: 13,
    marginBottom: 8,
    textAlign: "center",
  },
  submitBtn: {
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 4,
  },
  submitText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },
});
