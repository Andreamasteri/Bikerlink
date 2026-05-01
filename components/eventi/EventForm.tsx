import React, { useState, useCallback } from "react";
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
import { useMutation, useQuery } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/colors";
import { apiRequest, queryClient, getApiUrl } from "@/lib/query-client";
import { showImagePickerMenu } from "@/lib/image-picker-utils";
import type { EventType, EventDTO } from "@/shared/event-types";
import { EVENT_TYPE_LABELS } from "@/shared/event-types";

let MapView: any = null;
let Marker: any = null;
try {
  const maps = require("react-native-maps");
  MapView = maps.default;
  Marker = maps.Marker;
} catch {}

interface EventFormProps {
  visible: boolean;
  onClose: () => void;
  editingEvent?: EventDTO | null;
}

const EVENT_TYPES: EventType[] = ["raduno", "uscita_gruppo", "festa", "gara", "altro"];

interface ClubItem {
  id: string;
  name: string;
  clubType: string;
  region: string | null;
  brandName: string | null;
  memberCount: number;
}

interface FormState {
  title: string;
  eventType: EventType;
  description: string;
  eventDate: string;
  eventTime: string;
  locationName: string;
  latitude: string;
  longitude: string;
  isRecurring: boolean;
  recurrenceInfo: string;
  maxParticipants: string;
  websiteUrl: string;
}

const EMPTY_FORM: FormState = {
  title: "",
  eventType: "raduno",
  description: "",
  eventDate: "",
  eventTime: "",
  locationName: "",
  latitude: "",
  longitude: "",
  isRecurring: false,
  recurrenceInfo: "",
  maxParticipants: "",
  websiteUrl: "",
};

function toFormState(evt: EventDTO): FormState {
  return {
    title: evt.title,
    eventType: evt.eventType,
    description: evt.description ?? "",
    eventDate: evt.eventDate ? evt.eventDate.substring(0, 10).split("-").reverse().join(".") : "",
    eventTime: evt.eventTime ?? "",
    locationName: evt.locationName ?? "",
    latitude: evt.latitude != null ? String(evt.latitude) : "",
    longitude: evt.longitude != null ? String(evt.longitude) : "",
    isRecurring: evt.isRecurring,
    recurrenceInfo: evt.recurrenceInfo ?? "",
    maxParticipants: evt.maxParticipants ? String(evt.maxParticipants) : "",
    websiteUrl: evt.websiteUrl ?? "",
  };
}

const ITALY_CENTER = { latitude: 41.9, longitude: 12.5, latitudeDelta: 8, longitudeDelta: 8 };

export default function EventForm({ visible, onClose, editingEvent }: EventFormProps) {
  const insets = useSafeAreaInsets();
  const isEditing = !!editingEvent;

  const [form, setForm] = useState<FormState>(
    editingEvent ? toFormState(editingEvent) : EMPTY_FORM
  );
  const [pendingImages, setPendingImages] = useState<string[]>([]);
  const [submitted, setSubmitted] = useState(false);
  const [showTypePicker, setShowTypePicker] = useState(false);
  const [showMapPicker, setShowMapPicker] = useState(false);
  const [mapRegion, setMapRegion] = useState(ITALY_CENTER);
  const [tempCoords, setTempCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [inviteClubsEnabled, setInviteClubsEnabled] = useState(false);
  const [selectedClubIds, setSelectedClubIds] = useState<string[]>([]);
  const [clubSearch, setClubSearch] = useState("");

  const { data: clubsList = [] } = useQuery<ClubItem[]>({
    queryKey: ["/api/events/clubs-list"],
    enabled: visible,
  });

  React.useEffect(() => {
    if (visible) {
      setForm(editingEvent ? toFormState(editingEvent) : EMPTY_FORM);
      setPendingImages([]);
      setSubmitted(false);
      setInviteClubsEnabled(false);
      setSelectedClubIds([]);
      setClubSearch("");
      setTempCoords(null);
    }
  }, [visible, editingEvent]);

  React.useEffect(() => {
    if (!inviteClubsEnabled) {
      setSelectedClubIds([]);
      setClubSearch("");
    }
  }, [inviteClubsEnabled]);

  const set = (key: keyof FormState, value: string | boolean) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const toggleClub = useCallback((id: string) => {
    setSelectedClubIds((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]
    );
  }, []);

  const filteredClubs = clubsList.filter((c) =>
    c.name.toLowerCase().includes(clubSearch.toLowerCase()) ||
    (c.region ?? "").toLowerCase().includes(clubSearch.toLowerCase()) ||
    (c.brandName ?? "").toLowerCase().includes(clubSearch.toLowerCase())
  );

  const confirmMapCoords = () => {
    if (tempCoords) {
      set("latitude", String(tempCoords.latitude.toFixed(6)));
      set("longitude", String(tempCoords.longitude.toFixed(6)));
    }
    setShowMapPicker(false);
  };

  const createMutation = useMutation({
    mutationFn: async () => {
      const maxP = form.maxParticipants ? parseInt(form.maxParticipants) : undefined;
      const body: Record<string, unknown> = {
        title: form.title.trim(),
        eventType: form.eventType,
        description: form.description.trim() || undefined,
        eventDate: form.eventDate.split(".").reverse().join("-"),
        eventTime: form.eventTime.trim() || undefined,
        locationName: form.locationName.trim(),
        latitude: form.latitude ? parseFloat(form.latitude) : undefined,
        longitude: form.longitude ? parseFloat(form.longitude) : undefined,
        isRecurring: form.isRecurring,
        recurrenceInfo: form.isRecurring ? form.recurrenceInfo.trim() || undefined : undefined,
        maxParticipants: maxP && maxP > 0 ? maxP : undefined,
        websiteUrl: form.websiteUrl.trim() || undefined,
        selectedClubIds: inviteClubsEnabled ? selectedClubIds : [],
      };

      let evt: EventDTO;
      if (isEditing && editingEvent) {
        const res = await apiRequest("PUT", `/api/events/${editingEvent.id}`, body);
        const json = await res.json();
        evt = json as EventDTO;
      } else {
        const res = await apiRequest("POST", "/api/events", body);
        const json = await res.json();
        evt = (json.event ?? json) as EventDTO;
      }

      for (const uri of pendingImages) {
        try {
          const formData = new FormData();
          const filename = uri.split("/").pop() ?? "image.jpg";
          formData.append("image", { uri, name: filename, type: "image/jpeg" } as unknown as Blob);
          const imgRes = await fetch(`${getApiUrl()}/api/events/${evt.id}/images`, {
            method: "POST",
            body: formData,
            credentials: "include",
          });
          if (!imgRes.ok) {
            console.warn("[EventForm] Upload immagine fallito:", imgRes.status);
          }
        } catch (imgErr) {
          console.error("[EventForm] Errore upload immagine:", imgErr);
        }
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
      Alert.alert("Attenzione", "La data è obbligatoria (formato GG.MM.AAAA)");
      return;
    }
    if (!/^\d{2}\.\d{2}\.\d{4}$/.test(form.eventDate)) {
      Alert.alert("Attenzione", "Formato data non valido. Usa GG.MM.AAAA (es. 12.07.2025)");
      return;
    }
    if (!form.locationName.trim()) {
      Alert.alert("Attenzione", "Il luogo dell'evento è obbligatorio");
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

  const coordLabel =
    form.latitude && form.longitude
      ? `${parseFloat(form.latitude).toFixed(4)}, ${parseFloat(form.longitude).toFixed(4)}`
      : null;

  if (submitted) {
    return (
      <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
        <View style={[styles.successScreen, { paddingTop: insets.top }]}>
          <Ionicons name="checkmark-circle" size={64} color={Colors.success} />
          <Text style={styles.successTitle}>
            {isEditing ? "Evento aggiornato!" : "Evento pubblicato!"}
          </Text>
          {!isEditing && (
            <Text style={styles.successBody}>
              Evento creato e pubblicato con successo!
              {inviteClubsEnabled && selectedClubIds.length > 0
                ? ` I club selezionati sono stati notificati.`
                : ""}
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
      <View style={[styles.container, { paddingTop: insets.top }]}>
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
              <Text style={styles.saveBtnText}>{isEditing ? "Salva" : "Pubblica"}</Text>
            )}
          </Pressable>
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: insets.bottom + 20 },
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

          <Text style={styles.label}>Luogo dell'evento *</Text>
          <TextInput
            style={styles.input}
            value={form.locationName}
            onChangeText={(v) => set("locationName", v)}
            placeholder="Nome del luogo o indirizzo"
            placeholderTextColor={Colors.textSecondary}
          />

          <Text style={styles.label}>Coordinate GPS (opzionale)</Text>
          {MapView ? (
            <>
              <Pressable style={styles.mapPickerBtn} onPress={() => {
                if (form.latitude && form.longitude) {
                  const lat = parseFloat(form.latitude);
                  const lng = parseFloat(form.longitude);
                  setMapRegion({ latitude: lat, longitude: lng, latitudeDelta: 0.05, longitudeDelta: 0.05 });
                  setTempCoords({ latitude: lat, longitude: lng });
                } else {
                  setMapRegion(ITALY_CENTER);
                  setTempCoords(null);
                }
                setShowMapPicker(true);
              }}>
                <Ionicons
                  name={coordLabel ? "location" : "map-outline"}
                  size={18}
                  color={coordLabel ? Colors.accent : Colors.textSecondary}
                />
                <Text style={[styles.mapPickerText, coordLabel ? { color: Colors.accent } : {}]}>
                  {coordLabel ? `📍 ${coordLabel}` : "Seleziona posizione sulla mappa"}
                </Text>
                {coordLabel && (
                  <Pressable
                    onPress={() => { set("latitude", ""); set("longitude", ""); }}
                    hitSlop={8}
                  >
                    <Ionicons name="close-circle" size={18} color={Colors.textSecondary} />
                  </Pressable>
                )}
              </Pressable>

              <Modal visible={showMapPicker} animationType="slide" onRequestClose={() => setShowMapPicker(false)}>
                <View style={[styles.mapModal, { paddingTop: Platform.OS === "ios" ? insets.top : 0 }]}>
                  <View style={styles.mapHeader}>
                    <Pressable onPress={() => setShowMapPicker(false)} style={styles.mapHeaderBtn}>
                      <Text style={styles.mapHeaderBtnText}>Annulla</Text>
                    </Pressable>
                    <Text style={styles.mapHeaderTitle}>Tocca per posizionare il pin</Text>
                    <Pressable onPress={confirmMapCoords} style={[styles.mapHeaderBtn, styles.mapConfirmBtn]}>
                      <Text style={[styles.mapHeaderBtnText, { color: Colors.accent }]}>Conferma</Text>
                    </Pressable>
                  </View>
                  <MapView
                    style={{ flex: 1 }}
                    region={mapRegion}
                    onRegionChangeComplete={setMapRegion}
                    onPress={(e: any) => {
                      const { latitude, longitude } = e.nativeEvent.coordinate;
                      setTempCoords({ latitude, longitude });
                    }}
                  >
                    {tempCoords && <Marker coordinate={tempCoords} pinColor={Colors.accent} />}
                  </MapView>
                  {tempCoords && (
                    <View style={styles.coordBanner}>
                      <Text style={styles.coordBannerText}>
                        {tempCoords.latitude.toFixed(5)}, {tempCoords.longitude.toFixed(5)}
                      </Text>
                    </View>
                  )}
                </View>
              </Modal>
            </>
          ) : (
            <View style={styles.coordRow}>
              <TextInput
                style={[styles.input, styles.coordInput]}
                value={form.latitude}
                onChangeText={(v) => set("latitude", v)}
                placeholder="Latitudine"
                placeholderTextColor={Colors.textSecondary}
                keyboardType="decimal-pad"
              />
              <TextInput
                style={[styles.input, styles.coordInput]}
                value={form.longitude}
                onChangeText={(v) => set("longitude", v)}
                placeholder="Longitudine"
                placeholderTextColor={Colors.textSecondary}
                keyboardType="decimal-pad"
              />
            </View>
          )}

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

          <Text style={styles.sectionTitle}>Invita Motoclub</Text>

          <View style={styles.toggleRow}>
            <View style={styles.toggleLeft}>
              <Text style={styles.toggleLabel}>Seleziona club da invitare</Text>
              <Text style={styles.toggleHint}>
                {inviteClubsEnabled && selectedClubIds.length > 0
                  ? `${selectedClubIds.length} club selezionat${selectedClubIds.length === 1 ? "o" : "i"}`
                  : "I club verranno notificati alla creazione"}
              </Text>
            </View>
            <Switch
              value={inviteClubsEnabled}
              onValueChange={setInviteClubsEnabled}
              trackColor={{ true: Colors.accent, false: Colors.border }}
              thumbColor="#fff"
            />
          </View>

          {inviteClubsEnabled && (
            <View style={styles.clubPickerContainer}>
              <View style={styles.clubSearchRow}>
                <Ionicons name="search" size={16} color={Colors.textSecondary} style={{ marginRight: 8 }} />
                <TextInput
                  style={styles.clubSearchInput}
                  value={clubSearch}
                  onChangeText={setClubSearch}
                  placeholder="Cerca club per nome o regione..."
                  placeholderTextColor={Colors.textSecondary}
                />
                {clubSearch.length > 0 && (
                  <Pressable onPress={() => setClubSearch("")} hitSlop={8}>
                    <Ionicons name="close-circle" size={16} color={Colors.textSecondary} />
                  </Pressable>
                )}
              </View>

              {filteredClubs.length === 0 ? (
                <Text style={styles.clubEmptyText}>Nessun club trovato</Text>
              ) : (
                filteredClubs.map((club) => {
                  const isSelected = selectedClubIds.includes(club.id);
                  const subtitle = club.brandName
                    ? `Brand · ${club.brandName}`
                    : club.region
                    ? `Regione · ${club.region}`
                    : club.clubType;
                  return (
                    <Pressable
                      key={club.id}
                      style={[styles.clubRow, isSelected && styles.clubRowSelected]}
                      onPress={() => toggleClub(club.id)}
                    >
                      <View style={styles.clubRowLeft}>
                        <Text style={[styles.clubName, isSelected && { color: Colors.accent }]}>
                          {club.name}
                        </Text>
                        <Text style={styles.clubSubtitle}>{subtitle}</Text>
                      </View>
                      <View style={[styles.checkbox, isSelected && styles.checkboxSelected]}>
                        {isSelected && <Ionicons name="checkmark" size={14} color="#000" />}
                      </View>
                    </Pressable>
                  );
                })
              )}
            </View>
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
  mapPickerBtn: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  mapPickerText: {
    flex: 1,
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    color: Colors.textSecondary,
  },
  mapModal: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  mapHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: Colors.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  mapHeaderTitle: {
    fontFamily: "Inter_500Medium",
    fontSize: 14,
    color: Colors.text,
  },
  mapHeaderBtn: {
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  mapConfirmBtn: {},
  mapHeaderBtnText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 15,
    color: Colors.textSecondary,
  },
  coordBanner: {
    position: "absolute",
    bottom: 40,
    left: 16,
    right: 16,
    backgroundColor: "rgba(0,0,0,0.75)",
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    alignItems: "center",
  },
  coordBannerText: {
    fontFamily: "Inter_500Medium",
    fontSize: 14,
    color: "#fff",
  },
  coordRow: {
    flexDirection: "row",
    gap: 8,
  },
  coordInput: {
    flex: 1,
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
  clubPickerContainer: {
    marginTop: 8,
    backgroundColor: Colors.surface,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: "hidden",
  },
  clubSearchRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  clubSearchInput: {
    flex: 1,
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    color: Colors.text,
  },
  clubEmptyText: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: "center",
    paddingVertical: 16,
  },
  clubRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  clubRowSelected: {
    backgroundColor: Colors.surfaceLight,
  },
  clubRowLeft: {
    flex: 1,
    gap: 2,
  },
  clubName: {
    fontFamily: "Inter_500Medium",
    fontSize: 14,
    color: Colors.text,
  },
  clubSubtitle: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: Colors.textSecondary,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: Colors.border,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 8,
  },
  checkboxSelected: {
    backgroundColor: Colors.accent,
    borderColor: Colors.accent,
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
