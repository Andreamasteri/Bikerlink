import React, { useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, TextInput, Alert, ActivityIndicator, Switch, Modal } from "react-native";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as DocumentPicker from "expo-document-picker";
import Colors from "@/constants/colors";
import { getApiUrl, queryClient, apiRequest } from "@/lib/query-client";
import { fetch } from "expo/fetch";

interface AppSetting {
  id: string;
  key: string;
  value: string | null;
  description: string | null;
}

const defaultSettings = [
  { key: "eula_text", label: "Testo EULA", placeholder: "Inserisci il testo EULA..." },
  { key: "splash_message", label: "Messaggio Splash", placeholder: "Messaggio da mostrare nello splash..." },
  { key: "maintenance_mode", label: "Modalita manutenzione", placeholder: "true / false" },
  { key: "min_app_version", label: "Versione minima app", placeholder: "1.0.0" },
  { key: "max_photos_zavorrina", label: "Max foto zavorrina", placeholder: "3" },
  { key: "max_daily_votes", label: "Max voti giornalieri", placeholder: "10" },
];

export default function AdminSettings() {
  const insets = useSafeAreaInsets();
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [protectedToggle, setProtectedToggle] = useState<{ key: string; value: boolean; label: string } | null>(null);
  const [protectedPassword, setProtectedPassword] = useState("");

  const { data: settings = [], isLoading } = useQuery<AppSetting[]>({
    queryKey: ["/api/admin/settings"],
  });

  const { data: adsEnabledData } = useQuery<{ enabled: boolean }>({
    queryKey: ["/api/settings/ads-enabled"],
  });
  const adsEnabled = adsEnabledData?.enabled !== false;

  const { data: synecoData } = useQuery<{ visible: boolean }>({
    queryKey: ["/api/settings/syneco-branding"],
  });
  const synecoVisible = synecoData?.visible === true;

  const { data: emailVerifData } = useQuery<{ enabled: boolean }>({
    queryKey: ["/api/settings/email-verification"],
  });
  const emailVerifEnabled = emailVerifData?.enabled === true;

  const { data: autoMatchData } = useQuery<{ enabled: boolean }>({
    queryKey: ["/api/settings/auto-matching"],
  });
  const autoMatchEnabled = autoMatchData?.enabled !== false;

  const { data: primalData } = useQuery<{ enabled: boolean }>({
    queryKey: ["/api/settings/primal-user"],
  });
  const primalEnabled = primalData?.enabled === true;

  const { data: customRoutesData } = useQuery<{ enabled: boolean }>({
    queryKey: ["/api/settings/custom-routes"],
  });
  const customRoutesEnabled = customRoutesData?.enabled !== false;

  const protectedToggleMutation = useMutation({
    mutationFn: async ({ key, value, adminPassword }: { key: string; value: string; adminPassword: string }) => {
      const baseUrl = getApiUrl();
      const url = new URL("/api/admin/settings/toggle-protected", baseUrl);
      const res = await fetch(url.toString(), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, value, adminPassword }),
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: "Errore" }));
        throw new Error(err.message);
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings/email-verification"] });
      queryClient.invalidateQueries({ queryKey: ["/api/settings/syneco-branding"] });
      queryClient.invalidateQueries({ queryKey: ["/api/settings/ads-enabled"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/settings"] });
      setProtectedToggle(null);
      setProtectedPassword("");
    },
    onError: (error: Error) => {
      Alert.alert("Errore", error.message);
    },
  });

  const { data: sosData } = useQuery<{ enabled: boolean }>({
    queryKey: ["/api/settings/sos-enabled"],
  });
  const sosEnabled = sosData?.enabled !== false;

  const sosMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      const baseUrl = getApiUrl();
      const url = new URL("/api/admin/settings/sos_enabled", baseUrl);
      const res = await globalThis.fetch(url.toString(), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value: enabled ? "true" : "false" }),
        credentials: "include",
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings/sos-enabled"] });
      queryClient.invalidateQueries({ queryKey: ["/api/settings/all"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/settings"] });
    },
  });

  const customRoutesMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      const baseUrl = getApiUrl();
      const url = new URL("/api/admin/settings/custom_routes_enabled", baseUrl);
      const res = await globalThis.fetch(url.toString(), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value: enabled ? "true" : "false" }),
        credentials: "include",
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings/custom-routes"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/settings"] });
    },
  });

  const autoMatchMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      const baseUrl = getApiUrl();
      const url = new URL("/api/admin/settings/auto_matching_enabled", baseUrl);
      const res = await globalThis.fetch(url.toString(), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value: enabled ? "true" : "false" }),
        credentials: "include",
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings/auto-matching"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/settings"] });
    },
  });

  const primalMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      const baseUrl = getApiUrl();
      const url = new URL("/api/admin/settings/primal_user_enabled", baseUrl);
      const res = await globalThis.fetch(url.toString(), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value: enabled ? "true" : "false" }),
        credentials: "include",
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings/primal-user"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/settings"] });
    },
  });

  const [isUploadingEula, setIsUploadingEula] = useState(false);

  const [privacyPolicyText, setPrivacyPolicyText] = useState("");
  const [isUploadingPrivacy, setIsUploadingPrivacy] = useState(false);
  const [isSavingPrivacy, setIsSavingPrivacy] = useState(false);

  const [paypalEmail, setPaypalEmail] = useState("");
  const [isSavingPaypal, setIsSavingPaypal] = useState(false);

  const [emailConfigModalVisible, setEmailConfigModalVisible] = useState(false);
  const [emailConfigAdminPass, setEmailConfigAdminPass] = useState("");
  const [emailConfigGmail, setEmailConfigGmail] = useState("");
  const [emailConfigAppPass, setEmailConfigAppPass] = useState("");
  const [isSavingEmailConfig, setIsSavingEmailConfig] = useState(false);

  const { data: emailConfigData } = useQuery<{ configured: boolean; maskedEmail: string }>({
    queryKey: ["/api/admin/settings/email-config"],
  });

  async function handleSaveEmailConfig() {
    if (!emailConfigAdminPass) {
      Alert.alert("Errore", "Inserisci la password admin");
      return;
    }
    if (!emailConfigGmail && !emailConfigAppPass) {
      Alert.alert("Errore", "Inserisci almeno un campo da aggiornare");
      return;
    }
    try {
      setIsSavingEmailConfig(true);
      await apiRequest("PUT", "/api/admin/settings/email-config", {
        gmailUser: emailConfigGmail || undefined,
        gmailAppPassword: emailConfigAppPass || undefined,
        adminPassword: emailConfigAdminPass,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/settings/email-config"] });
      setEmailConfigModalVisible(false);
      setEmailConfigAdminPass("");
      setEmailConfigGmail("");
      setEmailConfigAppPass("");
      Alert.alert("Successo", "Configurazione email aggiornata");
    } catch (error: any) {
      Alert.alert("Errore", error.message || "Password admin non corretta o errore durante il salvataggio");
    } finally {
      setIsSavingEmailConfig(false);
    }
  }

  const { data: paypalData } = useQuery<{ email: string }>({
    queryKey: ["/api/settings/paypal"],
  });

  React.useEffect(() => {
    if (paypalData?.email !== undefined) {
      setPaypalEmail(paypalData.email);
    }
  }, [paypalData?.email]);

  async function handleSavePaypal() {
    try {
      setIsSavingPaypal(true);
      await apiRequest("PUT", "/api/admin/settings/paypal_email", { value: paypalEmail });
      queryClient.invalidateQueries({ queryKey: ["/api/settings/paypal"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/settings"] });
      Alert.alert("Successo", "Email PayPal salvata con successo");
    } catch (error: any) {
      Alert.alert("Errore", error.message || "Errore durante il salvataggio");
    } finally {
      setIsSavingPaypal(false);
    }
  }

  const { data: privacyData } = useQuery<{ text: string }>({
    queryKey: ["/api/settings/privacy-policy"],
  });

  React.useEffect(() => {
    if (privacyData?.text !== undefined) {
      setPrivacyPolicyText(privacyData.text);
    }
  }, [privacyData?.text]);

  const updateMutation = useMutation({
    mutationFn: async ({ key, value }: { key: string; value: string }) => {
      const baseUrl = getApiUrl();
      const url = new URL(`/api/admin/settings/${key}`, baseUrl);
      const res = await fetch(url.toString(), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value }),
        credentials: "include",
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/settings"] });
      setEditingKey(null);
      setEditValue("");
    },
  });

  async function handleUploadEula() {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: "text/plain",
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets || result.assets.length === 0) {
        return;
      }

      const asset = result.assets[0];

      setIsUploadingEula(true);

      const formData = new FormData();
      formData.append("file", {
        uri: asset.uri,
        name: asset.name || "eula.txt",
        type: "text/plain",
      } as any);

      const baseUrl = getApiUrl();
      const url = new URL("/api/admin/settings/eula/upload", baseUrl);

      const res = await fetch(url.toString(), {
        method: "POST",
        body: formData,
        credentials: "include",
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ message: "Errore durante l'upload" }));
        Alert.alert("Errore", errorData.message || "Errore durante l'upload");
        return;
      }

      const data = await res.json();
      queryClient.invalidateQueries({ queryKey: ["/api/admin/settings"] });

      if (editingKey === "eula_text" && data.value) {
        setEditValue(data.value);
      }

      Alert.alert("Successo", "EULA caricato con successo");
    } catch (error: any) {
      Alert.alert("Errore", error.message || "Errore durante l'upload del file");
    } finally {
      setIsUploadingEula(false);
    }
  }

  async function handleSavePrivacyPolicy() {
    try {
      setIsSavingPrivacy(true);
      await apiRequest("PUT", "/api/admin/settings/privacy_policy_text", { value: privacyPolicyText });
      queryClient.invalidateQueries({ queryKey: ["/api/settings/privacy-policy"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/settings"] });
      Alert.alert("Successo", "Privacy Policy salvata con successo");
    } catch (error: any) {
      Alert.alert("Errore", error.message || "Errore durante il salvataggio");
    } finally {
      setIsSavingPrivacy(false);
    }
  }

  async function handleUploadPrivacyPolicy() {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: "text/plain",
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets || result.assets.length === 0) {
        return;
      }

      const asset = result.assets[0];
      setIsUploadingPrivacy(true);

      const formData = new FormData();
      formData.append("file", {
        uri: asset.uri,
        name: asset.name || "privacy-policy.txt",
        type: "text/plain",
      } as any);

      const baseUrl = getApiUrl();
      const url = new URL("/api/admin/settings/privacy-policy/upload", baseUrl);

      const res = await fetch(url.toString(), {
        method: "POST",
        body: formData,
        credentials: "include",
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ message: "Errore durante l'upload" }));
        Alert.alert("Errore", errorData.message || "Errore durante l'upload");
        return;
      }

      const data = await res.json();
      queryClient.invalidateQueries({ queryKey: ["/api/settings/privacy-policy"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/settings"] });

      if (data.value) {
        setPrivacyPolicyText(data.value);
      }

      Alert.alert("Successo", "Privacy Policy caricata con successo");
    } catch (error: any) {
      Alert.alert("Errore", error.message || "Errore durante l'upload del file");
    } finally {
      setIsUploadingPrivacy(false);
    }
  }

  function getSettingValue(key: string): string {
    const setting = (settings || []).find((s) => s.key === key);
    return setting?.value ?? "";
  }

  function startEditing(key: string) {
    setEditingKey(key);
    setEditValue(getSettingValue(key));
  }

  function handleSave() {
    if (!editingKey) return;
    updateMutation.mutate({ key: editingKey, value: editValue });
  }

  return (
    <>
    <KeyboardAwareScrollViewCompat
      style={styles.container}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 20 }]}
      bottomOffset={20}
    >
      <View style={styles.paidSectionHeader}>
        <Ionicons name="card" size={22} color={Colors.warning} />
        <Text style={styles.paidSectionTitle}>A Pagamento</Text>
      </View>
      <Text style={styles.paidSectionDesc}>
        Funzioni premium che verranno attivate a pagamento in futuro.
      </Text>

      <View style={styles.paidCard}>
        <View style={styles.synecoHeader}>
          <View style={styles.synecoInfo}>
            <Ionicons name="git-compare" size={20} color={Colors.warning} />
            <Text style={styles.synecoLabel}>Match Automatico</Text>
          </View>
          <Switch
            value={autoMatchEnabled}
            onValueChange={(val) => autoMatchMutation.mutate(val)}
            trackColor={{ false: Colors.border, true: Colors.warning }}
            thumbColor={autoMatchEnabled ? Colors.text : Colors.textSecondary}
            disabled={autoMatchMutation.isPending}
          />
        </View>
        <Text style={styles.synecoDesc}>
          {autoMatchEnabled ? "Il motore di matching automatico è attivo" : "Il matching automatico è disattivato"}
        </Text>
      </View>

      <View style={styles.paidCard}>
        <View style={styles.synecoHeader}>
          <View style={styles.synecoInfo}>
            <Ionicons name="map" size={20} color={Colors.warning} />
            <Text style={styles.synecoLabel}>Percorsi Personalizzati</Text>
          </View>
          <Switch
            value={customRoutesEnabled}
            onValueChange={(val) => customRoutesMutation.mutate(val)}
            trackColor={{ false: Colors.border, true: Colors.warning }}
            thumbColor={customRoutesEnabled ? Colors.text : Colors.textSecondary}
            disabled={customRoutesMutation.isPending}
          />
        </View>
        <Text style={styles.synecoDesc}>
          {customRoutesEnabled ? "Gli utenti possono creare percorsi personalizzati" : "I percorsi personalizzati sono disattivati"}
        </Text>
      </View>

      <View style={styles.synecoCard}>
        <View style={styles.synecoHeader}>
          <View style={styles.synecoInfo}>
            <Ionicons name="warning" size={20} color="#FF6600" />
            <Text style={styles.synecoLabel}>SOS Biker</Text>
          </View>
          <Switch
            value={sosEnabled}
            onValueChange={(val) => sosMutation.mutate(val)}
            trackColor={{ false: Colors.border, true: "#FF6600" }}
            thumbColor={sosEnabled ? Colors.text : Colors.textSecondary}
            disabled={sosMutation.isPending}
          />
        </View>
        <Text style={styles.synecoDesc}>
          {sosEnabled ? "Gli utenti possono inviare e accogliere richieste SOS" : "La funzione SOS è disattivata per tutti"}
        </Text>
      </View>

      <View style={styles.synecoCard}>
        <View style={styles.synecoHeader}>
          <View style={styles.synecoInfo}>
            <Ionicons name="megaphone" size={20} color={Colors.syneco} />
            <Text style={styles.synecoLabel}>Branding Syneco</Text>
          </View>
          <Switch
            value={synecoVisible}
            onValueChange={(val) => setProtectedToggle({ key: "syneco_branding_visible", value: val, label: "Branding Syneco" })}
            trackColor={{ false: Colors.border, true: Colors.syneco }}
            thumbColor={synecoVisible ? Colors.text : Colors.textSecondary}
            disabled={protectedToggleMutation.isPending}
          />
        </View>
        <Text style={styles.synecoDesc}>
          {synecoVisible ? "Il branding Syneco è visibile nell'app" : "Il branding Syneco è nascosto"}
        </Text>
      </View>

      <View style={styles.synecoCard}>
        <View style={styles.synecoHeader}>
          <View style={styles.synecoInfo}>
            <Ionicons name="volume-high" size={20} color={Colors.syneco} />
            <Text style={styles.synecoLabel}>Advertisement</Text>
          </View>
          <Switch
            value={adsEnabled}
            onValueChange={(val) => setProtectedToggle({ key: "ads_enabled", value: val, label: "Advertisement" })}
            trackColor={{ false: Colors.border, true: Colors.syneco }}
            thumbColor={adsEnabled ? Colors.text : Colors.textSecondary}
            disabled={protectedToggleMutation.isPending}
          />
        </View>
        <Text style={styles.synecoDesc}>
          {adsEnabled ? "Gli advertisement sono attivi nell'app" : "Gli advertisement sono disattivati"}
        </Text>
      </View>

      <View style={styles.emailVerifCard}>
        <View style={styles.synecoHeader}>
          <View style={styles.synecoInfo}>
            <Ionicons name="mail" size={20} color={Colors.accent} />
            <Text style={styles.synecoLabel}>Verifica Email</Text>
            <TouchableOpacity
              onPress={() => Alert.alert(
                "Verifica Email - Info",
                "Quando attiva:\n\n" +
                "1. Ogni nuovo utente riceve un codice di verifica a 6 cifre\n" +
                "2. L'utente deve inserire il codice nella schermata di verifica per completare la registrazione\n" +
                "3. Il codice scade dopo 30 minuti\n" +
                "4. L'utente non potrà fare login finché non verifica l'email\n" +
                "5. L'admin riceve una notifica con il codice generato\n" +
                "6. L'utente può richiedere un nuovo codice dalla schermata di verifica"
              )}
              style={{ marginLeft: 6 }}
            >
              <Ionicons name="information-circle-outline" size={20} color={Colors.textSecondary} />
            </TouchableOpacity>
          </View>
          <Switch
            value={emailVerifEnabled}
            onValueChange={(val) => setProtectedToggle({ key: "email_verification_enabled", value: val, label: "Verifica Email" })}
            trackColor={{ false: Colors.border, true: Colors.accent }}
            thumbColor={emailVerifEnabled ? Colors.text : Colors.textSecondary}
            disabled={protectedToggleMutation.isPending}
          />
        </View>
        <Text style={styles.synecoDesc}>
          {emailVerifEnabled ? "Attiva la verifica email per le nuove registrazioni" : "La verifica email è disattivata"}
        </Text>
      </View>

      <View style={styles.emailVerifCard}>
        <View style={styles.synecoHeader}>
          <View style={styles.synecoInfo}>
            <Ionicons name="star" size={20} color="#FFD700" />
            <Text style={styles.synecoLabel}>Primal User</Text>
          </View>
          <Switch
            value={primalEnabled}
            onValueChange={(val) => primalMutation.mutate(val)}
            trackColor={{ false: Colors.border, true: "#FFD700" }}
            thumbColor={primalEnabled ? Colors.text : Colors.textSecondary}
            disabled={primalMutation.isPending}
          />
        </View>
        <Text style={styles.synecoDesc}>
          {primalEnabled ? "I nuovi utenti registrati saranno marcati come 'Primal'" : "La marcatura Primal è disattivata"}
        </Text>
      </View>

      <View style={styles.emailSmtpCard}>
        <View style={styles.synecoHeader}>
          <View style={styles.synecoInfo}>
            <Ionicons name="send" size={20} color="#4285F4" />
            <Text style={styles.synecoLabel}>Email SMTP (Gmail)</Text>
            <TouchableOpacity
              onPress={() => Alert.alert(
                "Configurazione Email SMTP",
                "Per inviare email dall'app (verifica email, notifiche) serve un account Gmail configurato.\n\n" +
                "Come configurare:\n" +
                "1. Crea un account Gmail dedicato\n" +
                "2. Vai su myaccount.google.com → Sicurezza\n" +
                "3. Attiva la verifica in due passaggi\n" +
                "4. Vai su 'Password per le app'\n" +
                "5. Crea una nuova password per 'Posta'\n" +
                "6. Inserisci qui l'indirizzo Gmail e la password generata\n\n" +
                "La modifica richiede la password admin per sicurezza."
              )}
              style={{ marginLeft: 6 }}
            >
              <Ionicons name="information-circle-outline" size={20} color={Colors.textSecondary} />
            </TouchableOpacity>
          </View>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", marginTop: 10, gap: 8 }}>
          <View style={{
            width: 10, height: 10, borderRadius: 5,
            backgroundColor: emailConfigData?.configured ? "#4CAF50" : "#F44336",
          }} />
          <Text style={styles.synecoDesc}>
            {emailConfigData?.configured
              ? `Configurato: ${emailConfigData.maskedEmail}`
              : "Non configurato — le email non verranno inviate"}
          </Text>
        </View>
        <TouchableOpacity
          style={[styles.saveBtn, { marginTop: 12, flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start" }]}
          onPress={() => setEmailConfigModalVisible(true)}
        >
          <Ionicons name="lock-closed" size={16} color={Colors.background} />
          <Text style={styles.saveBtnText}>Modifica</Text>
        </TouchableOpacity>
      </View>

      <Modal
        visible={emailConfigModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setEmailConfigModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Configura Email SMTP</Text>
            <Text style={styles.modalSubtitle}>Inserisci la password admin per sbloccare la modifica</Text>

            <Text style={styles.modalFieldLabel}>Password Admin</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="La tua password admin"
              placeholderTextColor={Colors.textSecondary}
              value={emailConfigAdminPass}
              onChangeText={setEmailConfigAdminPass}
              secureTextEntry
            />

            <Text style={styles.modalFieldLabel}>Indirizzo Gmail</Text>
            <TextInput
              style={styles.modalInput}
              placeholder={emailConfigData?.maskedEmail || "esempio@gmail.com"}
              placeholderTextColor={Colors.textSecondary}
              value={emailConfigGmail}
              onChangeText={setEmailConfigGmail}
              keyboardType="email-address"
              autoCapitalize="none"
            />

            <Text style={styles.modalFieldLabel}>Password per le App</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="xxxx xxxx xxxx xxxx"
              placeholderTextColor={Colors.textSecondary}
              value={emailConfigAppPass}
              onChangeText={setEmailConfigAppPass}
              secureTextEntry
            />

            <View style={styles.editActions}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => {
                  setEmailConfigModalVisible(false);
                  setEmailConfigAdminPass("");
                  setEmailConfigGmail("");
                  setEmailConfigAppPass("");
                }}
              >
                <Text style={styles.cancelBtnText}>Annulla</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.saveBtn}
                onPress={handleSaveEmailConfig}
                disabled={isSavingEmailConfig}
              >
                <Text style={styles.saveBtnText}>{isSavingEmailConfig ? "..." : "Salva"}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {isLoading ? (
        <Text style={styles.loadingText}>Caricamento...</Text>
      ) : (
        defaultSettings.map((setting) => (
          <View key={setting.key} style={styles.settingCard}>
            <View style={styles.settingHeader}>
              <Text style={styles.settingLabel}>{setting.label}</Text>
              <View style={styles.settingActions}>
                {setting.key === "eula_text" && editingKey !== setting.key && (
                  <TouchableOpacity
                    style={styles.uploadBtn}
                    onPress={handleUploadEula}
                    disabled={isUploadingEula}
                  >
                    {isUploadingEula ? (
                      <ActivityIndicator size="small" color={Colors.accent} />
                    ) : (
                      <Ionicons name="cloud-upload" size={20} color={Colors.accent} />
                    )}
                  </TouchableOpacity>
                )}
                {editingKey !== setting.key && (
                  <TouchableOpacity onPress={() => startEditing(setting.key)}>
                    <Ionicons name="create" size={20} color={Colors.accent} />
                  </TouchableOpacity>
                )}
              </View>
            </View>
            {editingKey === setting.key ? (
              <View>
                <TextInput
                  style={styles.input}
                  placeholder={setting.placeholder}
                  placeholderTextColor={Colors.textSecondary}
                  value={editValue}
                  onChangeText={setEditValue}
                  multiline={setting.key === "eula_text"}
                  numberOfLines={setting.key === "eula_text" ? 6 : 1}
                />
                <View style={styles.editActions}>
                  <TouchableOpacity style={styles.cancelBtn} onPress={() => setEditingKey(null)}>
                    <Text style={styles.cancelBtnText}>Annulla</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.saveBtn}
                    onPress={handleSave}
                    disabled={updateMutation.isPending}
                  >
                    <Text style={styles.saveBtnText}>{updateMutation.isPending ? "..." : "Salva"}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <Text style={styles.settingValue}>
                {getSettingValue(setting.key) || setting.placeholder}
              </Text>
            )}
          </View>
        ))
      )}

      <View style={styles.paypalCard}>
        <View style={styles.privacyHeader}>
          <View style={styles.synecoInfo}>
            <Ionicons name="logo-paypal" size={20} color="#003087" />
            <Text style={styles.synecoLabel}>Email PayPal Donazioni</Text>
          </View>
        </View>
        <TextInput
          style={[styles.input, { marginTop: 12 }]}
          placeholder="email@esempio.com"
          placeholderTextColor={Colors.textSecondary}
          value={paypalEmail}
          onChangeText={setPaypalEmail}
          keyboardType="email-address"
          autoCapitalize="none"
        />
        <View style={styles.editActions}>
          <TouchableOpacity
            style={styles.saveBtn}
            onPress={handleSavePaypal}
            disabled={isSavingPaypal}
          >
            <Text style={styles.saveBtnText}>{isSavingPaypal ? "..." : "Salva"}</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.privacyCard}>
        <View style={styles.privacyHeader}>
          <View style={styles.synecoInfo}>
            <Ionicons name="document-text-outline" size={20} color={Colors.accent} />
            <Text style={styles.synecoLabel}>Privacy Policy</Text>
          </View>
          <View style={styles.settingActions}>
            <TouchableOpacity
              style={styles.uploadBtn}
              onPress={handleUploadPrivacyPolicy}
              disabled={isUploadingPrivacy}
            >
              {isUploadingPrivacy ? (
                <ActivityIndicator size="small" color={Colors.accent} />
              ) : (
                <Ionicons name="cloud-upload" size={20} color={Colors.accent} />
              )}
            </TouchableOpacity>
          </View>
        </View>
        <TextInput
          style={[styles.input, { marginTop: 12, minHeight: 120 }]}
          placeholder="Inserisci il testo della Privacy Policy..."
          placeholderTextColor={Colors.textSecondary}
          value={privacyPolicyText}
          onChangeText={setPrivacyPolicyText}
          multiline
          numberOfLines={6}
        />
        <View style={styles.editActions}>
          <TouchableOpacity
            style={styles.saveBtn}
            onPress={handleSavePrivacyPolicy}
            disabled={isSavingPrivacy}
          >
            <Text style={styles.saveBtnText}>{isSavingPrivacy ? "..." : "Salva"}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAwareScrollViewCompat>

      <Modal
        visible={!!protectedToggle}
        transparent
        animationType="fade"
        onRequestClose={() => { setProtectedToggle(null); setProtectedPassword(""); }}
      >
        <View style={styles.protectedOverlay}>
          <View style={styles.protectedModal}>
            <Text style={styles.protectedTitle}>Conferma Modifica</Text>
            <Text style={styles.protectedSubtitle}>
              {protectedToggle ? `${protectedToggle.value ? "Attivare" : "Disattivare"} "${protectedToggle.label}"` : ""}
            </Text>
            <Text style={styles.protectedDesc}>Inserisci la password admin per confermare</Text>
            <TextInput
              style={styles.protectedInput}
              placeholder="Password admin"
              placeholderTextColor={Colors.textSecondary}
              secureTextEntry
              value={protectedPassword}
              onChangeText={setProtectedPassword}
              autoFocus
            />
            <View style={styles.protectedButtons}>
              <TouchableOpacity
                style={styles.protectedCancel}
                onPress={() => { setProtectedToggle(null); setProtectedPassword(""); }}
              >
                <Text style={styles.protectedCancelText}>Annulla</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.protectedConfirm, !protectedPassword && { opacity: 0.5 }]}
                disabled={!protectedPassword || protectedToggleMutation.isPending}
                onPress={() => {
                  if (!protectedToggle) return;
                  protectedToggleMutation.mutate({
                    key: protectedToggle.key,
                    value: protectedToggle.value ? "true" : "false",
                    adminPassword: protectedPassword,
                  });
                }}
              >
                {protectedToggleMutation.isPending ? (
                  <ActivityIndicator color={Colors.background} size="small" />
                ) : (
                  <Text style={styles.protectedConfirmText}>Conferma</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: 16 },
  synecoCard: {
    backgroundColor: Colors.surface, borderRadius: 12, padding: 16, marginBottom: 16,
    borderWidth: 1, borderColor: Colors.syneco,
  },
  synecoHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  synecoInfo: { flexDirection: "row", alignItems: "center", gap: 10 },
  synecoLabel: { fontFamily: "Inter_600SemiBold", fontSize: 16, color: Colors.text },
  synecoDesc: { fontFamily: "Inter_400Regular", fontSize: 13, color: Colors.textSecondary, marginTop: 8 },
  loadingText: { fontFamily: "Inter_400Regular", fontSize: 14, color: Colors.textSecondary, textAlign: "center", marginTop: 40 },
  emailVerifCard: {
    backgroundColor: Colors.surface, borderRadius: 12, padding: 16, marginBottom: 16,
    borderWidth: 1, borderColor: Colors.accent,
  },
  paidSectionHeader: {
    flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 4, marginTop: 8,
  },
  paidSectionTitle: {
    fontFamily: "Inter_700Bold", fontSize: 20, color: Colors.warning,
  },
  paidSectionDesc: {
    fontFamily: "Inter_400Regular", fontSize: 13, color: Colors.textSecondary, marginBottom: 16,
  },
  paidCard: {
    backgroundColor: Colors.surface, borderRadius: 12, padding: 16, marginBottom: 16,
    borderWidth: 1, borderColor: Colors.warning,
  },
  settingCard: {
    backgroundColor: Colors.surface, borderRadius: 12, padding: 16, marginBottom: 12,
    borderWidth: 1, borderColor: Colors.border,
  },
  settingHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  settingActions: { flexDirection: "row", alignItems: "center", gap: 12 },
  uploadBtn: { padding: 4 },
  settingLabel: { fontFamily: "Inter_600SemiBold", fontSize: 15, color: Colors.text },
  settingValue: { fontFamily: "Inter_400Regular", fontSize: 14, color: Colors.textSecondary },
  input: {
    backgroundColor: Colors.background, borderRadius: 10, padding: 12,
    fontFamily: "Inter_400Regular", fontSize: 14, color: Colors.text,
    borderWidth: 1, borderColor: Colors.border, textAlignVertical: "top" as const,
  },
  editActions: { flexDirection: "row", gap: 12, marginTop: 12, justifyContent: "flex-end" },
  cancelBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8, backgroundColor: Colors.surfaceLight },
  cancelBtnText: { fontFamily: "Inter_500Medium", fontSize: 14, color: Colors.textSecondary },
  saveBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8, backgroundColor: Colors.accent },
  saveBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: Colors.background },
  privacyCard: {
    backgroundColor: Colors.surface, borderRadius: 12, padding: 16, marginTop: 16,
    borderWidth: 1, borderColor: Colors.accent,
  },
  privacyHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  paypalCard: {
    backgroundColor: Colors.surface, borderRadius: 12, padding: 16, marginTop: 16,
    borderWidth: 1, borderColor: "#003087",
  },
  emailSmtpCard: {
    backgroundColor: Colors.surface, borderRadius: 12, padding: 16, marginBottom: 16,
    borderWidth: 1, borderColor: "#4285F4",
  },
  modalOverlay: {
    flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "center", alignItems: "center", padding: 20,
  },
  modalContent: {
    backgroundColor: Colors.surface, borderRadius: 16, padding: 24, width: "100%", maxWidth: 400,
    borderWidth: 1, borderColor: Colors.border,
  },
  modalTitle: {
    fontFamily: "Inter_700Bold", fontSize: 18, color: Colors.text, marginBottom: 4,
  },
  modalSubtitle: {
    fontFamily: "Inter_400Regular", fontSize: 13, color: Colors.textSecondary, marginBottom: 20,
  },
  modalFieldLabel: {
    fontFamily: "Inter_600SemiBold", fontSize: 13, color: Colors.text, marginBottom: 6, marginTop: 12,
  },
  modalInput: {
    backgroundColor: Colors.background, borderRadius: 10, padding: 12,
    fontFamily: "Inter_400Regular", fontSize: 14, color: Colors.text,
    borderWidth: 1, borderColor: Colors.border,
  },
  protectedOverlay: {
    flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "center", alignItems: "center", padding: 24,
  },
  protectedModal: {
    backgroundColor: Colors.surface, borderRadius: 16, padding: 24, width: "100%", maxWidth: 360,
  },
  protectedTitle: {
    fontSize: 18, fontFamily: "Inter_700Bold", color: Colors.text, textAlign: "center", marginBottom: 4,
  },
  protectedSubtitle: {
    fontSize: 14, fontFamily: "Inter_600SemiBold", color: Colors.accent, textAlign: "center", marginBottom: 12,
  },
  protectedDesc: {
    fontSize: 13, fontFamily: "Inter_400Regular", color: Colors.textSecondary, textAlign: "center", marginBottom: 16,
  },
  protectedInput: {
    backgroundColor: Colors.background, borderRadius: 10, padding: 14,
    fontFamily: "Inter_400Regular", fontSize: 15, color: Colors.text,
    borderWidth: 1, borderColor: Colors.border, marginBottom: 20,
  },
  protectedButtons: {
    flexDirection: "row", gap: 12,
  },
  protectedCancel: {
    flex: 1, paddingVertical: 14, borderRadius: 10, alignItems: "center",
    backgroundColor: Colors.background, borderWidth: 1, borderColor: Colors.border,
  },
  protectedCancelText: {
    fontSize: 15, fontFamily: "Inter_600SemiBold", color: Colors.textSecondary,
  },
  protectedConfirm: {
    flex: 1, paddingVertical: 14, borderRadius: 10, alignItems: "center",
    backgroundColor: Colors.accent,
  },
  protectedConfirmText: {
    fontSize: 15, fontFamily: "Inter_600SemiBold", color: Colors.background,
  },
});
