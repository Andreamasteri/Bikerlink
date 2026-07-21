import { useState, useEffect } from "react";
import { Alert } from "react-native";
import { useQuery, useMutation } from "@tanstack/react-query";
import * as DocumentPicker from "expo-document-picker";
import { queryClient, apiRequest } from "@/lib/query-client";
import { appendFileToForm } from "@/lib/image-picker-utils";

export function useAdminSettingsMaintenance(isAdmin: boolean, t: (k: string) => string) {
  const SYNC_STATUS_KEY = ["/api/admin/db/sync/status"] as const;

  const { data: syncStatus } = useQuery<{
    available: boolean;
    inProgress: boolean;
    lastSync: { startedAt: string; finishedAt?: string; ok: boolean; error?: string } | null;
    nextScheduledAt: string | null;
  }>({
    queryKey: SYNC_STATUS_KEY,
    // Poll ogni 3s quando il sync è in corso, altrimenti ogni 30s.
    refetchInterval: (query) =>
      (query.state.data as { inProgress?: boolean } | undefined)?.inProgress ? 3000 : 30000,
  });

  const syncMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/db/sync/run", {});
      return res.json();
    },
    onSuccess: () => {
      // Il POST è sincrono: ritorna solo quando il sync è terminato.
      // Invalidiamo lo status così la card aggiorna senza reload.
      queryClient.invalidateQueries({ queryKey: SYNC_STATUS_KEY });
      Alert.alert(t("admin.syncCompleted"), t("admin.devSyncMsg"));
    },
    onError: (e: Error) => Alert.alert("Errore sync", (e as Error).message),
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
    } catch (error: unknown) {
      Alert.alert("Errore", (error as Error).message);
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
    } catch (error: unknown) {
      Alert.alert("Errore", (error as Error).message);
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
      await appendFileToForm(formData, "file", file.uri, "application/pdf", file.name);
      await apiRequest("POST", "/api/admin/upload-eula", formData);
      Alert.alert("Successo", "Documento EULA caricato correttamente");
    } catch (e: unknown) {
      Alert.alert("Errore", (e as Error).message);
    }
  };

  return {
    syncStatus,
    syncMutation,
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
