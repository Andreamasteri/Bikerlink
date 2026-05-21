import React from "react";
import { View, Text, StyleSheet, TextInput, Pressable, Modal } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import type { EventType } from "@/shared/event-types";
import { EVENT_TYPE_LABELS } from "@/shared/event-types";

interface EventBasicFieldsProps {
  form: {
    title: string;
    eventType: EventType;
    description: string;
    eventDate: string;
    eventTime: string;
  };
  set: (key: any, value: any) => void;
  showTypePicker: boolean;
  setShowTypePicker: (show: boolean) => void;
  eventTypes: EventType[];
}

export function EventBasicFields({
  form,
  set,
  showTypePicker,
  setShowTypePicker,
  eventTypes,
}: EventBasicFieldsProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.sectionTitle}>Informazioni principali</Text>

      <Text style={styles.label}>Titolo *</Text>
      <TextInput
        style={styles.input}
        value={form.title}
        onChangeText={(v) => set("title", v)}
        placeholder="Nome dell'evento"
        placeholderTextColor={Colors.textSecondary}
        maxLength={120}
      />

      <Text style={styles.label}>Tipo di evento *</Text>
      <Pressable style={styles.pickerBtn} onPress={() => setShowTypePicker(true)}>
        <Text style={styles.pickerBtnText}>{EVENT_TYPE_LABELS[form.eventType]}</Text>
        <Ionicons name="chevron-down" size={16} color={Colors.textSecondary} />
      </Pressable>

      <Modal visible={showTypePicker} transparent animationType="fade" onRequestClose={() => setShowTypePicker(false)}>
        <Pressable style={styles.pickerOverlay} onPress={() => setShowTypePicker(false)}>
          <View style={styles.pickerMenu}>
            {eventTypes.map((t) => (
              <Pressable
                key={t}
                style={[styles.pickerOption, form.eventType === t && styles.pickerOptionActive]}
                onPress={() => { set("eventType", t); setShowTypePicker(false); }}
              >
                <Text style={[styles.pickerOptionText, form.eventType === t && { color: Colors.accent }]}>
                  {EVENT_TYPE_LABELS[t]}
                </Text>
                {form.eventType === t && <Ionicons name="checkmark" size={16} color={Colors.accent} />}
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>

      <Text style={styles.label}>Descrizione</Text>
      <TextInput
        style={[styles.input, styles.textArea]}
        value={form.description}
        onChangeText={(v) => set("description", v)}
        placeholder="Descrivi l'evento (opzionale)"
        placeholderTextColor={Colors.textSecondary}
        multiline
        numberOfLines={4}
      />

      <Text style={styles.sectionTitle}>Data e orario</Text>

      <Text style={styles.label}>Data * (GG.MM.AAAA)</Text>
      <TextInput
        style={styles.input}
        value={form.eventDate}
        onChangeText={(v) => set("eventDate", v)}
        placeholder="es. 12.07.2025"
        placeholderTextColor={Colors.textSecondary}
        keyboardType="numeric"
        maxLength={10}
      />

      <Text style={styles.label}>Orario (HH:MM, opzionale)</Text>
      <TextInput
        style={styles.input}
        value={form.eventTime}
        onChangeText={(v) => set("eventTime", v)}
        placeholder="es. 10:00"
        placeholderTextColor={Colors.textSecondary}
        keyboardType="numbers-and-punctuation"
        maxLength={5}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 4,
  },
  sectionTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 15,
    color: Colors.accent,
    marginTop: 16,
    marginBottom: 4,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  label: {
    fontFamily: "Inter_500Medium",
    fontSize: 13,
    color: Colors.textSecondary,
    marginTop: 10,
    marginBottom: 4,
  },
  input: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: Colors.text,
    fontFamily: "Inter_400Regular",
    fontSize: 14,
  },
  textArea: {
    height: 90,
    textAlignVertical: "top",
    paddingTop: 10,
  },
  pickerBtn: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  pickerBtnText: {
    fontFamily: "Inter_500Medium",
    fontSize: 14,
    color: Colors.text,
  },
  pickerOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    paddingHorizontal: 32,
  },
  pickerMenu: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    overflow: "hidden",
  },
  pickerOption: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  pickerOptionActive: {
    backgroundColor: Colors.surfaceLight,
  },
  pickerOptionText: {
    fontFamily: "Inter_500Medium",
    fontSize: 15,
    color: Colors.text,
  },
});
