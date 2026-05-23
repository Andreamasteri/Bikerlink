import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from "react-native";
import { useQuery, useMutation } from "@tanstack/react-query";
import { MaterialCommunityIcons, Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";

import Colors from "@/constants/colors";
import { useAuth } from "@/lib/auth-context";
import { apiRequest, queryClient } from "@/lib/query-client";
import { useT } from "@/lib/language-context";
import { motorcycleSchema } from "@shared/validators";

import { GarageHeader } from "@/components/garage/GarageHeader";
import { MotoCard } from "@/components/garage/MotoCard";
import { AddMotoForm } from "@/components/garage/AddMotoForm";
import { WishlistSection } from "@/components/garage/WishlistSection";

const MOTO_TYPES = [
  { value: "sportiva" },
  { value: "supersportiva" },
  { value: "custom" },
  { value: "harley" },
  { value: "touring" },
  { value: "naked" },
  { value: "enduro" },
  { value: "cafe_racer" },
  { value: "altro" },
] as const;

const RIDING_STYLES = [
  { value: "passeggio" },
  { value: "tranquilla" },
  { value: "allegra" },
  { value: "mozzafiato" },
] as const;

export default function GarageScreen() {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();

  if (user?.userType === "zavorrina") {
    return <WishlistSection insets={insets} MOTO_TYPES={MOTO_TYPES} RIDING_STYLES={RIDING_STYLES} />;
  }

  return <GarageContent />;
}

function GarageContent() {
  const { user, isLoading: authIsLoading } = useAuth();
  const router = useRouter();
  const t = useT();
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
    isForSale: false,
    saleDescription: "",
    motoDescription: "",
  });

  const { data: marketplaceData } = useQuery<{ enabled: boolean }>({
    queryKey: ["/api/settings/marketplace-enabled"],
  });
  const marketplaceEnabled = marketplaceData?.enabled !== false;

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["/api/motorcycles"],
    enabled: !!user,
    refetchOnMount: true,
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
    onSuccess: async (responseData: any) => {
      await queryClient.refetchQueries({ queryKey: ["/api/motorcycles"] });
      setShowForm(false);
      resetForm();

      if (responseData?.matches && responseData.matches.length > 0) {
        const matchInfo = responseData.matches
          .map((m: any) => `${m.zavarrinaNickname || "Zavorrina"} ${t("garage.lookingFor")} ${m.brand} ${m.model}`)
          .join("\n");
        Alert.alert("Here Comes Your Chance!!", matchInfo);
      }
    },
    onError: (err: any) => {
      Alert.alert(t("common.error"), err.message || t("garage.saveError"));
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

  const resetForm = () => {
    setForm({ brand: "", model: "", displacement: "", motorcycleType: "", ridingStyle: "", isDefault: false, isForSale: false, saleDescription: "", motoDescription: "" });
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
      isForSale: moto.isForSale || false,
      saleDescription: moto.saleDescription || "",
      motoDescription: moto.motoDescription || "",
    });
    setShowForm(true);
  };

  const handleSave = () => {
    const parsed = motorcycleSchema.safeParse({
      ...form,
      displacement: form.displacement ? parseInt(form.displacement, 10) : undefined,
    });
    if (!parsed.success) {
      Alert.alert(t("common.error"), parsed.error.issues[0]?.message ?? t("garage.fillRequired"));
      return;
    }
    saveMutation.mutate(form);
  };

  const handleDelete = (id: string, displayName: string) => {
    Alert.alert(t("garage.deleteMoto"), `${t("garage.deleteMoto")} "${displayName}"?`, [
      { text: t("common.cancel"), style: "cancel" },
      { text: t("common.delete"), style: "destructive", onPress: () => deleteMutation.mutate(id) },
    ]);
  };

  const getMotoTypeLabel = (v: string) => t(`garage.motoType.${v}`) || v;
  const getStyleLabel = (v: string) => t(`garage.style.${v}`) || v;

  const getMotoDisplayName = (item: any) => {
    const parts = [item.brand, item.model].filter(Boolean);
    const name = parts.join(" ");
    if (item.displacement) {
      return `${name} (${item.displacement} cc)`;
    }
    return name;
  };

  if (!authIsLoading && user === null) {
    return (
      <View style={[styles.empty, { flex: 1, justifyContent: "center" }]}>
        <Ionicons name="lock-closed-outline" size={64} color={Colors.textSecondary} />
        <Text style={styles.emptyText}>{t("auth.sessionExpired")}</Text>
        <Pressable
          style={sessionExpiredBtn}
          onPress={() => router.replace("/(auth)/login")}
        >
          <Text style={sessionExpiredBtnText}>{t("auth.loginToContinue")}</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {(isLoading || authIsLoading) ? (
        <View style={styles.loading}>
          <ActivityIndicator size="large" color={Colors.accent} />
        </View>
      ) : (
        <>
          <GarageHeader 
            motorcyclesCount={motorcycles.length} 
            onAddPress={openAdd}
          />
          <FlatList
            data={motorcycles}
            renderItem={({ item }) => (
              <MotoCard
                item={item}
                onPress={() => openEdit(item)}
                onDelete={() => handleDelete(item.id, getMotoDisplayName(item))}
                marketplaceEnabled={marketplaceEnabled}
                getMotoDisplayName={getMotoDisplayName}
                getMotoTypeLabel={getMotoTypeLabel}
                getStyleLabel={getStyleLabel}
              />
            )}
            keyExtractor={(item) => item.id}
            contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 80 }]}
            refreshControl={<RefreshControl refreshing={false} onRefresh={refetch} tintColor={Colors.accent} />}
            ListEmptyComponent={
              <View style={styles.empty}>
                <MaterialCommunityIcons name="motorbike" size={72} color={Colors.accent} />
                <Text style={styles.emptyText}>{t("garage.noMotoInGarage")}</Text>
                <Text style={styles.emptyDesc}>{t("garage.garageDesc")}</Text>
                <View style={styles.emptyCtaHint}>
                  <Text style={styles.emptyCtaLabel}>{t("garage.addFirstMoto")}</Text>
                  <Ionicons name="chevron-down" size={26} color={Colors.accent} />
                </View>
              </View>
            }
          />

          {motorcycles.length > 0 && (
            <Pressable 
              style={[styles.addBtn, { bottom: insets.bottom + 16 }]} 
              onPress={openAdd}
            >
              <Ionicons name="add" size={24} color={Colors.background} />
              <Text style={styles.addBtnText}>{t("garage.addMoto")}</Text>
            </Pressable>
          )}

          <AddMotoForm
            visible={showForm}
            onClose={() => { setShowForm(false); resetForm(); }}
            form={form}
            setForm={setForm}
            editingId={editingId}
            onSave={handleSave}
            isPending={saveMutation.isPending}
            insets={insets}
            marketplaceEnabled={marketplaceEnabled}
            MOTO_TYPES={MOTO_TYPES}
            RIDING_STYLES={RIDING_STYLES}
          />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  loading: { flex: 1, justifyContent: "center", alignItems: "center" },
  list: { padding: 16 },
  empty: { alignItems: "center", paddingTop: 80, paddingHorizontal: 32, gap: 14 },
  emptyText: { fontSize: 20, fontFamily: "Inter_600SemiBold", color: Colors.text, textAlign: "center" },
  emptyDesc: { fontSize: 14, fontFamily: "Inter_400Regular", color: Colors.textSecondary, textAlign: "center", lineHeight: 20 },
  emptyCtaHint: { alignItems: "center", gap: 2, marginTop: 8 },
  emptyCtaLabel: { fontSize: 15, fontFamily: "Inter_500Medium", color: Colors.accent },
  addBtn: {
    position: "absolute",
    alignSelf: "center",
    width: "80%",
    height: 56,
    borderRadius: 16,
    backgroundColor: Colors.accent,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    elevation: 6,
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  addBtnText: { fontSize: 16, fontFamily: "Inter_600SemiBold", color: Colors.background },
});

const sessionExpiredBtn = {
  backgroundColor: Colors.accent,
  paddingHorizontal: 24,
  paddingVertical: 12,
  borderRadius: 10,
  alignItems: "center" as const,
  marginTop: 8,
};

const sessionExpiredBtnText = {
  fontSize: 16,
  fontFamily: "Inter_600SemiBold",
  color: "#fff",
};
