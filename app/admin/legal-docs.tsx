import React, { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Platform,
  Modal,
} from "react-native";
import { styles } from "./legal-docs.styles";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as DocumentPicker from "expo-document-picker";
import { useQuery } from "@tanstack/react-query";
import { getApiUrl, apiRequest } from "@/lib/query-client";
import { appendFileToForm } from "@/lib/image-picker-utils";
import Colors from "@/constants/colors";
import { SlidesPanel } from "@/components/admin/SlidesPanel";

type DocType = "eula" | "privacy" | "manual";

interface DocInfo {
  label: string;
  hasContent: boolean;
  preview: string | null;
  updatedAt: string | null;
}
interface ManualInfo extends DocInfo {
  fileMeta: { fileName?: string; fileSize?: number; uploadedAt?: string } | null;
}
interface DocsInfoResponse {
  eula: DocInfo;
  privacy: DocInfo;
  manual: ManualInfo;
  isOllamaConfigured: boolean;
}

const DOC_CONFIG: { key: DocType; icon: React.ComponentProps<typeof Ionicons>["name"]; acceptsPdf?: boolean }[] = [
  { key: "eula", icon: "shield-checkmark-outline" },
  { key: "privacy", icon: "lock-closed-outline" },
  { key: "manual", icon: "book-outline", acceptsPdf: true },
];

function formatSize(bytes?: number): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso?: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("it-IT", { day: "2-digit", month: "short", year: "numeric" });
}

type DraftMap = Record<DocType, string | null>;
type DraftSource = Record<DocType, "ai" | "file" | null>;
type BoolMap = Record<DocType, boolean>;

const mkDraft = (): DraftMap => ({ eula: null, privacy: null, manual: null });
const mkSrc = (): DraftSource => ({ eula: null, privacy: null, manual: null });
const mkBool = (): BoolMap => ({ eula: false, privacy: false, manual: false });

export default function LegalDocsAdmin() {
  const insets = useSafeAreaInsets();
  const [draftText, setDraftText] = useState<DraftMap>(mkDraft());
  const [draftSrc, setDraftSrc] = useState<DraftSource>(mkSrc());
  const [generating, setGenerating] = useState<BoolMap>(mkBool());
  const [uploading, setUploading] = useState<BoolMap>(mkBool());
  const [activating, setActivating] = useState<BoolMap>(mkBool());
  const [viewModal, setViewModal] = useState<DocType | null>(null);

  const { data: info, refetch } = useQuery<DocsInfoResponse>({
    queryKey: ["/api/admin/legal/docs-info"],
  });

  const setDraft = (key: DocType, text: string | null, src: "ai" | "file" | null) => {
    setDraftText(prev => ({ ...prev, [key]: text }));
    setDraftSrc(prev => ({ ...prev, [key]: src }));
  };

  const handleGenerate = async (key: DocType) => {
    if (!info?.isOllamaConfigured) {
      Alert.alert("Ollama non configurato", "Configura OLLAMA_URL nelle variabili d'ambiente.");
      return;
    }
    setGenerating(prev => ({ ...prev, [key]: true }));
    try {
      const res = await apiRequest("POST", "/api/admin/legal/generate", { docType: key });
      const result = await res.json() as { ok: boolean; text: string };
      setDraft(key, result.text, "ai");
    } catch (e: unknown) {
      Alert.alert("Errore", (e as Error).message || "Errore generazione");
    } finally {
      setGenerating(prev => ({ ...prev, [key]: false }));
    }
  };

  const handleUpload = async (key: DocType, acceptsPdf?: boolean) => {
    try {
      const mimeType = acceptsPdf ? "application/pdf" : "text/plain";
      const result = await DocumentPicker.getDocumentAsync({ type: mimeType });
      if (result.canceled || !result.assets?.[0]) return;
      setUploading(prev => ({ ...prev, [key]: true }));
      const file = result.assets[0];
      const formData = new FormData();
      const fileMime = acceptsPdf ? "application/pdf" : "text/plain";
      const fileExt = acceptsPdf ? "pdf" : "txt";
      await appendFileToForm(formData, "file", file.uri, fileMime, file.name || `document.${fileExt}`);
      const res = await fetch(
        new URL(`/api/admin/legal/upload/${key}`, getApiUrl()).toString(),
        { method: "POST", body: formData, credentials: "include" }
      );
      const data = await res.json() as { ok?: boolean; text?: string; message?: string };
      if (res.ok) {
        if (acceptsPdf) {
          await refetch();
          Alert.alert("Successo", "Manuale PDF caricato e attivato");
        } else {
          setDraft(key, data.text ?? "", "file");
        }
      } else {
        Alert.alert("Errore", data.message || "Errore upload");
      }
    } catch (e: unknown) {
      Alert.alert("Errore", (e as Error).message || "Errore upload");
    } finally {
      setUploading(prev => ({ ...prev, [key]: false }));
    }
  };

  const handleActivate = async (key: DocType) => {
    const text = draftText[key];
    if (!text) return;
    setActivating(prev => ({ ...prev, [key]: true }));
    try {
      await apiRequest("POST", `/api/admin/legal/save/${key}`, { text });
      setDraft(key, null, null);
      await refetch();
      Alert.alert("Attivato", "Documento attivato nell'app");
    } catch (e: unknown) {
      Alert.alert("Errore", (e as Error).message || "Errore attivazione");
    } finally {
      setActivating(prev => ({ ...prev, [key]: false }));
    }
  };

  const handleDownload = (key: DocType) => {
    const url = new URL(`/api/admin/legal/download/${key}`, getApiUrl()).toString();
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { Linking } = require("react-native");
    Linking.openURL(url);
  };

  const getDocInfo = (key: DocType): DocInfo | undefined => {
    if (!info) return undefined;
    if (key === "eula") return info.eula;
    if (key === "privacy") return info.privacy;
    return info.manual;
  };

  const ollamaOk = info?.isOllamaConfigured ?? false;
  const viewDocInfo = viewModal ? getDocInfo(viewModal) : null;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
    >
      <View style={styles.sectionHeader}>
        <Ionicons name="documents-outline" size={20} color={Colors.textSecondary} />
        <Text style={styles.sectionTitle}>DOCUMENTI LEGALI</Text>
      </View>

      {!ollamaOk && (
        <View style={styles.warningBanner}>
          <Ionicons name="warning-outline" size={16} color="#F59E0B" />
          <Text style={styles.warningText}>Ollama non configurato — il tasto "Genera" è disabilitato</Text>
        </View>
      )}

      {DOC_CONFIG.map(({ key, icon, acceptsPdf }) => {
        const docInfo = getDocInfo(key);
        const draft = draftText[key];
        const src = draftSrc[key];
        const isGen = generating[key];
        const isUp = uploading[key];
        const isAct = activating[key];
        const manualMeta = key === "manual" ? (info?.manual?.fileMeta ?? null) : null;

        return (
          <View key={key} style={styles.card}>
            {/* Header */}
            <View style={styles.cardHeader}>
              <View style={styles.cardHeaderLeft}>
                <View style={styles.iconCircle}>
                  <Ionicons name={icon} size={24} color={Colors.accent} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardTitle}>{docInfo?.label ?? key.toUpperCase()}</Text>
                  <Text style={styles.cardMeta}>
                    {docInfo?.hasContent
                      ? `Attivo: ${formatDate(docInfo.updatedAt)}`
                      : "Nessun documento attivo"}
                    {manualMeta?.fileSize ? ` · ${formatSize(manualMeta.fileSize)}` : ""}
                  </Text>
                </View>
              </View>
            </View>

            {/* Bozza pronta */}
            {draft && (
              <View style={styles.draftBanner}>
                <Ionicons name="document-text-outline" size={13} color="#60A5FA" />
                <Text style={styles.draftBannerText} numberOfLines={2}>
                  {draft.slice(0, 110)}{draft.length > 110 ? "…" : ""}
                </Text>
              </View>
            )}

            {/* 3 colonne */}
            <View style={styles.colGrid}>
              {/* Col 1 — IA */}
              <View style={styles.col}>
                <Text style={styles.colLabel}>⚡ IA</Text>
                <TouchableOpacity
                  style={[styles.btn, styles.btnSlides, (!ollamaOk || isGen) && styles.btnDisabled]}
                  onPress={() => handleGenerate(key)}
                  disabled={!ollamaOk || isGen}
                >
                  {isGen
                    ? <ActivityIndicator size="small" color="#fff" />
                    : <><MaterialCommunityIcons name="auto-fix" size={13} color="#fff" /><Text style={styles.btnText}>Genera</Text></>}
                </TouchableOpacity>
                {draft && src === "ai" && (
                  <TouchableOpacity
                    style={[styles.btn, styles.btnActivate, isAct && styles.btnDisabled]}
                    onPress={() => handleActivate(key)}
                    disabled={isAct}
                  >
                    {isAct
                      ? <ActivityIndicator size="small" color="#fff" />
                      : <><Ionicons name="checkmark-circle-outline" size={13} color="#fff" /><Text style={styles.btnText}>Attiva</Text></>}
                  </TouchableOpacity>
                )}
              </View>

              <View style={styles.colDivider} />

              {/* Col 2 — File */}
              <View style={styles.col}>
                <Text style={styles.colLabel}>📂 FILE</Text>
                <TouchableOpacity
                  style={[styles.btn, styles.btnSecondary, isUp && styles.btnDisabled]}
                  onPress={() => handleUpload(key, acceptsPdf)}
                  disabled={isUp}
                >
                  {isUp
                    ? <ActivityIndicator size="small" color="#fff" />
                    : <><Ionicons name="cloud-upload-outline" size={13} color="#fff" /><Text style={styles.btnText}>{acceptsPdf ? "PDF" : ".txt"}</Text></>}
                </TouchableOpacity>
                {draft && src === "file" && (
                  <TouchableOpacity
                    style={[styles.btn, styles.btnActivate, isAct && styles.btnDisabled]}
                    onPress={() => handleActivate(key)}
                    disabled={isAct}
                  >
                    {isAct
                      ? <ActivityIndicator size="small" color="#fff" />
                      : <><Ionicons name="checkmark-circle-outline" size={13} color="#fff" /><Text style={styles.btnText}>Attiva</Text></>}
                  </TouchableOpacity>
                )}
              </View>

              <View style={styles.colDivider} />

              {/* Col 3 — In App */}
              <View style={styles.col}>
                <Text style={styles.colLabel}>📋 IN APP</Text>
                <TouchableOpacity
                  style={[styles.btn, styles.btnOutline, !docInfo?.hasContent && styles.btnDisabled]}
                  onPress={() => setViewModal(key)}
                  disabled={!docInfo?.hasContent}
                >
                  <Ionicons name="eye-outline" size={13} color={Colors.accent} />
                  <Text style={[styles.btnText, { color: Colors.accent }]}>Vedi</Text>
                </TouchableOpacity>
                {docInfo?.hasContent && (
                  <TouchableOpacity
                    style={[styles.btn, styles.btnOutline]}
                    onPress={() => handleDownload(key)}
                  >
                    <Ionicons name="download-outline" size={13} color={Colors.accent} />
                    <Text style={[styles.btnText, { color: Colors.accent }]}>Scarica</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          </View>
        );
      })}

      <SlidesPanel isOllamaConfigured={ollamaOk} />

      {Platform.OS === "web" && <View style={{ height: 34 }} />}

      {/* Modal — visualizza documento attivo */}
      <Modal
        visible={viewModal !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setViewModal(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{viewDocInfo?.label ?? ""}</Text>
              <TouchableOpacity
                onPress={() => setViewModal(null)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons name="close" size={22} color={Colors.text} />
              </TouchableOpacity>
            </View>
            <Text style={styles.modalMeta}>
              Aggiornato: {formatDate(viewDocInfo?.updatedAt)}
            </Text>
            <ScrollView style={styles.modalBody} showsVerticalScrollIndicator>
              {viewDocInfo?.preview ? (
                <Text style={styles.modalText}>{viewDocInfo.preview}</Text>
              ) : (
                <Text style={[styles.modalText, { fontStyle: "italic" }]}>Nessun contenuto.</Text>
              )}
              <Text style={styles.modalTruncNote}>
                — Anteprima (primi 200 caratteri). Usa "Scarica" per il testo completo.
              </Text>
            </ScrollView>
            <TouchableOpacity
              style={[styles.btn, styles.btnOutline, { margin: 14, marginTop: 4 }]}
              onPress={() => { const k = viewModal; setViewModal(null); if (k) handleDownload(k); }}
            >
              <Ionicons name="download-outline" size={14} color={Colors.accent} />
              <Text style={[styles.btnText, { color: Colors.accent }]}>Scarica testo completo</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}
