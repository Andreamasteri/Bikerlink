import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Platform,
  Image,
  TextInput,
} from "react-native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as DocumentPicker from "expo-document-picker";
import { useQuery } from "@tanstack/react-query";
import { getApiUrl, apiRequest, queryClient } from "@/lib/query-client";
import { appendFileToForm } from "@/lib/image-picker-utils";
import Colors from "@/constants/colors";

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
  const [generating, setGenerating] = useState<DocType | "slides" | null>(null);
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

  const handleGenerateSlides = async () => {
    if (!info?.isOllamaConfigured) {
      Alert.alert("Ollama non configurato", "Configura OLLAMA_URL nelle variabili d'ambiente per usare questa funzione.");
      return;
    }
    const n = Math.max(1, Math.min(20, parseInt(numSlides, 10) || 6));
    setGenerating("slides");
    setSlidesGenerated(null);
    setShowGenPreview(false);
    setPublishedMsg(null);
    try {
      const slidesRes = await apiRequest("POST", "/api/admin/legal/generate-slides", {
        numSlides: n,
        ...(slidePrompt.trim() ? { customPrompt: slidePrompt.trim() } : {}),
      });
      const result = await slidesRes.json() as { ok: boolean; slides: SlidePreview[] };
      setSlidesGenerated(result.slides ?? []);
      setShowGenPreview(true);
    } catch (e: unknown) {
      Alert.alert("Errore", (e as Error).message || "Errore generazione slide");
    } finally {
      setGenerating(null);
    }
  };

  const handlePublishSlides = async (slides: SlidePreview[], source: "generated" | "uploaded") => {
    if (!slides || slides.length === 0) return;
    Alert.alert(
      "Pubblica slide",
      `Pubblicare ${slides.length} slide come campagne attive nella home?`,
      [
        { text: "Annulla", style: "cancel" },
        {
          text: "Pubblica",
          onPress: async () => {
            setPublishing(source);
            try {
              const res = await apiRequest("POST", "/api/admin/legal/publish-slides", { slides });
              const result = await res.json() as { created: number };
              setPublishedMsg(`${result.created} slide pubblicate come campagne attive`);
              if (source === "generated") { setSlidesGenerated(null); setShowGenPreview(false); }
              else { setSlidesUploaded(null); setShowUploadPreview(false); }
              queryClient.invalidateQueries({ queryKey: ["/api/admin/advertisements"] });
              refetchCurrentSlides();
            } catch (e: unknown) {
              Alert.alert("Errore", (e as Error).message || "Errore pubblicazione slide");
            } finally {
              setPublishing(null);
            }
          },
        },
      ]
    );
  };

  const handleUploadSlideImage = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: "image/*" });
      if (result.canceled || !result.assets?.[0]) return;
      setUploadingSlide(true);
      const file = result.assets[0];
      const formData = new FormData();
      const mime = file.mimeType || "image/png";
      const ext = mime.includes("png") ? "png" : "jpg";
      await appendFileToForm(formData, "file", file.uri, mime, file.name || `slide.${ext}`);
      const res = await fetch(
        new URL("/api/admin/legal/upload-slide-image", getApiUrl()).toString(),
        { method: "POST", body: formData, credentials: "include" }
      );
      const data = await res.json() as { ok?: boolean; imageUrl?: string; title?: string; message?: string };
      if (res.ok && data.imageUrl) {
        const newSlide: SlidePreview = { imageUrl: data.imageUrl, title: data.title || file.name || "Slide" };
        setSlidesUploaded((prev) => (prev ? [...prev, newSlide] : [newSlide]));
        setShowUploadPreview(true);
      } else {
        Alert.alert("Errore", data.message || "Errore upload immagine");
      }
    } catch (e: unknown) {
      Alert.alert("Errore", (e as Error).message || "Errore upload");
    } finally {
      setUploadingSlide(false);
    }
  };

  const handleDownloadCurrentSlides = () => {
    const { Linking } = require("react-native");
    const slides = currentSlidesData?.slides ?? [];
    if (slides.length === 0) return;
    slides.forEach((s, i) => {
      const url = new URL(s.imageUrl, getApiUrl()).toString();
      setTimeout(() => Linking.openURL(url), i * 300);
    });
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

      {/* ── Slide Esplicative ── */}
      <View style={[styles.sectionHeader, { marginTop: 24 }]}>
        <Ionicons name="easel-outline" size={20} color={Colors.textSecondary} />
        <Text style={styles.sectionTitle}>SLIDE ESPLICATIVE</Text>
      </View>

      <View style={styles.card}>
        {/* Header */}
        <View style={styles.cardHeader}>
          <View style={styles.cardHeaderLeft}>
            <View style={[styles.iconCircle, { backgroundColor: "#1E3A5F" }]}>
              <MaterialCommunityIcons name="presentation" size={24} color="#60A5FA" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitle}>Slide "Come funziona BikerLink"</Text>
              <Text style={styles.cardMeta}>PNG 1080×600 — pubblicate come campagne nella home</Text>
            </View>
          </View>
        </View>

        {/* Prompt personalizzato */}
        <TextInput
          style={styles.promptInput}
          multiline
          numberOfLines={3}
          placeholder={`Prompt AI (lascia vuoto per default):\n"Genera slide su come funziona BikerLink..."`}
          placeholderTextColor={Colors.textSecondary}
          value={slidePrompt}
          onChangeText={setSlidePrompt}
          textAlignVertical="top"
        />

        {/* Numero slide */}
        <View style={styles.numSlidesRow}>
          <Text style={styles.numSlidesLabel}>N. slide (1–20):</Text>
          <TextInput
            style={styles.numSlidesInput}
            keyboardType="number-pad"
            maxLength={2}
            value={numSlides}
            onChangeText={(v) => setNumSlides(v.replace(/[^0-9]/g, ""))}
            onBlur={() => {
              const n = parseInt(numSlides, 10);
              if (!n || n < 1) setNumSlides("1");
              else if (n > 20) setNumSlides("20");
            }}
          />
        </View>

        {/* Banner successo */}
        {publishedMsg !== null && (
          <View style={styles.successBanner}>
            <Ionicons name="checkmark-circle" size={18} color="#22C55E" />
            <Text style={styles.successText}>{publishedMsg}</Text>
          </View>
        )}

        {/* ── GENERA CON AI ── */}
        <View style={styles.subSection}>
          <Text style={styles.subSectionTitle}>⚡  GENERA CON AI</Text>
          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.btn, styles.btnSlides, (!ollamaOk || generating === "slides") && styles.btnDisabled]}
              onPress={handleGenerateSlides}
              disabled={!ollamaOk || generating === "slides"}
            >
              {generating === "slides"
                ? <><ActivityIndicator size="small" color="#fff" /><Text style={styles.btnText}>Generazione…</Text></>
                : <><MaterialCommunityIcons name="auto-fix" size={14} color="#fff" /><Text style={styles.btnText}>Genera</Text></>}
            </TouchableOpacity>

            {slidesGenerated && (
              <TouchableOpacity style={[styles.btn, styles.btnOutline]} onPress={() => setShowGenPreview((v) => !v)}>
                <Ionicons name={showGenPreview ? "eye-off-outline" : "eye-outline"} size={14} color={Colors.accent} />
                <Text style={[styles.btnText, { color: Colors.accent }]}>
                  {showGenPreview ? "Nascondi" : `Vedi (${slidesGenerated.length})`}
                </Text>
              </TouchableOpacity>
            )}

            {slidesGenerated && (
              <TouchableOpacity
                style={[styles.btn, styles.btnPublish, publishing === "generated" && styles.btnDisabled]}
                onPress={() => handlePublishSlides(slidesGenerated, "generated")}
                disabled={publishing === "generated"}
              >
                {publishing === "generated"
                  ? <><ActivityIndicator size="small" color="#fff" /><Text style={styles.btnText}>Pubblicazione…</Text></>
                  : <><Ionicons name="rocket-outline" size={14} color="#fff" /><Text style={styles.btnText}>Pubblica</Text></>}
              </TouchableOpacity>
            )}
          </View>
          {showGenPreview && slidesGenerated && <SlidesScrollPreview slides={slidesGenerated} />}
        </View>

        {/* ── CARICA FILE PNG ── */}
        <View style={styles.subSection}>
          <Text style={styles.subSectionTitle}>📂  CARICA FILE PNG</Text>
          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.btn, styles.btnSecondary, uploadingSlide && styles.btnDisabled]}
              onPress={handleUploadSlideImage}
              disabled={uploadingSlide}
            >
              {uploadingSlide
                ? <><ActivityIndicator size="small" color="#fff" /><Text style={styles.btnText}>Caricamento…</Text></>
                : <><Ionicons name="cloud-upload-outline" size={14} color="#fff" /><Text style={styles.btnText}>Carica PNG</Text></>}
            </TouchableOpacity>

            {slidesUploaded && slidesUploaded.length > 0 && (
              <TouchableOpacity style={[styles.btn, styles.btnOutline]} onPress={() => setShowUploadPreview((v) => !v)}>
                <Ionicons name={showUploadPreview ? "eye-off-outline" : "eye-outline"} size={14} color={Colors.accent} />
                <Text style={[styles.btnText, { color: Colors.accent }]}>
                  {showUploadPreview ? "Nascondi" : `Vedi (${slidesUploaded.length})`}
                </Text>
              </TouchableOpacity>
            )}

            {slidesUploaded && slidesUploaded.length > 0 && (
              <TouchableOpacity
                style={[styles.btn, styles.btnPublish, publishing === "uploaded" && styles.btnDisabled]}
                onPress={() => handlePublishSlides(slidesUploaded, "uploaded")}
                disabled={publishing === "uploaded"}
              >
                {publishing === "uploaded"
                  ? <><ActivityIndicator size="small" color="#fff" /><Text style={styles.btnText}>Pubblicazione…</Text></>
                  : <><Ionicons name="rocket-outline" size={14} color="#fff" /><Text style={styles.btnText}>Pubblica</Text></>}
              </TouchableOpacity>
            )}
          </View>
          {showUploadPreview && slidesUploaded && <SlidesScrollPreview slides={slidesUploaded} />}
        </View>

        {/* ── CAMPAGNA ATTUALE ── */}
        <View style={[styles.subSection, { borderBottomWidth: 0, marginBottom: 0, paddingBottom: 0 }]}>
          <Text style={styles.subSectionTitle}>📋  CAMPAGNA ATTUALE</Text>
          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.btn, styles.btnOutline]}
              onPress={() => { setShowCurrentPreview((v) => !v); if (!showCurrentPreview) refetchCurrentSlides(); }}
            >
              <Ionicons name={showCurrentPreview ? "eye-off-outline" : "eye-outline"} size={14} color={Colors.accent} />
              <Text style={[styles.btnText, { color: Colors.accent }]}>
                {showCurrentPreview ? "Nascondi" : "Vedi campagne"}
              </Text>
            </TouchableOpacity>

            {(currentSlidesData?.slides?.length ?? 0) > 0 && (
              <TouchableOpacity style={[styles.btn, styles.btnOutline]} onPress={handleDownloadCurrentSlides}>
                <Ionicons name="download-outline" size={14} color={Colors.accent} />
                <Text style={[styles.btnText, { color: Colors.accent }]}>Scarica</Text>
              </TouchableOpacity>
            )}
          </View>

          {showCurrentPreview && (
            currentSlidesData?.slides && currentSlidesData.slides.length > 0
              ? <SlidesScrollPreview slides={currentSlidesData.slides} />
              : <Text style={styles.emptyPreview}>Nessuna campagna slide attiva.</Text>
          )}
        </View>
      </View>

      {/* padding bottom web */}
      {Platform.OS === "web" && <View style={{ height: 34 }} />}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    padding: 16,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
  },
  sectionTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 13,
    color: Colors.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  warningBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#2D1F00",
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#F59E0B",
  },
  warningText: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: "#F59E0B",
    flex: 1,
  },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  cardHeader: {
    marginBottom: 10,
  },
  cardHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  iconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.background,
    alignItems: "center",
    justifyContent: "center",
  },
  cardTitle: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 16,
    color: Colors.text,
  },
  cardMeta: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  preview: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: Colors.textSecondary,
    lineHeight: 19,
    backgroundColor: Colors.background,
    borderRadius: 8,
    padding: 10,
    marginBottom: 12,
  },
  emptyPreview: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: Colors.textSecondary,
    fontStyle: "italic",
    marginBottom: 12,
  },
  slideDescription: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: Colors.textSecondary,
    lineHeight: 20,
    marginBottom: 12,
  },
  successBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#052E16",
    borderRadius: 8,
    padding: 10,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#22C55E",
  },
  successText: {
    fontFamily: "Inter_500Medium",
    fontSize: 13,
    color: "#22C55E",
  },
  slidesList: {
    marginBottom: 10,
    paddingLeft: 4,
  },
  slideItem: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: Colors.textSecondary,
    marginBottom: 4,
  },
  actions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  btn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    minHeight: 36,
  },
  btnPrimary: {
    backgroundColor: "#FF6B35",
  },
  btnSecondary: {
    backgroundColor: Colors.accent,
  },
  btnOutline: {
    borderWidth: 1,
    borderColor: Colors.accent,
    backgroundColor: "transparent",
  },
  btnSlides: {
    backgroundColor: "#2563EB",
  },
  btnDisabled: {
    opacity: 0.5,
  },
  btnText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
    color: "#fff",
  },
  btnPublish: {
    backgroundColor: "#16A34A",
  },
  subSection: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    marginBottom: 14,
    paddingBottom: 14,
  },
  subSectionTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 11,
    color: Colors.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: 8,
  },
  promptInput: {
    backgroundColor: Colors.background,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    color: Colors.text,
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    padding: 10,
    marginBottom: 10,
    minHeight: 72,
    textAlignVertical: "top" as const,
  },
  numSlidesRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 10,
    marginBottom: 14,
  },
  numSlidesLabel: {
    fontFamily: "Inter_500Medium",
    fontSize: 13,
    color: Colors.text,
  },
  numSlidesInput: {
    backgroundColor: Colors.background,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    color: Colors.text,
    fontFamily: "Inter_600SemiBold",
    fontSize: 15,
    paddingHorizontal: 12,
    paddingVertical: 6,
    width: 60,
    textAlign: "center" as const,
  },
  previewSection: {
    marginBottom: 12,
  },
  previewLabel: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
    color: Colors.text,
    marginBottom: 10,
  },
  previewScroll: {
    marginHorizontal: -16,
  },
  previewScrollContent: {
    paddingHorizontal: 16,
    gap: 10,
  },
  previewCard: {
    width: 240,
    borderRadius: 10,
    overflow: "hidden",
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  previewImage: {
    width: 240,
    height: 134,
  },
  previewCardTitle: {
    fontFamily: "Inter_500Medium",
    fontSize: 12,
    color: Colors.text,
    padding: 8,
    lineHeight: 17,
  },
});

function SlidesScrollPreview({ slides }: { slides: { title: string; imageUrl: string }[] }) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.previewScroll}
      contentContainerStyle={styles.previewScrollContent}
    >
      {slides.map((slide, i) => {
        const imageUri = new URL(slide.imageUrl, getApiUrl()).toString();
        return (
          <View key={i} style={styles.previewCard}>
            <Image source={{ uri: imageUri }} style={styles.previewImage} resizeMode="cover" />
            <Text style={styles.previewCardTitle} numberOfLines={2}>{slide.title}</Text>
          </View>
        );
      })}
    </ScrollView>
  );
}
