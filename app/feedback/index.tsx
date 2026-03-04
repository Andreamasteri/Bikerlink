import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  Modal,
  TextInput,
  Alert,
  ActivityIndicator,
  Platform,
} from "react-native";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { apiRequest, queryClient } from "@/lib/query-client";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const PRIORITIES = [
  { value: "bassa", label: "Bassa", color: Colors.textSecondary },
  { value: "media", label: "Media", color: Colors.warning },
  { value: "alta", label: "Alta", color: Colors.accentRed },
] as const;

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  nuovo: { label: "Nuovo", color: Colors.warning },
  in_lavorazione: { label: "In Lavorazione", color: Colors.maleIcon },
  risolto: { label: "Risolto", color: Colors.success },
  rifiutato: { label: "Rifiutato", color: Colors.accentRed },
};

export default function FeedbackScreen() {
  const insets = useSafeAreaInsets();
  const [showForm, setShowForm] = useState(false);
  const [formType, setFormType] = useState<"bug" | "richiesta_funzionalita">("bug");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("media");
  const [submitting, setSubmitting] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({ queryKey: ["/api/feedback"] });
  const tickets = (data as any)?.tickets || [];

  const openForm = (type: "bug" | "richiesta_funzionalita") => {
    setFormType(type);
    setTitle("");
    setDescription("");
    setPriority("media");
    setShowForm(true);
  };

  const submitTicket = async () => {
    if (!title.trim() || !description.trim()) {
      Alert.alert("Errore", "Titolo e descrizione sono obbligatori");
      return;
    }
    setSubmitting(true);
    try {
      await apiRequest("POST", "/api/feedback", {
        type: formType,
        title: title.trim(),
        description: description.trim(),
        priority,
      });
      setShowForm(false);
      queryClient.invalidateQueries({ queryKey: ["/api/feedback"] });
      Alert.alert("Inviato", "La tua segnalazione è stata inviata con successo!");
    } catch {
      Alert.alert("Errore", "Impossibile inviare la segnalazione");
    } finally {
      setSubmitting(false);
    }
  };

  const renderTicket = ({ item }: { item: any }) => {
    const statusCfg = STATUS_CONFIG[item.status] || STATUS_CONFIG.nuovo;
    const priorityCfg = PRIORITIES.find(p => p.value === item.priority);
    const isExpanded = expandedId === item.id;

    return (
      <Pressable style={styles.card} onPress={() => setExpandedId(isExpanded ? null : item.id)}>
        <View style={styles.cardHeader}>
          <View style={styles.cardHeaderLeft}>
            <Ionicons
              name={item.type === "bug" ? "bug" : "bulb"}
              size={18}
              color={item.type === "bug" ? Colors.accentRed : Colors.accent}
            />
            <Text style={styles.cardTitle} numberOfLines={isExpanded ? undefined : 1}>{item.title}</Text>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: statusCfg.color + "25" }]}>
            <Text style={[styles.statusText, { color: statusCfg.color }]}>{statusCfg.label}</Text>
          </View>
        </View>

        <View style={styles.cardMeta}>
          <Text style={styles.metaText}>
            {item.type === "bug" ? "Bug" : "Richiesta"} • Priorità: {priorityCfg?.label}
          </Text>
          <Text style={styles.metaText}>
            {new Date(item.createdAt).toLocaleDateString("it-IT")}
          </Text>
        </View>

        {isExpanded && (
          <View style={styles.expandedContent}>
            <Text style={styles.descriptionLabel}>Descrizione:</Text>
            <Text style={styles.descriptionText}>{item.description}</Text>

            {item.adminResponse && (
              <View style={styles.responseBox}>
                <View style={styles.responseHeader}>
                  <Ionicons name="shield-checkmark" size={16} color={Colors.accent} />
                  <Text style={styles.responseLabel}>Risposta Admin:</Text>
                </View>
                <Text style={styles.responseText}>{item.adminResponse}</Text>
              </View>
            )}
          </View>
        )}
      </Pressable>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.buttonsRow}>
        <Pressable style={[styles.actionBtn, { backgroundColor: Colors.accentRed + "20" }]} onPress={() => openForm("bug")}>
          <Ionicons name="bug" size={20} color={Colors.accentRed} />
          <Text style={[styles.actionBtnText, { color: Colors.accentRed }]}>Segnala Bug</Text>
        </Pressable>
        <Pressable style={[styles.actionBtn, { backgroundColor: Colors.accent + "20" }]} onPress={() => openForm("richiesta_funzionalita")}>
          <Ionicons name="bulb" size={20} color={Colors.accent} />
          <Text style={[styles.actionBtnText, { color: Colors.accent }]}>Richiedi Funzionalità</Text>
        </Pressable>
      </View>

      {isLoading ? (
        <ActivityIndicator size="large" color={Colors.accent} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={tickets}
          renderItem={renderTicket}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[styles.list, { paddingBottom: Platform.OS === "web" ? 34 : insets.bottom + 16 }]}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="chatbox-ellipses-outline" size={48} color={Colors.textSecondary} />
              <Text style={styles.emptyText}>Nessuna segnalazione inviata</Text>
              <Text style={styles.emptySubtext}>Usa i pulsanti qui sopra per segnalare bug o richiedere nuove funzionalità</Text>
            </View>
          }
          scrollEnabled={tickets.length > 0}
        />
      )}

      <Modal visible={showForm} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {formType === "bug" ? "Segnala Bug" : "Richiedi Funzionalità"}
              </Text>
              <Pressable onPress={() => setShowForm(false)}>
                <Ionicons name="close" size={24} color={Colors.text} />
              </Pressable>
            </View>

            <Text style={styles.inputLabel}>Titolo</Text>
            <TextInput
              style={styles.input}
              value={title}
              onChangeText={setTitle}
              placeholder={formType === "bug" ? "Descrivi brevemente il problema" : "Nome della funzionalità"}
              placeholderTextColor={Colors.textSecondary}
              maxLength={100}
            />

            <Text style={styles.inputLabel}>Descrizione</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={description}
              onChangeText={setDescription}
              placeholder="Descrivi in dettaglio..."
              placeholderTextColor={Colors.textSecondary}
              multiline
              numberOfLines={5}
              textAlignVertical="top"
            />

            <Text style={styles.inputLabel}>Priorità</Text>
            <View style={styles.priorityRow}>
              {PRIORITIES.map((p) => (
                <Pressable
                  key={p.value}
                  style={[styles.priorityBtn, priority === p.value && { backgroundColor: p.color + "30", borderColor: p.color }]}
                  onPress={() => setPriority(p.value)}
                >
                  <Text style={[styles.priorityBtnText, priority === p.value && { color: p.color }]}>{p.label}</Text>
                </Pressable>
              ))}
            </View>

            <Pressable
              style={[styles.submitBtn, submitting && { opacity: 0.6 }]}
              onPress={submitTicket}
              disabled={submitting}
            >
              {submitting ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.submitBtnText}>Invia Segnalazione</Text>
              )}
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  buttonsRow: { flexDirection: "row", gap: 10, padding: 16, paddingBottom: 0 },
  actionBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 14, borderRadius: 12 },
  actionBtnText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  list: { padding: 16 },
  card: { backgroundColor: Colors.surface, borderRadius: 12, padding: 14, marginBottom: 10 },
  cardHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  cardHeaderLeft: { flexDirection: "row", alignItems: "center", gap: 8, flex: 1 },
  cardTitle: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: Colors.text, flex: 1 },
  statusBadge: { paddingVertical: 3, paddingHorizontal: 8, borderRadius: 8 },
  statusText: { fontSize: 11, fontFamily: "Inter_500Medium" },
  cardMeta: { flexDirection: "row", justifyContent: "space-between", marginTop: 6 },
  metaText: { fontSize: 12, fontFamily: "Inter_400Regular", color: Colors.textSecondary },
  expandedContent: { marginTop: 12, borderTopWidth: 1, borderTopColor: Colors.border, paddingTop: 12 },
  descriptionLabel: { fontSize: 12, fontFamily: "Inter_500Medium", color: Colors.textSecondary, marginBottom: 4 },
  descriptionText: { fontSize: 14, fontFamily: "Inter_400Regular", color: Colors.text, lineHeight: 20 },
  responseBox: { marginTop: 12, backgroundColor: Colors.accent + "10", borderRadius: 10, padding: 12, borderLeftWidth: 3, borderLeftColor: Colors.accent },
  responseHeader: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 6 },
  responseLabel: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: Colors.accent },
  responseText: { fontSize: 14, fontFamily: "Inter_400Regular", color: Colors.text, lineHeight: 20 },
  empty: { alignItems: "center", paddingTop: 60, gap: 8 },
  emptyText: { fontSize: 16, fontFamily: "Inter_500Medium", color: Colors.textSecondary },
  emptySubtext: { fontSize: 13, fontFamily: "Inter_400Regular", color: Colors.textSecondary, textAlign: "center", paddingHorizontal: 40 },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "flex-end" },
  modalContent: { backgroundColor: Colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, maxHeight: "85%" },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 20 },
  modalTitle: { fontSize: 20, fontFamily: "Inter_700Bold", color: Colors.text },
  inputLabel: { fontSize: 13, fontFamily: "Inter_500Medium", color: Colors.textSecondary, marginBottom: 6, marginTop: 12 },
  input: { backgroundColor: Colors.background, borderRadius: 10, padding: 12, fontSize: 15, fontFamily: "Inter_400Regular", color: Colors.text, borderWidth: 1, borderColor: Colors.border },
  textArea: { minHeight: 100 },
  priorityRow: { flexDirection: "row", gap: 10 },
  priorityBtn: { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: "center", borderWidth: 1, borderColor: Colors.border },
  priorityBtnText: { fontSize: 14, fontFamily: "Inter_500Medium", color: Colors.textSecondary },
  submitBtn: { backgroundColor: Colors.accent, paddingVertical: 14, borderRadius: 12, alignItems: "center", marginTop: 20 },
  submitBtnText: { fontSize: 16, fontFamily: "Inter_600SemiBold", color: "#000" },
});
