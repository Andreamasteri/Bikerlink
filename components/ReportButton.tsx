/**
 * Task #2530 — Componente riusabile per segnalazione utenti dai vari contesti
 * (profilo, chat, match, post-meetup). Apre uno sheet con selezione categoria
 * + descrizione opzionale, chiama POST /api/reports con `category`, `context`,
 * `contextId`. Funziona anche se l'API risponde con i campi legacy.
 *
 * Pensato per essere usato come icona "bandierina" in header/menu — niente
 * testo a meno che `label` sia passato esplicitamente.
 */
import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useMutation } from "@tanstack/react-query";
import Colors from "@/constants/colors";
import { apiRequest } from "@/lib/query-client";

export type ReportCategory =
  | "aggressive"
  | "harassment"
  | "fake_profile"
  | "no_show"
  | "opportunist"
  | "group_misconduct"
  | "dangerous_riding"
  | "other";

export type ReportContext = "match" | "chat" | "profile" | "post_meetup" | "other";

const CATEGORY_OPTIONS: Array<{ key: ReportCategory; label: string; icon: keyof typeof Ionicons.glyphMap }> = [
  { key: "aggressive",       label: "Comportamento aggressivo", icon: "flame-outline" },
  { key: "harassment",       label: "Molestia / contatti insistenti", icon: "alert-circle-outline" },
  { key: "fake_profile",     label: "Profilo falso / bot",            icon: "person-remove-outline" },
  { key: "no_show",          label: "Non si è presentato",            icon: "time-outline" },
  { key: "opportunist",      label: "Opportunista / scrocco",         icon: "cash-outline" },
  { key: "group_misconduct", label: "Comportamento in gruppo",        icon: "people-outline" },
  { key: "dangerous_riding", label: "Guida pericolosa",               icon: "warning-outline" },
  { key: "other",            label: "Altro",                          icon: "ellipsis-horizontal" },
];

interface ReportButtonProps {
  reportedUserId: string;
  reportedNickname?: string;
  context: ReportContext;
  contextId?: string;
  label?: string;
  iconSize?: number;
  iconColor?: string;
  testID?: string;
}

export const ReportButton: React.FC<ReportButtonProps> = ({
  reportedUserId,
  reportedNickname,
  context,
  contextId,
  label,
  iconSize = 22,
  iconColor = Colors.warning,
  testID,
}) => {
  const insets = useSafeAreaInsets();
  const [visible, setVisible] = useState(false);
  const [category, setCategory] = useState<ReportCategory | null>(null);
  const [description, setDescription] = useState("");
  const [sent, setSent] = useState(false);

  const mutation = useMutation({
    mutationFn: async () => {
      if (!category) throw new Error("Seleziona una categoria");
      const reasonLabel = CATEGORY_OPTIONS.find((c) => c.key === category)?.label ?? "Altro";
      const res = await apiRequest("POST", "/api/reports", {
        reportedUserId,
        reason: reasonLabel,
        category,
        context,
        contextId,
        description: description.trim() || undefined,
      });
      return res.json();
    },
    onSuccess: () => {
      setSent(true);
    },
    onError: (e: unknown) => {
      const msg = e instanceof Error ? e.message : "Impossibile inviare la segnalazione";
      Alert.alert("Errore", msg);
    },
  });

  const handleClose = () => {
    setVisible(false);
    // Reset solo se è stato inviato (lascia stato in caso di chiusura accidentale)
    setTimeout(() => {
      if (sent) {
        setSent(false);
        setCategory(null);
        setDescription("");
      }
    }, 300);
  };

  return (
    <>
      <TouchableOpacity
        onPress={() => setVisible(true)}
        style={[styles.btn, label ? styles.btnWithLabel : null]}
        accessibilityRole="button"
        accessibilityLabel="Segnala utente"
        testID={testID ?? "report-button"}
      >
        <Ionicons name="flag-outline" size={iconSize} color={iconColor} />
        {label ? <Text style={[styles.btnLabel, { color: iconColor }]}>{label}</Text> : null}
      </TouchableOpacity>

      <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
        <Pressable style={styles.overlay} onPress={handleClose}>
          <Pressable style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]} onPress={() => {}}>
            <View style={styles.handle} />
            {sent ? (
              <View style={styles.successWrap}>
                <Ionicons name="checkmark-circle" size={48} color={Colors.success} />
                <Text style={styles.successTitle}>Segnalazione inviata</Text>
                <Text style={styles.successText}>
                  Il team di moderazione la valuterà al più presto. Grazie per aver contribuito a tenere BikerLink sicuro.
                </Text>
                <TouchableOpacity style={styles.closeBtn} onPress={handleClose}>
                  <Text style={styles.closeBtnText}>Chiudi</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <>
                <Text style={styles.title}>
                  Segnala {reportedNickname ?? "utente"}
                </Text>
                <Text style={styles.subtitle}>
                  Seleziona il motivo principale. Le segnalazioni sono private: il segnalato non vedrà mai chi le invia.
                </Text>
                <View style={styles.catList}>
                  {CATEGORY_OPTIONS.map((c) => {
                    const selected = category === c.key;
                    return (
                      <TouchableOpacity
                        key={c.key}
                        style={[styles.catItem, selected && styles.catItemSelected]}
                        onPress={() => setCategory(c.key)}
                        activeOpacity={0.7}
                        testID={`report-cat-${c.key}`}
                      >
                        <Ionicons name={c.icon} size={20} color={selected ? Colors.accent : Colors.textSecondary} />
                        <Text style={[styles.catText, selected && styles.catTextSelected]}>{c.label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                <TextInput
                  style={styles.input}
                  placeholder="Descrizione opzionale (max 500 caratteri)"
                  placeholderTextColor={Colors.textSecondary}
                  value={description}
                  onChangeText={setDescription}
                  multiline
                  numberOfLines={3}
                  maxLength={500}
                />
                <TouchableOpacity
                  style={[styles.submitBtn, (!category || mutation.isPending) && styles.submitBtnDisabled]}
                  onPress={() => mutation.mutate()}
                  disabled={!category || mutation.isPending}
                  activeOpacity={0.8}
                  testID="report-submit"
                >
                  {mutation.isPending ? (
                    <ActivityIndicator size="small" color={Colors.background} />
                  ) : (
                    <Text style={styles.submitBtnText}>Invia segnalazione</Text>
                  )}
                </TouchableOpacity>
              </>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
};

const styles = StyleSheet.create({
  btn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 8, paddingVertical: 6 },
  btnWithLabel: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border },
  btnLabel: { fontSize: 13, fontFamily: "Inter_500Medium" },
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  sheet: { backgroundColor: Colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingTop: 12, paddingHorizontal: 20, maxHeight: "90%" },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: Colors.border, alignSelf: "center", marginBottom: 16 },
  title: { fontSize: 18, fontFamily: "Inter_700Bold", color: Colors.text, marginBottom: 6 },
  subtitle: { fontSize: 13, fontFamily: "Inter_400Regular", color: Colors.textSecondary, marginBottom: 14, lineHeight: 18 },
  catList: { gap: 4, marginBottom: 12 },
  catItem: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10, paddingHorizontal: 14, borderRadius: 10, backgroundColor: Colors.background, borderWidth: 1, borderColor: Colors.border },
  catItemSelected: { borderColor: Colors.accent, backgroundColor: Colors.accent + "15" },
  catText: { fontSize: 14, fontFamily: "Inter_400Regular", color: Colors.text, flex: 1 },
  catTextSelected: { fontFamily: "Inter_500Medium", color: Colors.accent },
  input: { backgroundColor: Colors.background, borderRadius: 10, borderWidth: 1, borderColor: Colors.border, padding: 12, fontSize: 14, fontFamily: "Inter_400Regular", color: Colors.text, minHeight: 72, textAlignVertical: "top", marginBottom: 12 },
  submitBtn: { backgroundColor: Colors.accent, borderRadius: 12, paddingVertical: 14, alignItems: "center" },
  submitBtnDisabled: { opacity: 0.5 },
  submitBtnText: { fontSize: 16, fontFamily: "Inter_600SemiBold", color: Colors.background },
  successWrap: { alignItems: "center", paddingVertical: 24, gap: 12 },
  successTitle: { fontSize: 20, fontFamily: "Inter_700Bold", color: Colors.text },
  successText: { fontSize: 14, fontFamily: "Inter_400Regular", color: Colors.textSecondary, textAlign: "center", lineHeight: 20, paddingHorizontal: 16 },
  closeBtn: { backgroundColor: Colors.surface, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 32, borderWidth: 1, borderColor: Colors.border, marginTop: 8 },
  closeBtnText: { fontSize: 15, fontFamily: "Inter_500Medium", color: Colors.text },
});

export default ReportButton;
