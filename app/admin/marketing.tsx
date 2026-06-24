import React, { useState } from "react";
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Alert, TextInput, Modal, Platform, Switch, ActivityIndicator } from "react-native";
import { KeyboardAvoidingView } from "react-native";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import { useQuery, useMutation } from "@tanstack/react-query";
import { MaterialIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/colors";
import { apiRequest, queryClient } from "@/lib/query-client";
import { useT } from "@/lib/language-context";
import AdminChatWidget from "@/components/admin/AdminChatWidget";

interface Business {
  id: string;
  type: string;
  name: string;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  website: string | null;
  description: string | null;
  promoText: string | null;
  eventUrl: string | null;
  isApproved: boolean;
  isActive: boolean;
}

interface ReachConfig { radiusM: number; maxSpeedKmh: number }

interface ReportRow {
  businessId: string;
  name: string;
  type: string;
  qualifiedPassages: number;
  uniqueRiders: number;
  radiusM: number;
  computedAt: string | null;
  clicks: number;
  clicksByAction: Record<string, number>;
}

const ACCENT_DEALER = "#1565C0";
const ACCENT_VENUE = "#AD1457";

function currentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export default function AdminMarketing() {
  const t = useT();
  const insets = useSafeAreaInsets();
  const [showModal, setShowModal] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [fType, setFType] = useState<"locale" | "concessionaria">("locale");
  const [fName, setFName] = useState("");
  const [fAddress, setFAddress] = useState("");
  const [fLat, setFLat] = useState("");
  const [fLon, setFLon] = useState("");
  const [fPhone, setFPhone] = useState("");
  const [fWhatsapp, setFWhatsapp] = useState("");
  const [fWebsite, setFWebsite] = useState("");
  const [fPromo, setFPromo] = useState("");
  const [fEventUrl, setFEventUrl] = useState("");
  const [fDescription, setFDescription] = useState("");
  const [radiusInput, setRadiusInput] = useState("");
  const [speedInput, setSpeedInput] = useState("");

  const { data: businesses = [], isLoading } = useQuery<Business[]>({
    queryKey: ["/api/admin/business"],
  });
  const { data: config } = useQuery<ReachConfig>({
    queryKey: ["/api/admin/business/config"],
  });
  const { data: reportData } = useQuery<{ month: string; report: ReportRow[] }>({
    queryKey: ["/api/admin/business/report"],
    enabled: showReport,
  });

  const saveMutation = useMutation({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- business form payload
    mutationFn: async (data: any) => {
      const res = editId
        ? await apiRequest("PUT", `/api/admin/business/${editId}`, data)
        : await apiRequest("POST", "/api/admin/business", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/business"] });
      setShowModal(false);
      resetForm();
    },
  });

  const approveMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("PUT", `/api/admin/business/${id}/approve`, {});
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/admin/business"] }),
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      const res = await apiRequest("PUT", `/api/admin/business/${id}/toggle`, { isActive });
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/admin/business"] }),
  });

  const bulkMutation = useMutation({
    mutationFn: async (isActive: boolean) => {
      const res = await apiRequest("POST", "/api/admin/business/bulk-toggle", { isActive });
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/admin/business"] }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/admin/business/${id}`);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/admin/business"] }),
  });

  const configMutation = useMutation({
    mutationFn: async (data: { radiusM: number; maxSpeedKmh: number }) => {
      const res = await apiRequest("PUT", "/api/admin/business/config", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/business/config"] });
      setRadiusInput("");
      setSpeedInput("");
    },
  });

  const recomputeMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/business/recompute-passages", { month: currentMonth() });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/business/report"] });
      Alert.alert("Passaggi", "Ricalcolo completato.");
    },
  });

  function resetForm() {
    setEditId(null);
    setFType("locale");
    setFName(""); setFAddress(""); setFLat(""); setFLon("");
    setFPhone(""); setFWhatsapp(""); setFWebsite("");
    setFPromo(""); setFEventUrl(""); setFDescription("");
  }

  function openCreate() {
    resetForm();
    setShowModal(true);
  }

  function openEdit(b: Business) {
    setEditId(b.id);
    setFType(b.type === "concessionaria" ? "concessionaria" : "locale");
    setFName(b.name);
    setFAddress(b.address ?? "");
    setFLat(b.latitude != null ? String(b.latitude) : "");
    setFLon(b.longitude != null ? String(b.longitude) : "");
    setFPhone(b.phone ?? "");
    setFWhatsapp(b.whatsapp ?? "");
    setFWebsite(b.website ?? "");
    setFPromo(b.promoText ?? "");
    setFEventUrl(b.eventUrl ?? "");
    setFDescription(b.description ?? "");
    setShowModal(true);
  }

  function handleSave() {
    saveMutation.mutate({
      type: fType,
      name: fName,
      address: fAddress || null,
      latitude: fLat ? Number(fLat) : null,
      longitude: fLon ? Number(fLon) : null,
      phone: fPhone || null,
      whatsapp: fWhatsapp || null,
      website: fWebsite || null,
      promoText: fPromo || null,
      eventUrl: fEventUrl || null,
      description: fDescription || null,
      ...(editId ? {} : { isApproved: true, isActive: true }),
    });
  }

  function handleDelete(b: Business) {
    Alert.alert("Elimina business", `Eliminare "${b.name}"?`, [
      { text: t("common.cancel") || "Annulla", style: "cancel" },
      { text: t("common.delete") || "Elimina", style: "destructive", onPress: () => deleteMutation.mutate(b.id) },
    ]);
  }

  function handleSaveConfig() {
    const radiusM = Number(radiusInput) || config?.radiusM || 150;
    const maxSpeedKmh = Number(speedInput) || config?.maxSpeedKmh || 60;
    configMutation.mutate({ radiusM, maxSpeedKmh });
  }

  function renderItem({ item }: { item: Business }) {
    const accent = item.type === "concessionaria" ? ACCENT_DEALER : ACCENT_VENUE;
    return (
      <View style={styles.card}>
        <View style={[styles.typeDot, { backgroundColor: accent }]}>
          <MaterialIcons name={item.type === "concessionaria" ? "directions-car" : "storefront"} size={18} color="#fff" />
        </View>
        <View style={styles.info}>
          <Text style={styles.name}>{item.name}</Text>
          {item.address ? <Text style={styles.detail}>{item.address}</Text> : null}
          <View style={styles.badges}>
            <View style={[styles.badge, { backgroundColor: item.isApproved ? Colors.success + "33" : Colors.warning + "33" }]}>
              <Text style={[styles.badgeText, { color: item.isApproved ? Colors.success : Colors.warning }]}>
                {item.isApproved ? "Approvato" : "In attesa"}
              </Text>
            </View>
            {item.latitude == null || item.longitude == null ? (
              <View style={[styles.badge, { backgroundColor: Colors.error + "22" }]}>
                <Text style={[styles.badgeText, { color: Colors.error }]}>No posizione</Text>
              </View>
            ) : null}
          </View>
        </View>
        <View style={styles.itemRight}>
          <Switch
            value={item.isActive}
            onValueChange={(v) => toggleMutation.mutate({ id: item.id, isActive: v })}
            trackColor={{ true: accent, false: Colors.border }}
          />
          <View style={styles.actions}>
            {!item.isApproved ? (
              <TouchableOpacity onPress={() => approveMutation.mutate(item.id)} hitSlop={8}>
                <MaterialIcons name="check-circle" size={22} color={Colors.success} />
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity onPress={() => openEdit(item)} hitSlop={8}>
              <MaterialIcons name="edit" size={20} color={Colors.textSecondary} />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => handleDelete(item)} hitSlop={8}>
              <MaterialIcons name="delete" size={20} color={Colors.error} />
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  }

  const ListHeader = (
    <View>
      <AdminChatWidget />
      <View style={styles.configCard}>
        <Text style={styles.configTitle}>Passaggi qualificati</Text>
        <Text style={styles.configHint}>
          Raggio entro cui un rider conta come passaggio (m) e velocità massima per filtrare il transito veloce (km/h). Solo aggregati, nessuna traccia individuale.
        </Text>
        <View style={styles.configRow}>
          <View style={styles.configField}>
            <Text style={styles.configLabel}>Raggio (m)</Text>
            <TextInput
              style={styles.configInput}
              placeholder={String(config?.radiusM ?? 150)}
              placeholderTextColor={Colors.textSecondary}
              value={radiusInput}
              onChangeText={setRadiusInput}
              keyboardType="number-pad"
            />
          </View>
          <View style={styles.configField}>
            <Text style={styles.configLabel}>Vel. max (km/h)</Text>
            <TextInput
              style={styles.configInput}
              placeholder={String(config?.maxSpeedKmh ?? 60)}
              placeholderTextColor={Colors.textSecondary}
              value={speedInput}
              onChangeText={setSpeedInput}
              keyboardType="number-pad"
            />
          </View>
          <TouchableOpacity style={styles.configBtn} onPress={handleSaveConfig} disabled={configMutation.isPending}>
            <MaterialIcons name="save" size={20} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.bulkRow}>
        <TouchableOpacity style={[styles.bulkBtn, { backgroundColor: Colors.success }]} onPress={() => bulkMutation.mutate(true)} disabled={bulkMutation.isPending}>
          <MaterialIcons name="visibility" size={18} color="#fff" />
          <Text style={styles.bulkText}>Attiva tutti</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.bulkBtn, { backgroundColor: Colors.textSecondary }]} onPress={() => bulkMutation.mutate(false)} disabled={bulkMutation.isPending}>
          <MaterialIcons name="visibility-off" size={18} color="#fff" />
          <Text style={styles.bulkText}>Disattiva tutti</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.bulkBtn, { backgroundColor: ACCENT_VENUE }]} onPress={() => setShowReport(true)}>
          <MaterialIcons name="bar-chart" size={18} color="#fff" />
          <Text style={styles.bulkText}>Report</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <FlatList
        data={businesses}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        ListHeaderComponent={ListHeader}
        contentContainerStyle={{ paddingBottom: insets.bottom + 90, padding: 16 }}
        ListEmptyComponent={
          isLoading
            ? <Text style={styles.emptyText}>Caricamento...</Text>
            : <Text style={styles.emptyText}>Nessun business</Text>
        }
      />

      <TouchableOpacity style={styles.fab} onPress={openCreate}>
        <MaterialIcons name="add" size={28} color={Colors.background} />
      </TouchableOpacity>

      <Modal visible={showModal} animationType="slide" transparent>
        <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
          <View style={styles.modalOverlay}>
            <View style={[styles.modalContent, { paddingBottom: insets.bottom + 20 }]}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>{editId ? "Modifica business" : "Nuovo business"}</Text>
                <TouchableOpacity onPress={() => setShowModal(false)}>
                  <MaterialIcons name="close" size={24} color={Colors.textSecondary} />
                </TouchableOpacity>
              </View>
              <KeyboardAwareScrollViewCompat bottomOffset={20} keyboardShouldPersistTaps="handled">
                <View style={styles.typeToggle}>
                  <TouchableOpacity
                    style={[styles.typeOption, fType === "locale" && { backgroundColor: ACCENT_VENUE }]}
                    onPress={() => setFType("locale")}
                  >
                    <Text style={[styles.typeOptionText, fType === "locale" && { color: "#fff" }]}>Locale</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.typeOption, fType === "concessionaria" && { backgroundColor: ACCENT_DEALER }]}
                    onPress={() => setFType("concessionaria")}
                  >
                    <Text style={[styles.typeOptionText, fType === "concessionaria" && { color: "#fff" }]}>Concessionaria</Text>
                  </TouchableOpacity>
                </View>
                <TextInput style={styles.input} placeholder="Nome *" placeholderTextColor={Colors.textSecondary} value={fName} onChangeText={setFName} />
                <TextInput style={styles.input} placeholder="Indirizzo" placeholderTextColor={Colors.textSecondary} value={fAddress} onChangeText={setFAddress} />
                <View style={styles.row2}>
                  <TextInput style={[styles.input, styles.half]} placeholder="Latitudine" placeholderTextColor={Colors.textSecondary} value={fLat} onChangeText={setFLat} keyboardType="numbers-and-punctuation" />
                  <TextInput style={[styles.input, styles.half]} placeholder="Longitudine" placeholderTextColor={Colors.textSecondary} value={fLon} onChangeText={setFLon} keyboardType="numbers-and-punctuation" />
                </View>
                <TextInput style={styles.input} placeholder="Telefono" placeholderTextColor={Colors.textSecondary} value={fPhone} onChangeText={setFPhone} keyboardType="phone-pad" />
                <TextInput style={styles.input} placeholder="WhatsApp" placeholderTextColor={Colors.textSecondary} value={fWhatsapp} onChangeText={setFWhatsapp} keyboardType="phone-pad" />
                <TextInput style={styles.input} placeholder="Sito web" placeholderTextColor={Colors.textSecondary} value={fWebsite} onChangeText={setFWebsite} autoCapitalize="none" />
                <TextInput style={styles.input} placeholder="Promo/evento (testo)" placeholderTextColor={Colors.textSecondary} value={fPromo} onChangeText={setFPromo} />
                <TextInput style={styles.input} placeholder="Link evento (URL)" placeholderTextColor={Colors.textSecondary} value={fEventUrl} onChangeText={setFEventUrl} autoCapitalize="none" />
                <TextInput style={[styles.input, styles.textarea]} placeholder="Descrizione" placeholderTextColor={Colors.textSecondary} value={fDescription} onChangeText={setFDescription} multiline />
                <TouchableOpacity
                  style={[styles.submitBtn, !fName && styles.submitBtnDisabled]}
                  disabled={!fName || saveMutation.isPending}
                  onPress={handleSave}
                >
                  <Text style={styles.submitBtnText}>{saveMutation.isPending ? "Salvataggio..." : (editId ? "Salva" : "Crea business")}</Text>
                </TouchableOpacity>
              </KeyboardAwareScrollViewCompat>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={showReport} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { paddingBottom: insets.bottom + 20, maxHeight: "85%" }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Report reach — {reportData?.month ?? currentMonth()}</Text>
              <TouchableOpacity onPress={() => setShowReport(false)}>
                <MaterialIcons name="close" size={24} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>
            <TouchableOpacity style={styles.recomputeBtn} onPress={() => recomputeMutation.mutate()} disabled={recomputeMutation.isPending}>
              {recomputeMutation.isPending
                ? <ActivityIndicator color="#fff" size="small" />
                : <><MaterialIcons name="refresh" size={18} color="#fff" /><Text style={styles.recomputeText}>Ricalcola passaggi</Text></>}
            </TouchableOpacity>
            <FlatList
              data={reportData?.report ?? []}
              keyExtractor={(r) => r.businessId}
              contentContainerStyle={{ paddingBottom: 20 }}
              ListEmptyComponent={<Text style={styles.emptyText}>Nessun dato per il mese</Text>}
              renderItem={({ item }) => (
                <View style={styles.reportCard}>
                  <Text style={styles.reportName}>{item.name}</Text>
                  <View style={styles.reportStats}>
                    <View style={styles.statBox}>
                      <Text style={styles.statNum}>{item.qualifiedPassages}</Text>
                      <Text style={styles.statLabel}>Passaggi</Text>
                    </View>
                    <View style={styles.statBox}>
                      <Text style={styles.statNum}>{item.clicks}</Text>
                      <Text style={styles.statLabel}>Click</Text>
                    </View>
                  </View>
                  {Object.keys(item.clicksByAction).length > 0 ? (
                    <Text style={styles.reportActions}>
                      {Object.entries(item.clicksByAction).map(([k, v]) => `${k}: ${v}`).join("  ·  ")}
                    </Text>
                  ) : null}
                </View>
              )}
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  card: {
    backgroundColor: Colors.surface, borderRadius: 12, padding: 14, marginBottom: 12,
    flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: Colors.border, gap: 12,
  },
  typeDot: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  info: { flex: 1 },
  name: { fontFamily: "Inter_600SemiBold", fontSize: 15, color: Colors.text },
  detail: { fontFamily: "Inter_400Regular", fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  badges: { flexDirection: "row", gap: 6, marginTop: 6, flexWrap: "wrap" },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  badgeText: { fontFamily: "Inter_500Medium", fontSize: 10 },
  itemRight: { alignItems: "flex-end", gap: 8 },
  actions: { flexDirection: "row", gap: 14 },
  emptyText: { fontFamily: "Inter_400Regular", fontSize: 14, color: Colors.textSecondary, textAlign: "center", marginTop: 40 },
  configCard: { backgroundColor: Colors.surface, borderRadius: 12, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: Colors.border },
  configTitle: { fontFamily: "Inter_600SemiBold", fontSize: 15, color: Colors.text },
  configHint: { fontFamily: "Inter_400Regular", fontSize: 12, color: Colors.textSecondary, marginTop: 4, marginBottom: 12, lineHeight: 17 },
  configRow: { flexDirection: "row", alignItems: "flex-end", gap: 10 },
  configField: { flex: 1 },
  configLabel: { fontFamily: "Inter_500Medium", fontSize: 11, color: Colors.textSecondary, marginBottom: 4 },
  configInput: { backgroundColor: Colors.background, borderRadius: 10, padding: 10, fontFamily: "Inter_400Regular", fontSize: 14, color: Colors.text, borderWidth: 1, borderColor: Colors.border },
  configBtn: { backgroundColor: ACCENT_VENUE, borderRadius: 10, padding: 11, alignItems: "center", justifyContent: "center" },
  bulkRow: { flexDirection: "row", gap: 8, marginBottom: 16 },
  bulkBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, paddingVertical: 11, borderRadius: 10 },
  bulkText: { fontFamily: "Inter_600SemiBold", fontSize: 12, color: "#fff" },
  fab: {
    position: "absolute", bottom: 24, right: 24, width: 56, height: 56, borderRadius: 28,
    backgroundColor: Colors.accent, alignItems: "center", justifyContent: "center", elevation: 5,
    ...Platform.select({
      ios: { shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 4 },
      android: {},
      web: { boxShadow: "0px 2px 4px rgba(0,0,0,0.3)" },
    }),
  },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "flex-end" },
  modalContent: { backgroundColor: Colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, maxHeight: "90%" },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  modalTitle: { fontFamily: "Inter_600SemiBold", fontSize: 18, color: Colors.text, flex: 1 },
  typeToggle: { flexDirection: "row", gap: 8, marginBottom: 12 },
  typeOption: { flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: "center", backgroundColor: Colors.background, borderWidth: 1, borderColor: Colors.border },
  typeOptionText: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: Colors.text },
  input: {
    backgroundColor: Colors.background, borderRadius: 12, padding: 14, marginBottom: 12,
    fontFamily: "Inter_400Regular", fontSize: 15, color: Colors.text, borderWidth: 1, borderColor: Colors.border,
  },
  textarea: { minHeight: 80, textAlignVertical: "top" },
  row2: { flexDirection: "row", gap: 10 },
  half: { flex: 1 },
  submitBtn: { backgroundColor: Colors.accent, borderRadius: 12, padding: 16, alignItems: "center", marginTop: 8 },
  submitBtnDisabled: { opacity: 0.5 },
  submitBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 16, color: Colors.background },
  recomputeBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: ACCENT_DEALER, borderRadius: 10, padding: 12, marginBottom: 12 },
  recomputeText: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: "#fff" },
  reportCard: { backgroundColor: Colors.background, borderRadius: 12, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: Colors.border },
  reportName: { fontFamily: "Inter_600SemiBold", fontSize: 15, color: Colors.text, marginBottom: 8 },
  reportStats: { flexDirection: "row", gap: 24 },
  statBox: { alignItems: "center" },
  statNum: { fontFamily: "Inter_700Bold", fontSize: 22, color: Colors.accent },
  statLabel: { fontFamily: "Inter_400Regular", fontSize: 11, color: Colors.textSecondary, marginTop: 2 },
  reportActions: { fontFamily: "Inter_400Regular", fontSize: 12, color: Colors.textSecondary, marginTop: 8 },
});
