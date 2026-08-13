import React, { useEffect, useRef, useState } from "react";
import { Alert, Modal, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { apiRequest } from "@/lib/query-client";
import { useColors } from "@/hooks/useColors";

type CoupleRow = { id: string; status: string; partner: { id: string; nickname: string; avatarUrl: string | null; userType: string } | null };
type CoupleData = { active: CoupleRow[]; incomingPending: CoupleRow[]; outgoingPending: CoupleRow[] };

export default function FixedCouplePanel() {
  const colors = useColors();
  const qc = useQueryClient();
  const [email, setEmail] = useState("");
  const [popup, setPopup] = useState<CoupleRow | null>(null);
  const shown = useRef<string | null>(null);
  const { data } = useQuery<CoupleData>({ queryKey: ["/api/fixed-couples"], staleTime: 0, refetchOnMount: "always" });
  useEffect(() => {
    const request = data?.incomingPending?.[0];
    if (request && shown.current !== request.id) { shown.current = request.id; setPopup(request); }
  }, [data?.incomingPending]);
  const invalidate = () => { qc.invalidateQueries({ queryKey: ["/api/fixed-couples"] }); qc.invalidateQueries({ queryKey: ["/api/notifications"] }); };
  const requestMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/fixed-couples/request", { email: email.trim().toLowerCase() }),
    onSuccess: () => { setEmail(""); invalidate(); Alert.alert("Richiesta inviata", "La controparte dovrà accettarla."); },
    onError: (error: Error) => Alert.alert("Impossibile inviare", error.message),
  });
  const respondMutation = useMutation({
    mutationFn: ({ id, action }: { id: string; action: "accept" | "reject" }) => apiRequest("POST", `/api/fixed-couples/${id}/${action}`, {}),
    onSuccess: () => { setPopup(null); invalidate(); },
    onError: (error: Error) => Alert.alert("Errore", error.message),
  });
  const active = data?.active?.[0];
  return <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>{
    active ? <View style={styles.row}><Ionicons name="people" size={22} color={colors.accent} /><View style={{ flex: 1 }}><Text style={[styles.title, { color: colors.text }]}>Coppia fissa</Text><Text style={{ color: colors.textSecondary ?? colors.text }}>con {active.partner?.nickname ?? "utente"}</Text></View></View> : null
  }<Text style={[styles.title, { color: colors.text }]}>Coppia fissa con…</Text>
    <Text style={{ color: colors.textSecondary ?? colors.text, marginBottom: 8 }}>Collega due account normali senza modificare i match.</Text>
    <View style={styles.inputRow}><TextInput value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" placeholder="Email biker o zavorrina" placeholderTextColor={colors.textSecondary ?? "#888"} style={[styles.input, { color: colors.text, borderColor: colors.border }]} /><Pressable onPress={() => requestMutation.mutate()} disabled={!email.trim() || requestMutation.isPending} style={[styles.button, { backgroundColor: colors.accent, opacity: !email.trim() || requestMutation.isPending ? 0.5 : 1 }]}><Text style={styles.buttonText}>Invia</Text></Pressable></View>
    {!!data?.outgoingPending?.length && <Text style={{ color: colors.textSecondary ?? colors.text, marginTop: 8 }}>Richiesta in attesa: {data.outgoingPending[0].partner?.nickname ?? "utente"}</Text>}
    <Modal visible={!!popup} transparent animationType="fade" onRequestClose={() => setPopup(null)}><View style={styles.overlay}><View style={[styles.modal, { backgroundColor: colors.surface }]}><Text style={[styles.modalTitle, { color: colors.text }]}>Richiesta di coppia fissa</Text><Text style={{ color: colors.text, marginBottom: 18 }}>{popup?.partner?.nickname ?? "Un utente"} vuole indicarti come controparte fissa.</Text><View style={styles.actions}><Pressable onPress={() => popup && respondMutation.mutate({ id: popup.id, action: "reject" })} style={[styles.secondary, { borderColor: colors.border }]}><Text style={{ color: colors.text }}>Rifiuta</Text></Pressable><Pressable onPress={() => popup && respondMutation.mutate({ id: popup.id, action: "accept" })} style={[styles.button, { backgroundColor: colors.accent }]}><Text style={styles.buttonText}>Accetta</Text></Pressable></View></View></View></Modal>
  </View>;
}
const styles = StyleSheet.create({
  card: { marginHorizontal: 16, marginVertical: 8, borderWidth: 1, borderRadius: 14, padding: 14, gap: 8 },
  row: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 6 },
  title: { fontSize: 16, fontWeight: "700" },
  inputRow: { flexDirection: "row", gap: 8, alignItems: "center" },
  input: { flex: 1, minHeight: 42, borderWidth: 1, borderRadius: 9, paddingHorizontal: 10 },
  button: { minHeight: 42, borderRadius: 9, paddingHorizontal: 16, alignItems: "center", justifyContent: "center" },
  buttonText: { color: "#fff", fontWeight: "700" },
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "center", padding: 24 },
  modal: { borderRadius: 16, padding: 20, gap: 8 },
  modalTitle: { fontSize: 18, fontWeight: "700" },
  actions: { flexDirection: "row", gap: 10, marginTop: 4 },
  secondary: { flex: 1, minHeight: 42, borderWidth: 1, borderRadius: 9, alignItems: "center", justifyContent: "center" },
});