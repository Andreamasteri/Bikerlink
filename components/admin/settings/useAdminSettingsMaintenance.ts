import { useState, useEffect } from "react";
import { Alert } from "react-native";
import { useQuery, useMutation } from "@tanstack/react-query";
import * as DocumentPicker from "expo-document-picker";
import { getApiUrl, queryClient, apiRequest } from "@/lib/query-client";

export function useAdminSettingsMaintenance(isAdmin: boolean, t: (k: string) => string) {
  const { data: syncStatus, refetch: refetchSyncStatus } = useQuery<{
    available: boolean;
    inProgress: boolean;
    lastSync: { startedAt: string; finishedAt?: string; ok: boolean; error?: string } | null;
    nextScheduledAt: string | null;
  }>({
    queryKey: ["/api/admin/sync-status"],
    refetchInterval: 10000,
  });

  const syncMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/admin/sync-prod-to-dev", {}),
    onSuccess: () => {
      refetchSyncStatus();
      Alert.alert(t("admin.syncCompleted"), t("admin.devSyncMsg"));
    },
    onError: (e: Error) => Alert.alert("Errore sync", e.message),
  });

  const { data: otaGateData } = useQuery<{ enabled: boolean }>({
    queryKey: ["/api/settings/ota-gate-enabled"],
  });
  const otaGateEnabled = otaGateData?.enabled === true;

  const otaGateMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      const baseUrl = getApiUrl();
      const url = new URL("/api/admin/settings/ota_gate_enabled", baseUrl);
      const res = await fetch(url.toString(), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value: enabled ? "true" : "false" }),
        credentials: "include",
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings/ota-gate-enabled"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/settings"] });
    },
    onError: (e: Error) => Alert.alert("Errore", e.message),
  });

  const { data: otaWaitData } = useQuery<{ seconds: number }>({
    queryKey: ["/api/settings/ota-wait-seconds"],
  });
  const [otaWaitInput, setOtaWaitInput] = useState("");
  useEffect(() => {
    if (otaWaitData?.seconds != null && otaWaitInput === "") {
      setOtaWaitInput(String(otaWaitData.seconds));
    }
  }, [otaWaitData]);

  const otaWaitMutation = useMutation({
    mutationFn: async (seconds: number) => {
      const baseUrl = getApiUrl();
      const url = new URL("/api/admin/settings/ota_wait_seconds", baseUrl);
      const res = await fetch(url.toString(), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value: String(seconds) }),
        credentials: "include",
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings/ota-wait-seconds"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/settings"] });
      Alert.alert("Successo", "Attesa OTA aggiornata");
    },
    onError: (e: Error) => Alert.alert("Errore", e.message),
  });

  const { data: otaRetentionData } = useQuery<{ days: number }>({
    queryKey: ["/api/settings/ota-retention-days"],
  });
  const [otaRetentionInput, setOtaRetentionInput] = useState("");
  useEffect(() => {
    if (otaRetentionData?.days != null && otaRetentionInput === "") {
      setOtaRetentionInput(String(otaRetentionData.days));
    }
  }, [otaRetentionData]);

  const otaRetentionMutation = useMutation({
    mutationFn: async (days: number) => {
      const baseUrl = getApiUrl();
      const url = new URL("/api/admin/settings/ota_retention_days", baseUrl);
      const res = await fetch(url.toString(), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value: String(days) }),
        credentials: "include",
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings/ota-retention-days"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/settings"] });
      Alert.alert("Successo", "Ritenzione OTA aggiornata");
    },
    onError: (e: Error) => Alert.alert("Errore", e.message),
  });

  const [emailConfigModalVisible, setEmailConfigModalVisible] = useState(false);
  const [emailConfigAdminPass, setEmailConfigAdminPass] = useState("");
  const [emailConfigGmail, setEmailConfigGmail] = useState("");
  const [emailConfigAppPass, setEmailConfigAppPass] = useState("");
  const [isSavingEmailConfig, setIsSavingEmailConfig] = useState(false);

  const { data: emailConfigData } = useQuery<{ gmail: string }>({
    queryKey: ["/api/admin/settings/email-config"],
    enabled: isAdmin,
  });

  useEffect(() => {
    if (emailConfigData?.gmail) setEmailConfigGmail(emailConfigData.gmail);
  }, [emailConfigData]);

  const handleSaveEmailConfig = async () => {
    if (!emailConfigAdminPass || !emailConfigGmail || !emailConfigAppPass) {
      Alert.alert("Errore", "Tutti i campi sono obbligatori");
      return;
    }
    try {
      setIsSavingEmailConfig(true);
      await apiRequest("PUT", "/api/admin/settings/email-config", {
        adminPassword: emailConfigAdminPass,
        gmail: emailConfigGmail,
        appPassword: emailConfigAppPass,
      });
      setEmailConfigModalVisible(false);
      setEmailConfigAdminPass("");
      setEmailConfigAppPass("");
      queryClient.invalidateQueries({ queryKey: ["/api/admin/settings/email-config"] });
      Alert.alert("Successo", "Configurazione email salvata");
    } catch (error: any) {
      Alert.alert("Errore", error.message);
    } finally {
      setIsSavingEmailConfig(false);
    }
  };

  const [paypalEmail, setPaypalEmail] = useState("");
  const [isSavingPaypal, setIsSavingPaypal] = useState(false);
  const { data: paypalData } = useQuery<{ value: string }>({
    queryKey: ["/api/admin/settings/paypal_donation_email"],
    enabled: isAdmin,
  });

  useEffect(() => {
    if (paypalData?.value) setPaypalEmail(paypalData.value);
  }, [paypalData]);

  const handleSavePaypal = async () => {
    try {
      setIsSavingPaypal(true);
      await apiRequest("PUT", "/api/admin/settings/paypal_donation_email", { value: paypalEmail });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/settings/paypal_donation_email"] });
      Alert.alert("Successo", "Email PayPal salvata");
    } catch (error: any) {
      Alert.alert("Errore", error.message);
    } finally {
      setIsSavingPaypal(false);
    }
  };

  const handleUploadEula = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: "application/pdf" });
      if (result.canceled) return;
      const file = result.assets[0];
      const formData = new FormData();
      formData.append("file", { uri: file.uri, name: file.name, type: "application/pdf" } as any);
      await apiRequest("POST", "/api/admin/upload-eula", formData);
      Alert.alert("Successo", "Documento EULA caricato correttamente");
    } catch (e: any) {
      Alert.alert("Errore", e.message);
    }
  };

  return {
    syncStatus,
    syncMutation,
    otaGateEnabled,
    otaGateMutation,
    otaWaitInput,
    setOtaWaitInput,
    otaWaitMutation,
    otaWaitPending: otaWaitMutation.isPending,
    otaRetentionInput,
    setOtaRetentionInput,
    otaRetentionMutation,
    emailConfigModalVisible,
    setEmailConfigModalVisible,
    emailConfigAdminPass,
    setEmailConfigAdminPass,
    emailConfigGmail,
    setEmailConfigGmail,
    emailConfigAppPass,
    setEmailConfigAppPass,
    isSavingEmailConfig,
    emailConfigData,
    handleSaveEmailConfig,
    paypalEmail,
    setPaypalEmail,
    isSavingPaypal,
    handleSavePaypal,
    handleUploadEula,
  };
}
