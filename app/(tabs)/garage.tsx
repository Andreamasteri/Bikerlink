import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  ActivityIndicator,
  RefreshControl,
  Modal,
  TextInput,
  ScrollView,
  Alert,
  Platform,
  Image,
} from "react-native";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import Colors from "@/constants/colors";
import { useAuth } from "@/lib/auth-context";
import { apiRequest, getApiUrl, queryClient } from "@/lib/query-client";
import { useSafeAreaInsets } from "react-native-safe-area-context";

async function uriToBase64(uri: string): Promise<{ base64: string; filename: string }> {
  const filename = uri.split("/").pop()?.split("?")[0] || "photo.jpg";
  if (Platform.OS === "web") {
    const response = await globalThis.fetch(uri);
    const blob = await response.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result as string;
        resolve({ base64: result, filename });
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } else {
    const FileSystem = require("expo-file-system");
    const b64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
    const ext = filename.split(".").pop() || "jpg";
    return { base64: `data:image/${ext};base64,${b64}`, filename };
  }
}

const MOTO_TYPES = [
  { value: "sportiva", label: "Sportiva" },
  { value: "supersportiva", label: "Supersportiva" },
  { value: "custom", label: "Custom" },
  { value: "harley", label: "Harley" },
  { value: "touring", label: "Touring" },
  { value: "naked", label: "Naked" },
  { value: "enduro", label: "Enduro" },
  { value: "altro", label: "Altro" },
] as const;

const RIDING_STYLES = [
  { value: "passeggio", label: "Passeggio" },
  { value: "tranquilla", label: "Tranquilla" },
  { value: "allegra", label: "Allegra" },
  { value: "mozzafiato", label: "Mozzafiato" },
] as const;

function WishlistScreen() {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const [showMotoForm, setShowMotoForm] = useState(false);
  const [editingMotoId, setEditingMotoId] = useState<string | null>(null);
  const [description, setDescription] = useState("");
  const [motoForm, setMotoForm] = useState({ brand: "", model: "", motorcycleType: "", ridingStyle: "" });

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["/api/wishlist"],
  });

  const wishlist = (data as any)?.wishlist;
  const photos: any[] = (data as any)?.photos || [];
  const motos: any[] = (data as any)?.motos || [];

  React.useEffect(() => {
    if (wishlist?.description && !description) {
      setDescription(wishlist.description);
    }
  }, [wishlist]);

  const descMutation = useMutation({
    mutationFn: async (desc: string) => {
      await apiRequest("PUT", "/api/wishlist", { description: desc });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/wishlist"] });
    },
  });

  const uploadPhotoMutation = useMutation({
    mutationFn: async (uri: string) => {
      const { base64, filename } = await uriToBase64(uri);
      const res = await apiRequest("POST", "/api/wishlist/photos", { imageBase64: base64, filename });
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/wishlist"] }),
    onError: (err: any) => Alert.alert("Errore", err.message || "Errore upload foto"),
  });

  const deletePhotoMutation = useMutation({
    mutationFn: async (photoId: string) => {
      await apiRequest("DELETE", `/api/wishlist/photos/${photoId}`);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/wishlist"] }),
  });

  const addMotoMutation = useMutation({
    mutationFn: async (motoData: any) => {
      const res = await apiRequest("POST", "/api/wishlist/motos", motoData);
      return res.json();
    },
    onSuccess: (responseData: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/wishlist"] });
      setShowMotoForm(false);
      setMotoForm({ brand: "", model: "", motorcycleType: "", ridingStyle: "" });
      setEditingMotoId(null);
      if (responseData?.matches && responseData.matches.length > 0) {
        const matchInfo = responseData.matches
          .map((m: any) => `${m.bikerNickname || "Biker"} ha ${m.brand} ${m.model}`)
          .join("\n");
        Alert.alert("Here Comes Your Chance!!", matchInfo);
      }
    },
    onError: (err: any) => Alert.alert("Errore", err.message),
  });

  const updateMotoMutation = useMutation({
    mutationFn: async ({ id, data: motoData }: { id: string; data: any }) => {
      await apiRequest("PUT", `/api/wishlist/motos/${id}`, motoData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/wishlist"] });
      setShowMotoForm(false);
      setMotoForm({ brand: "", model: "", motorcycleType: "", ridingStyle: "" });
      setEditingMotoId(null);
    },
  });

  const deleteMotoMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/wishlist/motos/${id}`);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/wishlist"] }),
  });

  const pickWishlistPhoto = async () => {
    if (photos.length >= 3) {
      Alert.alert("Limite raggiunto", "Massimo 3 foto personali");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
      allowsEditing: true,
    });
    if (!result.canceled && result.assets[0]) {
      uploadPhotoMutation.mutate(result.assets[0].uri);
    }
  };

  const handleDeletePhoto = (photoId: string) => {
    if (Platform.OS === "web") {
      if (window.confirm("Eliminare questa foto?")) deletePhotoMutation.mutate(photoId);
    } else {
      Alert.alert("Elimina Foto", "Eliminare questa foto?", [
        { text: "Annulla", style: "cancel" },
        { text: "Elimina", style: "destructive", onPress: () => deletePhotoMutation.mutate(photoId) },
      ]);
    }
  };

  const openEditMoto = (moto: any) => {
    setEditingMotoId(moto.id);
    setMotoForm({ brand: moto.brand || "", model: moto.model || "", motorcycleType: moto.motorcycleType || "", ridingStyle: moto.ridingStyle || "" });
    setShowMotoForm(true);
  };

  const getMotoTypeLabel = (v: string) => MOTO_TYPES.find(t => t.value === v)?.label || v;

  const handleSaveMoto = () => {
    const hasBrandModel = motoForm.brand.trim() && motoForm.model.trim();
    const hasType = !!motoForm.motorcycleType;
    if (!hasBrandModel && !hasType) {
      Alert.alert("Errore", "Specifica marca e modello oppure il tipo moto");
      return;
    }
    if (editingMotoId) {
      updateMotoMutation.mutate({ id: editingMotoId, data: motoForm });
    } else {
      addMotoMutation.mutate(motoForm);
    }
  };

  const handleDeleteMoto = (id: string, brand: string, model: string, motorcycleType?: string) => {
    const name = brand && model ? `${brand} ${model}` : getMotoTypeLabel(motorcycleType || "");
    if (Platform.OS === "web") {
      if (window.confirm(`Eliminare "${name}" dalla wishlist?`)) deleteMotoMutation.mutate(id);
    } else {
      Alert.alert("Elimina", `Eliminare "${name}" dalla wishlist?`, [
        { text: "Annulla", style: "cancel" },
        { text: "Elimina", style: "destructive", onPress: () => deleteMotoMutation.mutate(id) },
      ]);
    }
  };

  const OptionButton = ({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) => (
    <Pressable style={[styles.optionBtn, selected && styles.optionBtnSelected]} onPress={onPress}>
      <Text style={[styles.optionText, selected && styles.optionTextSelected]}>{label}</Text>
    </Pressable>
  );

  const getStyleLabel = (v: string) => RIDING_STYLES.find(t => t.value === v)?.label || v;
  const baseUrl = getApiUrl();

  if (isLoading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={Colors.accent} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={[styles.list, { paddingBottom: Platform.OS === "web" ? 100 : insets.bottom + 80 }]}
        refreshControl={<RefreshControl refreshing={false} onRefresh={refetch} tintColor={Colors.accent} />}
      >
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Ionicons name="person-circle-outline" size={28} color={Colors.accent} />
            <Text style={styles.motoName}>Chi Sono</Text>
          </View>
          <TextInput
            style={[styles.input, { marginTop: 12, minHeight: 80, textAlignVertical: "top" }]}
            placeholder="Descrivi te stessa, i tuoi desideri e le tue abitudini di viaggio..."
            placeholderTextColor={Colors.textSecondary}
            value={description}
            onChangeText={setDescription}
            multiline
            numberOfLines={4}
          />
          <Pressable
            style={[styles.saveBtn, { marginTop: 12 }]}
            onPress={() => descMutation.mutate(description)}
            disabled={descMutation.isPending}
          >
            {descMutation.isPending ? (
              <ActivityIndicator color={Colors.background} />
            ) : (
              <Text style={styles.saveBtnText}>Salva Descrizione</Text>
            )}
          </Pressable>
        </View>

        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Ionicons name="images-outline" size={28} color={Colors.accent} />
            <Text style={styles.motoName}>Le Mie Foto ({photos.length}/3)</Text>
          </View>
          <View style={styles.photoRow}>
            {photos.map((photo: any) => (
              <View key={photo.id} style={styles.photoThumbContainer}>
                <Image source={{ uri: new URL(photo.photoUrl, baseUrl).toString() }} style={styles.photoThumb} />
                <Pressable style={styles.photoDeleteBtn} onPress={() => handleDeletePhoto(photo.id)} hitSlop={6}>
                  <Ionicons name="close-circle" size={18} color={Colors.accentRed} />
                </Pressable>
              </View>
            ))}
            {photos.length < 3 && (
              <Pressable style={styles.addPhotoThumb} onPress={pickWishlistPhoto}>
                <Ionicons name="camera-outline" size={22} color={Colors.textSecondary} />
              </Pressable>
            )}
          </View>
        </View>

        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Ionicons name="heart-outline" size={28} color={Colors.accent} />
            <View style={styles.cardInfo}>
              <Text style={styles.motoName}>Moto Desiderate ({motos.length}/5)</Text>
            </View>
            {motos.length < 5 && (
              <Pressable onPress={() => { setEditingMotoId(null); setMotoForm({ brand: "", model: "", motorcycleType: "", ridingStyle: "" }); setShowMotoForm(true); }} hitSlop={10}>
                <Ionicons name="add-circle" size={24} color={Colors.accent} />
              </Pressable>
            )}
          </View>

          <View style={wStyles.warningBox}>
            <Ionicons name="information-circle-outline" size={16} color={Colors.accent} />
            <Text style={wStyles.warningText}>
              Puoi cercare per marca e modello oppure per tipo moto + stile guida
            </Text>
          </View>

          {motos.length === 0 ? (
            <View style={{ alignItems: "center", paddingVertical: 20 }}>
              <Ionicons name="heart-outline" size={40} color={Colors.textSecondary} />
              <Text style={styles.emptySubtext}>Nessuna moto nella wishlist</Text>
            </View>
          ) : (
            motos.map((moto: any) => (
              <Pressable key={moto.id} style={wStyles.motoItem} onPress={() => openEditMoto(moto)}>
                <View style={{ flex: 1 }}>
                  <Text style={wStyles.motoItemTitle}>
                    {moto.brand && moto.model ? `${moto.brand} ${moto.model}` : getMotoTypeLabel(moto.motorcycleType || "")}
                  </Text>
                  <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap", marginTop: 4 }}>
                    {moto.motorcycleType && (
                      <View style={styles.detailChip}>
                        <Ionicons name="bicycle-outline" size={14} color={Colors.textSecondary} />
                        <Text style={styles.detailText}>{getMotoTypeLabel(moto.motorcycleType)}</Text>
                      </View>
                    )}
                    {moto.ridingStyle && (
                      <View style={styles.detailChip}>
                        <Ionicons name="flash-outline" size={14} color={Colors.textSecondary} />
                        <Text style={styles.detailText}>{getStyleLabel(moto.ridingStyle)}</Text>
                      </View>
                    )}
                  </View>
                </View>
                <Pressable onPress={() => handleDeleteMoto(moto.id, moto.brand, moto.model, moto.motorcycleType)} hitSlop={10}>
                  <Ionicons name="trash-outline" size={20} color={Colors.accentRed} />
                </Pressable>
              </Pressable>
            ))
          )}
        </View>
      </ScrollView>

      <Modal visible={showMotoForm} transparent animationType="slide" onRequestClose={() => setShowMotoForm(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setShowMotoForm(false)}>
          <Pressable style={styles.modalContent} onPress={(e) => e.stopPropagation()}>
            <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 40 }}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>{editingMotoId ? "Modifica Moto" : "Aggiungi Moto Desiderata"}</Text>
                <Pressable onPress={() => setShowMotoForm(false)}>
                  <Ionicons name="close" size={24} color={Colors.textSecondary} />
                </Pressable>
              </View>

              <View style={wStyles.warningBox}>
                <Ionicons name="information-circle-outline" size={16} color={Colors.accent} />
                <Text style={wStyles.warningText}>
                  Opzione 1: marca e modello specifici. Opzione 2: solo tipo moto.
                </Text>
              </View>

              <Text style={styles.label}>Marca</Text>
              <TextInput
                style={styles.input}
                placeholder='es. "Ducati" (opzionale)'
                placeholderTextColor={Colors.textSecondary}
                value={motoForm.brand}
                onChangeText={(v) => setMotoForm(p => ({ ...p, brand: v }))}
              />

              <Text style={styles.label}>Modello</Text>
              <TextInput
                style={styles.input}
                placeholder='es. "Monster 821" (opzionale)'
                placeholderTextColor={Colors.textSecondary}
                value={motoForm.model}
                onChangeText={(v) => setMotoForm(p => ({ ...p, model: v }))}
              />

              <Text style={styles.label}>Tipo Moto</Text>
              <View style={styles.optionRow}>
                {MOTO_TYPES.map(t => (
                  <OptionButton key={t.value} label={t.label} selected={motoForm.motorcycleType === t.value} onPress={() => setMotoForm(p => ({ ...p, motorcycleType: p.motorcycleType === t.value ? "" : t.value }))} />
                ))}
              </View>

              <Text style={styles.label}>Stile Guida</Text>
              <View style={styles.optionRow}>
                {RIDING_STYLES.map(s => (
                  <OptionButton key={s.value} label={s.label} selected={motoForm.ridingStyle === s.value} onPress={() => setMotoForm(p => ({ ...p, ridingStyle: s.value }))} />
                ))}
              </View>

              <Pressable style={styles.saveBtn} onPress={handleSaveMoto} disabled={addMotoMutation.isPending || updateMotoMutation.isPending}>
                {(addMotoMutation.isPending || updateMotoMutation.isPending) ? (
                  <ActivityIndicator color={Colors.background} />
                ) : (
                  <Text style={styles.saveBtnText}>{editingMotoId ? "Salva Modifiche" : "Aggiungi alla Wishlist"}</Text>
                )}
              </Pressable>
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const wStyles = StyleSheet.create({
  warningBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: Colors.warning + "15",
    borderWidth: 1,
    borderColor: Colors.warning + "40",
    borderRadius: 10,
    padding: 12,
    marginTop: 12,
  },
  warningText: { fontSize: 12, fontFamily: "Inter_400Regular", color: Colors.warning, flex: 1 },
  motoItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    gap: 12,
  },
  motoItemTitle: { fontSize: 16, fontFamily: "Inter_600SemiBold", color: Colors.text, marginBottom: 4 },
});

export default function GarageScreen() {
  const { user } = useAuth();

  if (user?.userType === "zavorrina") {
    return <WishlistScreen />;
  }

  return <GarageContent />;
}

function GarageContent() {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    brand: "",
    model: "",
    displacement: "",
    motorcycleType: "",
    ridingStyle: "",
    isDefault: false,
  });

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["/api/motorcycles"],
  });

  const motorcycles = Array.isArray(data) ? data : [];

  const saveMutation = useMutation({
    mutationFn: async (motoData: any) => {
      const payload = {
        ...motoData,
        displacement: motoData.displacement ? parseInt(motoData.displacement, 10) : null,
      };
      let res: Response;
      if (editingId) {
        res = await apiRequest("PUT", `/api/motorcycles/${editingId}`, payload);
      } else {
        res = await apiRequest("POST", "/api/motorcycles", payload);
      }
      return res.json();
    },
    onSuccess: (responseData: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/motorcycles"] });
      setShowForm(false);
      resetForm();

      if (responseData?.matches && responseData.matches.length > 0) {
        const matchInfo = responseData.matches
          .map((m: any) => `${m.zavarrinaNickname || "Zavorrina"} cerca ${m.brand} ${m.model}`)
          .join("\n");
        Alert.alert("Here Comes Your Chance!!", matchInfo);
      }
    },
    onError: (err: any) => {
      Alert.alert("Errore", err.message || "Errore nel salvataggio");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/motorcycles/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/motorcycles"] });
    },
  });

  const uploadPhotoMutation = useMutation({
    mutationFn: async ({ motoId, uri }: { motoId: string; uri: string }) => {
      const { base64, filename } = await uriToBase64(uri);
      const res = await apiRequest("POST", `/api/motorcycles/${motoId}/photos`, { imageBase64: base64, filename });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/motorcycles"] });
    },
    onError: (err: any) => {
      Alert.alert("Errore", err.message || "Errore upload foto");
    },
  });

  const deletePhotoMutation = useMutation({
    mutationFn: async ({ motoId, photoId }: { motoId: string; photoId: string }) => {
      await apiRequest("DELETE", `/api/motorcycles/${motoId}/photos/${photoId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/motorcycles"] });
    },
  });

  const resetForm = () => {
    setForm({ brand: "", model: "", displacement: "", motorcycleType: "", ridingStyle: "", isDefault: false });
    setEditingId(null);
  };

  const openAdd = () => {
    resetForm();
    setShowForm(true);
  };

  const openEdit = (moto: any) => {
    setEditingId(moto.id);
    setForm({
      brand: moto.brand || "",
      model: moto.model || "",
      displacement: moto.displacement ? String(moto.displacement) : "",
      motorcycleType: moto.motorcycleType || "",
      ridingStyle: moto.ridingStyle || "",
      isDefault: moto.isDefault || false,
    });
    setShowForm(true);
  };

  const handleSave = () => {
    if (!form.brand || !form.model || !form.motorcycleType || !form.ridingStyle) {
      Alert.alert("Errore", "Compila tutti i campi obbligatori");
      return;
    }
    saveMutation.mutate(form);
  };

  const handleDelete = (id: string, displayName: string) => {
    if (Platform.OS === "web") {
      if (window.confirm(`Eliminare "${displayName}"?`)) {
        deleteMutation.mutate(id);
      }
    } else {
      Alert.alert("Elimina Moto", `Eliminare "${displayName}"?`, [
        { text: "Annulla", style: "cancel" },
        { text: "Elimina", style: "destructive", onPress: () => deleteMutation.mutate(id) },
      ]);
    }
  };

  const pickAndUploadPhoto = async (motoId: string, currentCount: number) => {
    if (currentCount >= 3) {
      Alert.alert("Limite raggiunto", "Massimo 3 foto per moto");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
      allowsEditing: true,
    });
    if (!result.canceled && result.assets[0]) {
      uploadPhotoMutation.mutate({ motoId, uri: result.assets[0].uri });
    }
  };

  const handleDeletePhoto = (motoId: string, photoId: string) => {
    if (Platform.OS === "web") {
      if (window.confirm("Eliminare questa foto?")) {
        deletePhotoMutation.mutate({ motoId, photoId });
      }
    } else {
      Alert.alert("Elimina Foto", "Eliminare questa foto?", [
        { text: "Annulla", style: "cancel" },
        { text: "Elimina", style: "destructive", onPress: () => deletePhotoMutation.mutate({ motoId, photoId }) },
      ]);
    }
  };

  const OptionButton = ({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) => (
    <Pressable style={[styles.optionBtn, selected && styles.optionBtnSelected]} onPress={onPress}>
      <Text style={[styles.optionText, selected && styles.optionTextSelected]}>{label}</Text>
    </Pressable>
  );

  const getMotoTypeLabel = (v: string) => MOTO_TYPES.find(t => t.value === v)?.label || v;
  const getStyleLabel = (v: string) => RIDING_STYLES.find(t => t.value === v)?.label || v;

  const getMotoDisplayName = (item: any) => {
    const parts = [item.brand, item.model].filter(Boolean);
    const name = parts.join(" ");
    if (item.displacement) {
      return `${name} (${item.displacement} cc)`;
    }
    return name;
  };

  const renderMoto = ({ item }: { item: any }) => {
    const displayName = getMotoDisplayName(item);
    const photos: any[] = item.photos || [];
    const baseUrl = getApiUrl();

    return (
      <Pressable style={styles.card} onPress={() => openEdit(item)}>
        <View style={styles.cardHeader}>
          <Ionicons name="bicycle" size={28} color={Colors.accent} />
          <View style={styles.cardInfo}>
            <Text style={styles.motoName}>{displayName}</Text>
            {item.isDefault && (
              <View style={styles.defaultBadge}>
                <Text style={styles.defaultBadgeText}>Predefinita</Text>
              </View>
            )}
          </View>
          <Pressable onPress={() => handleDelete(item.id, displayName)} hitSlop={10}>
            <Ionicons name="trash-outline" size={20} color={Colors.accentRed} />
          </Pressable>
        </View>
        <View style={styles.cardDetails}>
          <View style={styles.detailChip}>
            <Ionicons name="speedometer-outline" size={14} color={Colors.textSecondary} />
            <Text style={styles.detailText}>{getMotoTypeLabel(item.motorcycleType)}</Text>
          </View>
          <View style={styles.detailChip}>
            <Ionicons name="flash-outline" size={14} color={Colors.textSecondary} />
            <Text style={styles.detailText}>{getStyleLabel(item.ridingStyle)}</Text>
          </View>
        </View>

        {photos.length > 0 && (
          <View style={styles.photoRow}>
            {photos.map((photo: any) => (
              <View key={photo.id} style={styles.photoThumbContainer}>
                <Image
                  source={{ uri: new URL(photo.photoUrl, baseUrl).toString() }}
                  style={styles.photoThumb}
                />
                <Pressable
                  style={styles.photoDeleteBtn}
                  onPress={() => handleDeletePhoto(item.id, photo.id)}
                  hitSlop={6}
                >
                  <Ionicons name="close-circle" size={18} color={Colors.accentRed} />
                </Pressable>
              </View>
            ))}
            {photos.length < 3 && (
              <Pressable
                style={styles.addPhotoThumb}
                onPress={() => pickAndUploadPhoto(item.id, photos.length)}
              >
                <Ionicons name="camera-outline" size={22} color={Colors.textSecondary} />
              </Pressable>
            )}
          </View>
        )}

        {photos.length === 0 && (
          <Pressable
            style={styles.addPhotoRow}
            onPress={() => pickAndUploadPhoto(item.id, 0)}
          >
            <Ionicons name="camera-outline" size={18} color={Colors.accent} />
            <Text style={styles.addPhotoText}>Aggiungi foto</Text>
          </Pressable>
        )}
      </Pressable>
    );
  };

  return (
    <View style={styles.container}>
      {isLoading ? (
        <View style={styles.loading}>
          <ActivityIndicator size="large" color={Colors.accent} />
        </View>
      ) : (
        <FlatList
          data={motorcycles}
          renderItem={renderMoto}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[styles.list, { paddingBottom: Platform.OS === "web" ? 100 : insets.bottom + 80 }]}
          refreshControl={<RefreshControl refreshing={false} onRefresh={refetch} tintColor={Colors.accent} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="bicycle" size={64} color={Colors.textSecondary} />
              <Text style={styles.emptyText}>Nessuna moto nel garage</Text>
              <Text style={styles.emptySubtext}>Aggiungi la tua prima moto!</Text>
            </View>
          }
          scrollEnabled={motorcycles.length > 0}
        />
      )}

      <Pressable style={[styles.fab, { bottom: Platform.OS === "web" ? 50 : 16 }]} onPress={openAdd}>
        <Ionicons name="add" size={28} color={Colors.background} />
      </Pressable>

      <Modal visible={showForm} transparent animationType="slide" onRequestClose={() => { setShowForm(false); resetForm(); }}>
        <Pressable style={styles.modalOverlay} onPress={() => { setShowForm(false); resetForm(); }}>
          <Pressable style={styles.modalContent} onPress={(e) => e.stopPropagation()}>
            <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 40 }}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>{editingId ? "Modifica Moto" : "Aggiungi Moto"}</Text>
                <Pressable onPress={() => { setShowForm(false); resetForm(); }}>
                  <Ionicons name="close" size={24} color={Colors.textSecondary} />
                </Pressable>
              </View>

              <View style={styles.warningBox}>
                <Ionicons name="warning-outline" size={16} color={Colors.warning} />
                <Text style={styles.warningText}>
                  Attenzione: specificare marca e modello precisi per usufruire del matching automatico
                </Text>
              </View>

              <Text style={styles.label}>Marca *</Text>
              <TextInput
                style={styles.input}
                placeholder='es. "Ducati"'
                placeholderTextColor={Colors.textSecondary}
                value={form.brand}
                onChangeText={(v) => setForm(p => ({ ...p, brand: v }))}
              />

              <Text style={styles.label}>Modello *</Text>
              <TextInput
                style={styles.input}
                placeholder='es. "Monster 821"'
                placeholderTextColor={Colors.textSecondary}
                value={form.model}
                onChangeText={(v) => setForm(p => ({ ...p, model: v }))}
              />

              <Text style={styles.label}>Cilindrata cc</Text>
              <TextInput
                style={styles.input}
                placeholder='es. "821"'
                placeholderTextColor={Colors.textSecondary}
                value={form.displacement}
                onChangeText={(v) => setForm(p => ({ ...p, displacement: v.replace(/[^0-9]/g, "") }))}
                keyboardType="numeric"
              />

              <Text style={styles.label}>Tipo Moto *</Text>
              <View style={styles.optionRow}>
                {MOTO_TYPES.map(t => (
                  <OptionButton key={t.value} label={t.label} selected={form.motorcycleType === t.value} onPress={() => setForm(p => ({ ...p, motorcycleType: t.value }))} />
                ))}
              </View>

              <Text style={styles.label}>Stile Guida *</Text>
              <View style={styles.optionRow}>
                {RIDING_STYLES.map(s => (
                  <OptionButton key={s.value} label={s.label} selected={form.ridingStyle === s.value} onPress={() => setForm(p => ({ ...p, ridingStyle: s.value }))} />
                ))}
              </View>

              <Pressable style={styles.defaultRow} onPress={() => setForm(p => ({ ...p, isDefault: !p.isDefault }))}>
                <View style={[styles.checkbox, form.isDefault && styles.checkboxChecked]}>
                  {form.isDefault && <Text style={styles.checkmark}>✓</Text>}
                </View>
                <Text style={styles.defaultLabel}>Moto predefinita</Text>
              </Pressable>

              <Pressable style={styles.saveBtn} onPress={handleSave} disabled={saveMutation.isPending}>
                {saveMutation.isPending ? (
                  <ActivityIndicator color={Colors.background} />
                ) : (
                  <Text style={styles.saveBtnText}>{editingId ? "Salva Modifiche" : "Aggiungi al Garage"}</Text>
                )}
              </Pressable>
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  loading: { flex: 1, justifyContent: "center", alignItems: "center" },
  list: { padding: 16 },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: 12 },
  cardInfo: { flex: 1 },
  motoName: { fontSize: 18, fontFamily: "Inter_600SemiBold", color: Colors.text },
  defaultBadge: { backgroundColor: Colors.accent + "20", paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8, alignSelf: "flex-start", marginTop: 2 },
  defaultBadgeText: { fontSize: 11, fontFamily: "Inter_500Medium", color: Colors.accent },
  cardDetails: { flexDirection: "row", gap: 12, marginTop: 12 },
  detailChip: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: Colors.surfaceLight, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  detailText: { fontSize: 13, fontFamily: "Inter_400Regular", color: Colors.textSecondary },
  photoRow: { flexDirection: "row", gap: 8, marginTop: 12, flexWrap: "wrap" },
  photoThumbContainer: { position: "relative" },
  photoThumb: { width: 72, height: 72, borderRadius: 8 },
  photoDeleteBtn: { position: "absolute", top: -6, right: -6 },
  addPhotoThumb: {
    width: 72,
    height: 72,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
  },
  addPhotoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 12,
    paddingVertical: 8,
  },
  addPhotoText: { fontSize: 13, fontFamily: "Inter_500Medium", color: Colors.accent },
  empty: { alignItems: "center", paddingTop: 80, gap: 12 },
  emptyText: { fontSize: 18, fontFamily: "Inter_600SemiBold", color: Colors.textSecondary },
  emptySubtext: { fontSize: 14, fontFamily: "Inter_400Regular", color: Colors.textSecondary },
  fab: {
    position: "absolute",
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.accent,
    alignItems: "center",
    justifyContent: "center",
    elevation: 4,
  },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  modalContent: { backgroundColor: Colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, maxHeight: "90%" },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  modalTitle: { fontSize: 20, fontFamily: "Inter_700Bold", color: Colors.text },
  warningBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: Colors.warning + "15",
    borderWidth: 1,
    borderColor: Colors.warning + "40",
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
  },
  warningText: { fontSize: 12, fontFamily: "Inter_400Regular", color: Colors.warning, flex: 1 },
  label: { fontSize: 14, fontFamily: "Inter_500Medium", color: Colors.text, marginTop: 12, marginBottom: 6 },
  input: {
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 10,
    padding: 14,
    fontSize: 16,
    fontFamily: "Inter_400Regular",
    color: Colors.text,
  },
  optionRow: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  optionBtn: {
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 14,
    marginBottom: 4,
  },
  optionBtnSelected: { borderColor: Colors.accent, backgroundColor: Colors.accent + "20" },
  optionText: { fontSize: 13, fontFamily: "Inter_500Medium", color: Colors.textSecondary },
  optionTextSelected: { color: Colors.accent },
  defaultRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 16 },
  checkbox: { width: 24, height: 24, borderWidth: 2, borderColor: Colors.border, borderRadius: 6, alignItems: "center", justifyContent: "center" },
  checkboxChecked: { borderColor: Colors.accent, backgroundColor: Colors.accent + "20" },
  checkmark: { color: Colors.accent, fontSize: 16, fontFamily: "Inter_700Bold" },
  defaultLabel: { fontSize: 15, fontFamily: "Inter_400Regular", color: Colors.text },
  saveBtn: { backgroundColor: Colors.accent, paddingVertical: 16, borderRadius: 10, alignItems: "center", marginTop: 20 },
  saveBtnText: { fontSize: 16, fontFamily: "Inter_600SemiBold", color: Colors.background },
});
