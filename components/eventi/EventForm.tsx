import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Alert,
  ActivityIndicator,
  Modal,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/colors";
import { apiRequest, queryClient, getApiUrl } from "@/lib/query-client";
import { showImagePickerMenu } from "@/lib/image-picker-utils";
import type { EventType, EventDTO } from "@/shared/event-types";
import { EventBasicFields } from "./EventBasicFields";
import { EventLocationFields } from "./EventLocationFields";
import { EventPhotosSection } from "./EventPhotosSection";
import { EventParticipantSettings } from "./EventParticipantSettings";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- react-native-maps lazy import
let MapView: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- react-native-maps lazy import
let Marker: any = null;
try {
  const maps = require("react-native-maps");
  MapView = maps.default;
  Marker = maps.Marker;
} catch {
  // no-op: react-native-maps is optional or handled via fallback
}

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
  websiteUrl: ""
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
    websiteUrl: evt.websiteUrl ?? ""
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
    enabled: visible
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
        selectedClubIds: inviteClubsEnabled ? selectedClubIds : []
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
            credentials: "include"
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
    }
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
          <EventBasicFields
            form={form}
            set={set}
            showTypePicker={showTypePicker}
            setShowTypePicker={setShowTypePicker}
            eventTypes={EVENT_TYPES}
          />

          <EventLocationFields
            form={form}
            set={set}
            showMapPicker={showMapPicker}
            setShowMapPicker={setShowMapPicker}
            mapRegion={mapRegion}
            setMapRegion={setMapRegion}
            tempCoords={tempCoords}
            setTempCoords={setTempCoords}
            confirmMapCoords={confirmMapCoords}
            coordLabel={coordLabel}
            MapView={MapView}
            Marker={Marker}
            insets={insets}
            italyCenter={ITALY_CENTER}
          />

          <EventParticipantSettings
            form={form}
            set={set}
            inviteClubsEnabled={inviteClubsEnabled}
            setInviteClubsEnabled={setInviteClubsEnabled}
            selectedClubIds={selectedClubIds}
            clubSearch={clubSearch}
            setClubSearch={setClubSearch}
            filteredClubs={filteredClubs}
            toggleClub={toggleClub}
          />

          <EventPhotosSection
            pendingImages={pendingImages}
            handlePickImage={handlePickImage}
            removeImage={removeImage}
          />
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
    backgroundColor: Colors.surface
  },
  closeBtn: {
    padding: 4
  },
  headerTitle: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 17,
    color: Colors.text
  },
  saveBtn: {
    backgroundColor: Colors.accent,
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 8,
    minWidth: 70,
    alignItems: "center"
  },
  saveBtnDisabled: {
    opacity: 0.6
  },
  saveBtnText: {
    fontFamily: "Inter_700Bold",
    fontSize: 14,
    color: "#000"
  },
  scroll: {
    flex: 1
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
    gap: 4
  },
  successScreen: {
    flex: 1,
    backgroundColor: Colors.background,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    gap: 16
  },
  successTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 24,
    color: Colors.text,
    textAlign: "center"
  },
  successBody: {
    fontFamily: "Inter_400Regular",
    fontSize: 15,
    color: Colors.textSecondary,
    textAlign: "center",
    lineHeight: 22
  },
  successBtn: {
    marginTop: 8,
    backgroundColor: Colors.accent,
    paddingHorizontal: 40,
    paddingVertical: 14,
    borderRadius: 12
  },
  successBtnText: {
    fontFamily: "Inter_700Bold",
    fontSize: 16,
    color: "#000"
  }
});
