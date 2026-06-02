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
} from "react-native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as DocumentPicker from "expo-document-picker";
import { useQuery } from "@tanstack/react-query";
import { getApiUrl, apiRequest, queryClient } from "@/lib/query-client";
import { appendFileToForm } from "@/lib/image-picker-utils";
import Colors from "@/constants/colors";

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

export default function LegalDocsAdmin() {
  const insets = useSafeAreaInsets();
  const [generating, setGenerating] = useState<DocType | "slides" | null>(null);
  const [uploading, setUploading] = useState<DocType | null>(null);
  const [slidesResult, setSlidesResult] = useState<{ created: number; slides: string[] } | null>(null);

  const { data: info, refetch } = useQuery<DocsInfoResponse>({
    queryKey: ["/api/admin/legal/docs-info"],
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
    Alert.alert(
      "Genera slide con Ollama",
      "Verranno create 6 slide PNG (1080×600) e pubblicate come campagne nella sezione home. Continuare?",
      [
        { text: "Annulla", style: "cancel" },
        {
          text: "Genera",
          onPress: async () => {
            setGenerating("slides");
            setSlidesResult(null);
            try {
              const slidesRes = await apiRequest(
                "POST",
                "/api/admin/legal/generate-slides",
                {}
              );
              const result = await slidesRes.json() as { created: number; slides: string[] };
              setSlidesResult(result);
              queryClient.invalidateQueries({ queryKey: ["/api/admin/advertisements"] });
            } catch (e: unknown) {
              Alert.alert("Errore", (e as Error).message || "Errore generazione slide");
            } finally {
              setGenerating(null);
            }
          },
        },
      ]
    );
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
        <View style={styles.cardHeader}>
          <View style={styles.cardHeaderLeft}>
            <View style={[styles.iconCircle, { backgroundColor: "#1E3A5F" }]}>
              <MaterialCommunityIcons name="presentation" size={24} color="#60A5FA" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitle}>Slide "Come funziona BikerLink"</Text>
              <Text style={styles.cardMeta}>
                6 slide PNG 1080×600 — pubblicate come campagne nella home
              </Text>
            </View>
          </View>
        </View>

        <Text style={styles.slideDescription}>
          Ollama genera 6 slide con titolo e descrizione delle funzioni chiave dell'app (matching, giri, motoclub, SOS…),
          le renderizza come immagini PNG e le pubblica direttamente come campagne pubblicitarie nella sezione home.
        </Text>

        {slidesResult && (
          <View style={styles.successBanner}>
            <Ionicons name="checkmark-circle" size={18} color="#22C55E" />
            <Text style={styles.successText}>
              {slidesResult.created} slide create e pubblicate come campagne
            </Text>
          </View>
        )}

        {slidesResult?.slides && slidesResult.slides.length > 0 && (
          <View style={styles.slidesList}>
            {slidesResult.slides.map((title, i) => (
              <Text key={i} style={styles.slideItem}>· {title}</Text>
            ))}
          </View>
        )}

        <TouchableOpacity
          style={[
            styles.btn,
            styles.btnSlides,
            (!ollamaOk || generating === "slides") && styles.btnDisabled,
          ]}
          onPress={handleGenerateSlides}
          disabled={!ollamaOk || generating === "slides"}
        >
          {generating === "slides" ? (
            <>
              <ActivityIndicator size="small" color="#fff" />
              <Text style={styles.btnText}>Generazione in corso…</Text>
            </>
          ) : (
            <>
              <MaterialCommunityIcons name="auto-fix" size={16} color="#fff" />
              <Text style={styles.btnText}>Genera slide con Ollama</Text>
            </>
          )}
        </TouchableOpacity>
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
    marginTop: 4,
    alignSelf: "flex-start",
  },
  btnDisabled: {
    opacity: 0.5,
  },
  btnText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
    color: "#fff",
  },
});
