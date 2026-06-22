import React, { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  TextInput,
} from "react-native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import { useQuery } from "@tanstack/react-query";
import { getApiUrl, apiRequest, queryClient } from "@/lib/query-client";
import { appendFileToForm } from "@/lib/image-picker-utils";
import Colors from "@/constants/colors";

import { SlidesScrollPreview, type SlidePreview } from "./SlidesPanelParts";

const DEFAULT_SLIDE_PROMPT =
  `Sei un esperto di marketing per app mobile. Genera un array JSON di 6 slide "come funziona BikerLink" in italiano.\n` +
  `BikerLink è un'app per motociclisti con: matching tra biker, pianificazione giri, motoclub, SOS stradale, chat, raduni.\n` +
  `Ogni slide ha: "title" (max 6 parole, impattante) e "body" (max 30 parole, descrizione concisa della funzione).\n` +
  `Restituisci SOLO un array JSON valido, senza markdown, senza commenti, esempio:\n` +
  `[{"title":"Trova il tuo biker","body":"Descrizione..."},...]`;

interface SlidesPanelProps {
  isOllamaConfigured: boolean;
}

export function SlidesPanel({ isOllamaConfigured }: SlidesPanelProps) {
  const [generating, setGenerating] = useState(false);
  const [uploadingSlide, setUploadingSlide] = useState(false);
  const [publishing, setPublishing] = useState<"generated" | "uploaded" | null>(null);
  const [slidesGenerated, setSlidesGenerated] = useState<SlidePreview[] | null>(null);
  const [slidesUploaded, setSlidesUploaded] = useState<SlidePreview[] | null>(null);
  const [showGenPreview, setShowGenPreview] = useState(false);
  const [showUploadPreview, setShowUploadPreview] = useState(false);
  const [showCurrentPreview, setShowCurrentPreview] = useState(false);
  const [publishedMsg, setPublishedMsg] = useState<string | null>(null);
  const [slidePrompt, setSlidePrompt] = useState(DEFAULT_SLIDE_PROMPT);
  const [numSlides, setNumSlides] = useState("6");

  const { data: currentSlidesData, refetch: refetchCurrentSlides } = useQuery<{
    ok: boolean;
    slides: { id: string; title: string; imageUrl: string; isActive: boolean }[];
  }>({
    queryKey: ["/api/admin/legal/current-slides"],
  });

  const handleGenerateSlides = async () => {
    if (!isOllamaConfigured) {
      Alert.alert("Ollama non configurato", "Configura OLLAMA_URL nelle variabili d'ambiente per usare questa funzione.");
      return;
    }
    const n = Math.max(1, Math.min(20, parseInt(numSlides, 10) || 6));
    setGenerating(true);
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
      setGenerating(false);
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

  const handleRemoveGenerated = (index: number) => {
    setSlidesGenerated((prev) => {
      if (!prev) return prev;
      const next = prev.filter((_, i) => i !== index);
      if (next.length === 0) setShowGenPreview(false);
      return next.length > 0 ? next : null;
    });
  };

  const handleRemoveUploaded = (index: number) => {
    setSlidesUploaded((prev) => {
      if (!prev) return prev;
      const next = prev.filter((_, i) => i !== index);
      if (next.length === 0) setShowUploadPreview(false);
      return next.length > 0 ? next : null;
    });
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

  return (
    <>
      <View style={styles.sectionHeader}>
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
              <Text style={styles.cardMeta}>PNG 1080×600 — pubblicate come campagne nella home</Text>
            </View>
          </View>
        </View>

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
              style={[styles.btn, styles.btnSlides, (!isOllamaConfigured || generating) && styles.btnDisabled]}
              onPress={handleGenerateSlides}
              disabled={!isOllamaConfigured || generating}
            >
              {generating
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
          {showGenPreview && slidesGenerated && (
            <SlidesScrollPreview slides={slidesGenerated} onRemove={handleRemoveGenerated} />
          )}
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
          {showUploadPreview && slidesUploaded && (
            <SlidesScrollPreview slides={slidesUploaded} onRemove={handleRemoveUploaded} />
          )}
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
    </>
  );
}

import { styles } from "./SlidesPanel.styles";
