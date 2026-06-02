import React, { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Platform,
  Image,
  TextInput,
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
type SlidePreview = { title: string; imageUrl: string };

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

export default function LegalDocsAdmin() {
  const insets = useSafeAreaInsets();
  const [generating, setGenerating] = useState<DocType | null>(null);
  const [uploading, setUploading] = useState<DocType | null>(null);
  const [uploadingSlide, setUploadingSlide] = useState(false);
  const [publishing, setPublishing] = useState<"generated" | "uploaded" | null>(null);
  const [slidesGenerated, setSlidesGenerated] = useState<SlidePreview[] | null>(null);
  const [slidesUploaded, setSlidesUploaded] = useState<SlidePreview[] | null>(null);
  const [showGenPreview, setShowGenPreview] = useState(false);
  const [showUploadPreview, setShowUploadPreview] = useState(false);
  const [showCurrentPreview, setShowCurrentPreview] = useState(false);
  const [publishedMsg, setPublishedMsg] = useState<string | null>(null);
  const [slidePrompt, setSlidePrompt] = useState("");
  const [numSlides, setNumSlides] = useState("6");

  const { data: info, refetch } = useQuery<DocsInfoResponse>({
    queryKey: ["/api/admin/legal/docs-info"],
  });

  const { data: currentSlidesData, refetch: refetchCurrentSlides } = useQuery<{
    ok: boolean;
    slides: { id: string; title: string; imageUrl: string; isActive: boolean }[];
  }>({
    queryKey: ["/api/admin/legal/current-slides"],
  });

  const handleGenerate = async (docType: DocType) => {
    if (!info?.isOllamaConfigured) {
      Alert.alert("Ollama non configurato", "Configura OLLAMA_URL nelle variabili d'ambiente per usare questa funzione.");
      return;
    }
    setGenerating(docType);
    try {
      await apiRequest("POST", "/api/admin/legal/generate", { docType });
      await refetch();
      const label = info?.[docType]?.label || "Documento";
      Alert.alert("Completato", `${label} generato con successo.`);
    } catch (e: unknown) {
      Alert.alert("Errore", (e as Error).message || "Errore generazione");
    } finally {
      setGenerating(null);
    }
  };

  const handleUpload = async (docType: DocType, acceptsPdf?: boolean) => {
    try {
      const mimeType = acceptsPdf ? "application/pdf" : "text/plain";
      const result = await DocumentPicker.getDocumentAsync({ type: mimeType });
      if (result.canceled || !result.assets?.[0]) return;
      setUploading(docType);
      const file = result.assets[0];
      const formData = new FormData();
      const fileMime = acceptsPdf ? "application/pdf" : "text/plain";
      const fileExt = acceptsPdf ? "pdf" : "txt";
      await appendFileToForm(formData, "file", file.uri, fileMime, file.name || `document.${fileExt}`);
      const res = await fetch(
        new URL(`/api/admin/legal/upload/${docType}`, getApiUrl()).toString(),
        { method: "POST", body: formData, credentials: "include" }
      );
      const data = await res.json() as { message?: string };
      if (res.ok) {
        await refetch();
        Alert.alert("Successo", data.message || "Documento caricato");
      } else {
        Alert.alert("Errore", data.message || "Errore upload");
      }
    } catch (e: unknown) {
      Alert.alert("Errore", (e as Error).message || "Errore upload");
    } finally {
      setUploading(null);
    }
  };

  const handleDownload = (docType: DocType) => {
    const url = new URL(`/api/admin/legal/download/${docType}`, getApiUrl()).toString();
    const { Linking } = require("react-native");
    Linking.openURL(url);
  };

  const getDocInfo = (docType: DocType): DocInfo | undefined => {
    if (!info) return undefined;
    if (docType === "eula") return info.eula;
    if (docType === "privacy") return info.privacy;
    return info.manual;
  };

  const ollamaOk = info?.isOllamaConfigured ?? false;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
    >
      {/* ── Documenti Legali ── */}
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
        const isGenerating = generating === key;
        const isUploading = uploading === key;
        const manualMeta = key === "manual" ? (info?.manual?.fileMeta ?? null) : null;

        return (
          <View key={key} style={styles.card}>
            <View style={styles.cardHeader}>
              <View style={styles.cardHeaderLeft}>
                <View style={styles.iconCircle}>
                  <Ionicons name={icon} size={24} color={Colors.accent} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardTitle}>{docInfo?.label ?? key.toUpperCase()}</Text>
                  <Text style={styles.cardMeta}>
                    {docInfo?.hasContent
                      ? `Aggiornato: ${formatDate(docInfo.updatedAt)}`
                      : "Nessun documento disponibile"}
                    {manualMeta?.fileSize ? ` · ${formatSize(manualMeta.fileSize)}` : ""}
                  </Text>
                </View>
              </View>
            </View>

            {docInfo?.preview ? (
              <Text style={styles.preview} numberOfLines={3}>
                {docInfo.preview}…
              </Text>
            ) : (
              <Text style={styles.emptyPreview}>Nessun contenuto ancora generato o caricato.</Text>
            )}

            <View style={styles.actions}>
              <TouchableOpacity
                style={[styles.btn, styles.btnPrimary, !ollamaOk && styles.btnDisabled]}
                onPress={() => handleGenerate(key)}
                disabled={!ollamaOk || isGenerating}
              >
                {isGenerating ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <>
                    <MaterialCommunityIcons name="robot-outline" size={15} color="#fff" />
                    <Text style={styles.btnText}>Genera con Ollama</Text>
                  </>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.btn, styles.btnSecondary, isUploading && styles.btnDisabled]}
                onPress={() => handleUpload(key, acceptsPdf)}
                disabled={isUploading}
              >
                {isUploading ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <>
                    <Ionicons name="cloud-upload-outline" size={15} color="#fff" />
                    <Text style={styles.btnText}>{acceptsPdf ? "Carica PDF" : "Carica .txt"}</Text>
                  </>
                )}
              </TouchableOpacity>

              {docInfo?.hasContent && (
                <TouchableOpacity style={[styles.btn, styles.btnOutline]} onPress={() => handleDownload(key)}>
                  <Ionicons name="download-outline" size={15} color={Colors.accent} />
                  <Text style={[styles.btnText, { color: Colors.accent }]}>Scarica</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        );
      })}

      <SlidesPanel isOllamaConfigured={ollamaOk} />

      {/* padding bottom web */}
      {Platform.OS === "web" && <View style={{ height: 34 }} />}
    </ScrollView>
  );
}

