import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  ScrollView,
  Pressable,
  Alert,
  ActivityIndicator,
  Switch,
  Platform,
  Modal,
  Image,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useMutation } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/colors";
import { apiRequest, queryClient, getApiUrl } from "@/lib/query-client";
import { showImagePickerMenu } from "@/lib/image-picker-utils";
import type { EventType, EventDTO } from "@/shared/event-types";
import { EVENT_TYPE_LABELS } from "@/shared/event-types";

interface EventFormProps {
  visible: boolean;
  onClose: () => void;
  editingEvent?: EventDTO | null;
}

const EVENT_TYPES: EventType[] = ["raduno", "uscita_gruppo", "festa", "gara", "altro"];

interface FormState {
  title: string;
  eventType: EventType;
  description: string;
  eventDate: string;
  eventTime: string;
  locationName: string;
  isRecurring: boolean;
  recurrenceInfo: string;
  maxParticipants: string;
  websiteUrl: string;
  autoInviteReason: string;
  autoInviteRegion: string;
  autoInviteBrand: string;
}

const EMPTY_FORM: FormState = {
  title: "",
  eventType: "raduno",
  description: "",
  eventDate: "",
  eventTime: "",
  locationName: "",
  isRecurring: false,
  recurrenceInfo: "",
  maxParticipants: "",
  websiteUrl: "",
  autoInviteReason: "",
  autoInviteRegion: "",
  autoInviteBrand: "",
};

function toFormState(evt: EventDTO): FormState {
  return {
    title: evt.title,
    eventType: evt.eventType,
    description: evt.description ?? "",
    eventDate: evt.eventDate ? evt.eventDate.substring(0, 10) : "",
    eventTime: evt.eventTime ?? "",
    locationName: evt.locationName ?? "",
    isRecurring: evt.isRecurring,
    recurrenceInfo: evt.recurrenceInfo ?? "",
    maxParticipants: evt.maxParticipants ? String(evt.maxParticipants) : "",
    websiteUrl: evt.websiteUrl ?? "",
    autoInviteReason: evt.autoInviteReason ?? "",
    autoInviteRegion: evt.autoInviteRegion ?? "",
    autoInviteBrand: evt.autoInviteBrand ?? "",
  };
}

export default function EventForm({ visible, onClose, editingEvent }: EventFormProps) {
  const insets = useSafeAreaInsets();
  const isEditing = !!editingEvent;

  const [form, setForm] = useState<FormState>(
    editingEvent ? toFormState(editingEvent) : EMPTY_FORM
  );
  const [pendingImages, setPendingImages] = useState<string[]>([]);
  const [submitted, setSubmitted] = useState(false);
  const [showTypePicker, setShowTypePicker] = useState(false);

  React.useEffect(() => {
    if (visible) {
      setForm(editingEvent ? toFormState(editingEvent) : EMPTY_FORM);
      setPendingImages([]);
      setSubmitted(false);
    }
  }, [visible, editingEvent]);

  const set = (key: keyof FormState, value: string | boolean) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const createMutation = useMutation({
    mutationFn: async () => {
      const maxP = form.maxParticipants ? parseInt(form.maxParticipants) : undefined;
      const body: Record<string, unknown> = {
        title: form.title.trim(),
        eventType: form.eventType,
        description: form.description.trim() || undefined,
        eventDate: form.eventDate,
        eventTime: form.eventTime.trim() || undefined,
        locationName: form.locationName.trim() || undefined,
        isRecurring: form.isRecurring,
        recurrenceInfo: form.isRecurring ? form.recurrenceInfo.trim() || undefined : undefined,
        maxParticipants: maxP && maxP > 0 ? maxP : undefined,
        websiteUrl: form.websiteUrl.trim() || undefined,
        autoInviteReason: form.autoInviteReason.trim() || undefined,
        autoInviteRegion: form.autoInviteRegion.trim() || undefined,
        autoInviteBrand: form.autoInviteBrand.trim() || undefined,
      };

      let evt: EventDTO;
      if (isEditing && editingEvent) {
        const res = await apiRequest("PUT", `/api/events/${editingEvent.id}`, body);
        evt = await res.json();
      } else {
        const res = await apiRequest("POST", "/api/events", body);
        evt = await res.json();
      }

      for (const uri of pendingImages) {
        try {
          const formData = new FormData();
          const filename = uri.split("/").pop() ?? "image.jpg";
          formData.append("image", { uri, name: filename, type: "image/jpeg" } as unknown as Blob);
          await fetch(`${getApiUrl()}/api/events/${evt.id}/images`, {
            method: "POST",
            body: formData,
            credentials: "include",
          });
        } catch {}
      }

      return evt;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/events"] });
      queryClient.invalidateQueries({ queryKey: ["/api/events/my"] });
      if (isEditing && editingEvent) {
        queryClient.invalidateQueries({ queryKey: ["/api/events", editingEvent.id] });
      }
      setSubmitted(true);
    },
    onError: (err: Error) => {
      Alert.alert("Errore", err.message || "Impossibile salvare l'evento");
    },
  });

  const handleSubmit = () => {
    if (!form.title.trim()) {
      Alert.alert("Attenzione", "Il titolo è obbligatorio");
      return;
    }
    if (!form.eventDate) {
      Alert.alert("Attenzione", "La data è obbligatoria (formato AAAA-MM-GG)");
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(form.eventDate)) {
      Alert.alert("Attenzione", "Formato data non valido. Usa AAAA-MM-GG (es. 2025-07-12)");
      return;
    }
    if (form.websiteUrl && !/^https?:\/\/.+/.test(form.websiteUrl)) {
      Alert.alert("Attenzione", "L'URL del sito deve iniziare con http:// o https://");
      return;
    }
    createMutation.mutate();
  };

  const handlePickImage = () => {
    if (pendingImages.length >= 5) {
      Alert.alert("Limite raggiunto", "Puoi caricare al massimo 5 locandine");
      return;
    }
    showImagePickerMenu(
      (uri) => setPendingImages((prev) => [...prev, uri]),
      { aspect: [3, 4], quality: 0.8, allowsEditing: true }
    );
  };

  const removeImage = (idx: number) => {
    setPendingImages((prev) => prev.filter((_, i) => i !== idx));
  };

  if (submitted) {
    return (
      <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
        <View style={[styles.successScreen, { paddingTop: insets.top + (Platform.OS === "web" ? 67 : 0) }]}>
          <Ionicons name="checkmark-circle" size={64} color={Colors.success} />
          <Text style={styles.successTitle}>
            {isEditing ? "Evento aggiornato!" : "Evento inviato!"}
          </Text>
          {!isEditing && (
            <Text style={styles.successBody}>
              Il tuo evento è in attesa di approvazione da parte dei moderatori. Riceverai una notifica quando verrà approvato.
            </Text>
          )}
          <Pressable style={styles.successBtn} onPress={onClose}>
            <Text style={styles.successBtnText}>Chiudi</Text>
          </Pressable>
        </View>
      </Modal>
    );
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={[styles.container, { paddingTop: Platform.OS === "web" ? 67 : insets.top }]}>
        <View style={styles.header}>
          <Pressable onPress={onClose} style={styles.closeBtn}>
            <Ionicons name="close" size={24} color={Colors.text} />
          </Pressable>
          <Text style={styles.headerTitle}>
            {isEditing ? "Modifica Evento" : "Nuovo Evento"}
          </Text>
          <Pressable
            onPress={handleSubmit}
            style={[styles.saveBtn, createMutation.isPending && styles.saveBtnDisabled]}
            disabled={createMutation.isPending}
          >
            {createMutation.isPending ? (
              <ActivityIndicator size="small" color="#000" />
            ) : (
              <Text style={styles.saveBtnText}>{isEditing ? "Salva" : "Invia"}</Text>
            )}
          </Pressable>
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: insets.bottom + (Platform.OS === "web" ? 34 : 20) },
          ]}
          keyboardShouldPersistTaps="handled"
        >
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
                {EVENT_TYPES.map((t) => (
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

          <Text style={styles.sectionTitle}>Data e luogo</Text>

          <Text style={styles.label}>Data * (AAAA-MM-GG)</Text>
          <TextInput
            style={styles.input}
            value={form.eventDate}
            onChangeText={(v) => set("eventDate", v)}
            placeholder="es. 2025-07-12"
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

          <Text style={styles.label}>Luogo</Text>
          <TextInput
            style={styles.input}
            value={form.locationName}
            onChangeText={(v) => set("locationName", v)}
            placeholder="Nome del luogo o indirizzo"
            placeholderTextColor={Colors.textSecondary}
          />

          <Text style={styles.sectionTitle}>Dettagli evento</Text>

          <View style={styles.toggleRow}>
            <View style={styles.toggleLeft}>
              <Text style={styles.toggleLabel}>Evento ricorrente</Text>
              <Text style={styles.toggleHint}>Es. ogni anno, ogni mese, ecc.</Text>
            </View>
            <Switch
              value={form.isRecurring}
              onValueChange={(v) => set("isRecurring", v)}
              trackColor={{ true: Colors.accent, false: Colors.border }}
              thumbColor="#fff"
            />
          </View>

          {form.isRecurring && (
            <>
              <Text style={styles.label}>Descrivi la ricorrenza</Text>
              <TextInput
                style={styles.input}
                value={form.recurrenceInfo}
                onChangeText={(v) => set("recurrenceInfo", v)}
                placeholder="Es. ogni prima domenica del mese / ogni anno a luglio"
                placeholderTextColor={Colors.textSecondary}
              />
            </>
          )}

          <Text style={styles.label}>Max partecipanti (0 = illimitato)</Text>
          <TextInput
            style={styles.input}
            value={form.maxParticipants}
            onChangeText={(v) => set("maxParticipants", v)}
            placeholder="0"
            placeholderTextColor={Colors.textSecondary}
            keyboardType="numeric"
          />

          <Text style={styles.label}>Sito web (opzionale)</Text>
          <TextInput
            style={styles.input}
            value={form.websiteUrl}
            onChangeText={(v) => set("websiteUrl", v)}
            placeholder="https://..."
            placeholderTextColor={Colors.textSecondary}
            keyboardType="url"
            autoCapitalize="none"
          />

          <Text style={styles.sectionTitle}>Locandine</Text>
          <Text style={styles.hint}>Carica fino a 5 immagini promozionali (JPG)</Text>

          <View style={styles.imagesGrid}>
            {pendingImages.map((uri, idx) => (
              <View key={idx} style={styles.imageThumb}>
                <Image source={{ uri }} style={styles.thumbImg} />
                <Pressable style={styles.removeImg} onPress={() => removeImage(idx)}>
                  <Ionicons name="close-circle" size={20} color={Colors.accentRed} />
                </Pressable>
              </View>
            ))}
            {pendingImages.length < 5 && (
              <Pressable style={styles.addImageBtn} onPress={handlePickImage}>
                <Ionicons name="add-circle-outline" size={32} color={Colors.accent} />
                <Text style={styles.addImageText}>Aggiungi</Text>
              </Pressable>
            )}
          </View>

          <Text style={styles.sectionTitle}>Inviti automatici ai club</Text>
          <Text style={styles.hint}>
            Se compilato, all'approvazione dell'evento i club verranno automaticamente invitati.
          </Text>

          <Text style={styles.label}>Motivo dell'invito</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            value={form.autoInviteReason}
            onChangeText={(v) => set("autoInviteReason", v)}
            placeholder="Spiega perché i club dovrebbero partecipare (lascia vuoto per non invitare)"
            placeholderTextColor={Colors.textSecondary}
            multiline
            numberOfLines={3}
          />

          {!!form.autoInviteReason && (
            <>
              <Text style={styles.label}>Filtra per regione (opzionale)</Text>
              <TextInput
                style={styles.input}
                value={form.autoInviteRegion}
                onChangeText={(v) => set("autoInviteRegion", v)}
                placeholder="Es. Lombardia, Veneto... (vuoto = tutte)"
                placeholderTextColor={Colors.textSecondary}
              />

              <Text style={styles.label}>Filtra per marca moto (opzionale)</Text>
              <TextInput
                style={styles.input}
                value={form.autoInviteBrand}
                onChangeText={(v) => set("autoInviteBrand", v)}
                placeholder="Es. Ducati, Honda... (vuoto = tutte)"
                placeholderTextColor={Colors.textSecondary}
              />
            </>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  closeBtn: {
    padding: 4,
  },
  headerTitle: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 17,
    color: Colors.text,
  },
  saveBtn: {
    backgroundColor: Colors.accent,
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 8,
    minWidth: 70,
    alignItems: "center",
  },
  saveBtnDisabled: {
    opacity: 0.6,
  },
  saveBtnText: {
    fontFamily: "Inter_700Bold",
    fontSize: 14,
    color: "#000",
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
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
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginTop: 10,
  },
  toggleLeft: {
    flex: 1,
    gap: 2,
  },
  toggleLabel: {
    fontFamily: "Inter_500Medium",
    fontSize: 14,
    color: Colors.text,
  },
  toggleHint: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: Colors.textSecondary,
  },
  hint: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: Colors.textSecondary,
    marginBottom: 8,
  },
  imagesGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 4,
  },
  imageThumb: {
    width: 80,
    height: 80,
    borderRadius: 8,
    overflow: "visible",
    position: "relative",
  },
  thumbImg: {
    width: 80,
    height: 80,
    borderRadius: 8,
  },
  removeImg: {
    position: "absolute",
    top: -8,
    right: -8,
    backgroundColor: Colors.background,
    borderRadius: 10,
  },
  addImageBtn: {
    width: 80,
    height: 80,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: Colors.accent,
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  addImageText: {
    fontFamily: "Inter_500Medium",
    fontSize: 11,
    color: Colors.accent,
  },
  successScreen: {
    flex: 1,
    backgroundColor: Colors.background,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    gap: 16,
  },
  successTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 24,
    color: Colors.text,
    textAlign: "center",
  },
  successBody: {
    fontFamily: "Inter_400Regular",
    fontSize: 15,
    color: Colors.textSecondary,
    textAlign: "center",
    lineHeight: 22,
  },
  successBtn: {
    marginTop: 8,
    backgroundColor: Colors.accent,
    paddingHorizontal: 40,
    paddingVertical: 14,
    borderRadius: 12,
  },
  successBtnText: {
    fontFamily: "Inter_700Bold",
    fontSize: 16,
    color: "#000",
  },
});
