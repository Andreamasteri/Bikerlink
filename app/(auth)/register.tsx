import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Modal,
  FlatList,
  Alert,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/colors";
import { t } from "@/lib/i18n";
import { useAuth } from "@/lib/auth-context";
import { getApiUrl } from "@/lib/query-client";

import { EUROPEAN_COUNTRIES, getRegionsForCountry } from "@/lib/countries-regions";

const PHONE_PREFIXES = [
  { code: "+39", country: "Italia" },
  { code: "+1", country: "USA/Canada" },
  { code: "+44", country: "Regno Unito" },
  { code: "+49", country: "Germania" },
  { code: "+33", country: "Francia" },
  { code: "+34", country: "Spagna" },
  { code: "+41", country: "Svizzera" },
  { code: "+43", country: "Austria" },
  { code: "+32", country: "Belgio" },
  { code: "+31", country: "Paesi Bassi" },
  { code: "+351", country: "Portogallo" },
  { code: "+48", country: "Polonia" },
  { code: "+46", country: "Svezia" },
  { code: "+47", country: "Norvegia" },
  { code: "+45", country: "Danimarca" },
  { code: "+358", country: "Finlandia" },
  { code: "+30", country: "Grecia" },
  { code: "+36", country: "Ungheria" },
  { code: "+420", country: "Rep. Ceca" },
  { code: "+40", country: "Romania" },
  { code: "+385", country: "Croazia" },
  { code: "+386", country: "Slovenia" },
  { code: "+381", country: "Serbia" },
  { code: "+355", country: "Albania" },
  { code: "+90", country: "Turchia" },
  { code: "+7", country: "Russia" },
  { code: "+61", country: "Australia" },
  { code: "+81", country: "Giappone" },
  { code: "+86", country: "Cina" },
  { code: "+55", country: "Brasile" },
  { code: "+52", country: "Messico" },
  { code: "+91", country: "India" },
];

const EULA_TEXT = `TERMINI E CONDIZIONI D'USO - BikerLink

1. ACCETTAZIONE DEI TERMINI
Utilizzando l'app BikerLink, accetti integralmente i presenti termini e condizioni.

2. DESCRIZIONE DEL SERVIZIO
BikerLink è una piattaforma che connette motociclisti (biker) e passeggeri (zavorrine) per condividere esperienze di viaggio in moto.

3. REGISTRAZIONE E ACCOUNT
- L'utente deve fornire informazioni veritiere durante la registrazione
- È responsabile della sicurezza delle proprie credenziali
- Deve avere almeno 18 anni per utilizzare il servizio

4. COMPORTAMENTO DEGLI UTENTI
- È vietato qualsiasi comportamento offensivo, molesto o discriminatorio
- È vietato condividere contenuti inappropriati
- Gli utenti devono rispettare il codice della strada

5. PRIVACY E DATI PERSONALI
- I dati personali sono trattati nel rispetto del GDPR
- La posizione GPS viene utilizzata solo per le funzionalità dell'app
- Le foto caricate sono soggette a moderazione

6. RESPONSABILITÀ
- BikerLink non è responsabile per incidenti durante i viaggi
- Ogni utente è responsabile della propria sicurezza
- L'uso di casco e protezioni è obbligatorio

7. SPONSOR E PUBBLICITÀ
- L'app contiene contenuti sponsorizzati da Syneco Lubrificanti
- I contenuti pubblicitari sono chiaramente identificati

8. MODIFICHE AI TERMINI
BikerLink si riserva il diritto di modificare i presenti termini in qualsiasi momento.

9. CONTATTI
Per domande o segnalazioni: support@bikerlink.app`;

export default function RegisterScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { registerMutation } = useAuth();
  const params = useLocalSearchParams<{ inviteCode?: string }>();

  const { data: emailVerifData } = useQuery<{ enabled: boolean }>({
    queryKey: ["/api/settings/email-verification"],
  });
  const emailVerifEnabled = emailVerifData?.enabled === true;

  const [step, setStep] = useState(1);
  const [error, setError] = useState("");

  const [userType, setUserType] = useState<"biker" | "zavorrina" | "coppia" | "">("");
  const [sex, setSex] = useState<"M" | "F" | "">("");
  const [coupleSexConfig, setCoupleSexConfig] = useState<"M+M" | "M+F" | "F+F" | "">("");
  const [nickname, setNickname] = useState("");
  const [email, setEmail] = useState("");
  const [phonePrefix, setPhonePrefix] = useState("+39");
  const [phone, setPhone] = useState("");
  const [showPrefixModal, setShowPrefixModal] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [birthYear, setBirthYear] = useState("");
  const [country, setCountry] = useState("");
  const [showCountries, setShowCountries] = useState(false);
  const [region, setRegion] = useState("");
  const [showRegions, setShowRegions] = useState(false);
  const [eulaAccepted, setEulaAccepted] = useState(false);
  const [privacyAccepted, setPrivacyAccepted] = useState(false);

  const [inviteCode, setInviteCode] = useState(params.inviteCode ?? "");
  const [invitePreview, setInvitePreview] = useState<{ code: string; label: string | null; giftMessage: string | null } | null>(null);
  const [invitePreviewLoading, setInvitePreviewLoading] = useState(false);
  const [showGiftModal, setShowGiftModal] = useState(false);
  const [giftModalMessage, setGiftModalMessage] = useState("");
  const [giftModalCode, setGiftModalCode] = useState("");
  const [pendingNavigation, setPendingNavigation] = useState<"tabs" | "verify" | null>(null);
  const [verifyEmail, setVerifyEmail] = useState("");
  const inviteDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (inviteDebounceRef.current) clearTimeout(inviteDebounceRef.current);
    const code = inviteCode.trim().toUpperCase();
    if (!code) { setInvitePreview(null); return; }
    inviteDebounceRef.current = setTimeout(async () => {
      setInvitePreviewLoading(true);
      try {
        const url = new URL(`/api/invitations/preview/${encodeURIComponent(code)}`, getApiUrl());
        const res = await fetch(url.toString());
        if (res.ok) {
          const data = await res.json();
          setInvitePreview(data);
        } else {
          setInvitePreview(null);
        }
      } catch {
        setInvitePreview(null);
      } finally {
        setInvitePreviewLoading(false);
      }
    }, 600);
    return () => { if (inviteDebounceRef.current) clearTimeout(inviteDebounceRef.current); };
  }, [inviteCode]);

  const handleGiftModalClose = () => {
    setShowGiftModal(false);
    if (pendingNavigation === "verify") {
      router.replace({ pathname: "/(auth)/verify-email", params: { email: verifyEmail } });
    } else {
      router.replace("/(tabs)");
    }
    setPendingNavigation(null);
  };

  const totalSteps = 4;

  const validateStep = (): boolean => {
    setError("");
    if (step === 1) {
      if (!userType) {
        setError("Seleziona il tipo di utente");
        return false;
      }
    } else if (step === 2) {
      if (userType === "coppia") {
        if (!coupleSexConfig) {
          setError("Seleziona la configurazione della coppia");
          return false;
        }
      } else {
        if (!sex) {
          setError("Seleziona il sesso");
          return false;
        }
      }
    } else if (step === 3) {
      if (!nickname.trim()) { setError("Inserisci un nickname"); return false; }
      if (nickname.trim().length < 3) { setError("Il nickname deve avere almeno 3 caratteri"); return false; }
      if (!email.trim()) { setError("Inserisci la tua email"); return false; }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setError(t("validation.emailInvalid")); return false; }
      if (!password) { setError("Inserisci una password"); return false; }
      if (password.length < 8) { setError(t("validation.passwordMin")); return false; }
      if (!/[A-Z]/.test(password)) { setError(t("validation.passwordUpper")); return false; }
      if (!/[a-z]/.test(password)) { setError(t("validation.passwordLower")); return false; }
      if (!/[0-9]/.test(password)) { setError(t("validation.passwordNumber")); return false; }
      if (password !== confirmPassword) { setError("Le password non coincidono"); return false; }
    } else if (step === 4) {
      if (!eulaAccepted) {
        setError("Devi accettare i termini e le condizioni");
        return false;
      }
      if (!privacyAccepted) {
        setError(t("register.step4.privacyRequired"));
        return false;
      }
    }
    return true;
  };

  const handleNext = () => {
    if (validateStep()) {
      if (step < totalSteps) {
        setStep(step + 1);
        setError("");
      } else {
        handleRegister();
      }
    }
  };

  const handleBack = () => {
    if (step > 1) {
      setStep(step - 1);
      setError("");
    } else {
      router.back();
    }
  };

  const handleRegister = () => {
    setError("");

    if (birthYear) {
      const currentYear = new Date().getFullYear();
      const age = currentYear - parseInt(birthYear, 10);
      if (age < 18) {
        Alert.alert("Attenzione", "Devi avere almeno 18 anni per registrarti");
        return;
      }
    }

    const data: any = {
      nickname: nickname.trim(),
      email: email.trim().toLowerCase(),
      password,
      userType,
      eulaAccepted: true as const,
    };
    if (phone.trim()) data.phone = phonePrefix + phone.trim();
    if (userType === "coppia" && coupleSexConfig) {
      data.coupleSexConfig = coupleSexConfig;
    } else if (sex) {
      data.sex = sex;
    }
    if (birthYear) data.birthYear = parseInt(birthYear, 10);
    if (country) data.country = country;
    if (region) data.region = region;
    if (inviteCode.trim()) data.invitationCode = inviteCode.trim().toUpperCase();

    registerMutation.mutate(data, {
      onSuccess: (response: any) => {
        if (response?.giftMessage) {
          setGiftModalMessage(response.giftMessage);
          setGiftModalCode(inviteCode.trim().toUpperCase());
          if (response?.requiresEmailVerification) {
            setPendingNavigation("verify");
            setVerifyEmail(data.email);
          } else {
            setPendingNavigation("tabs");
          }
          setShowGiftModal(true);
        } else if (response?.requiresEmailVerification) {
          router.replace({ pathname: "/(auth)/verify-email", params: { email: data.email } });
        } else {
          router.replace("/(tabs)");
        }
      },
      onError: (err: any) => {
        const msg = err?.message || "Errore durante la registrazione";
        const cleaned = msg.replace(/^\d+:\s*/, "");
        try {
          const parsed = JSON.parse(cleaned);
          setError(parsed.message || cleaned);
        } catch {
          setError(cleaned);
        }
      },
    });
  };

  const renderStepIndicator = () => (
    <View style={styles.stepIndicator}>
      {Array.from({ length: totalSteps }, (_, i) => (
        <View
          key={i}
          style={[
            styles.stepDot,
            i + 1 <= step ? styles.stepDotActive : null,
          ]}
        />
      ))}
    </View>
  );

  const renderStep1 = () => (
    <View style={styles.stepContent}>
      <Text style={styles.stepTitle}>{t("register.step1.title")}</Text>
      <Text style={styles.stepSubtitle}>Seleziona il tuo profilo</Text>

      <View style={styles.typeGrid}>
        <TouchableOpacity
          style={[styles.typeCard, userType === "biker" && styles.typeCardSelected]}
          onPress={() => setUserType("biker")}
          testID="type-biker"
        >
          <Ionicons
            name="bicycle"
            size={48}
            color={userType === "biker" ? Colors.maleIcon : Colors.textSecondary}
          />
          <Text style={[styles.typeLabel, userType === "biker" && { color: Colors.maleIcon }]}>
            {t("register.step1.biker")}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.typeCard, userType === "zavorrina" && styles.typeCardSelected]}
          onPress={() => setUserType("zavorrina")}
          testID="type-zavorrina"
        >
          <Ionicons
            name="person"
            size={48}
            color={userType === "zavorrina" ? Colors.femaleIcon : Colors.textSecondary}
          />
          <Text style={[styles.typeLabel, userType === "zavorrina" && { color: Colors.femaleIcon }]}>
            {t("register.step1.zavorrina")}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.typeCard, userType === "coppia" && styles.typeCardSelected]}
          onPress={() => setUserType("coppia")}
          testID="type-coppia"
        >
          <Ionicons
            name="people"
            size={48}
            color={userType === "coppia" ? Colors.accent : Colors.textSecondary}
          />
          <Text style={[styles.typeLabel, userType === "coppia" && { color: Colors.accent }]}>
            {t("register.step1.coppia")}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderStep2 = () => (
    <View style={styles.stepContent}>
      <Text style={styles.stepTitle}>{t("register.step2.title")}</Text>

      {userType === "coppia" ? (
        <>
          <Text style={styles.stepSubtitle}>{t("register.step2.coupleConfig")}</Text>
          <View style={styles.sexGrid}>
            {(["M+M", "M+F", "F+F"] as const).map((config) => (
              <TouchableOpacity
                key={config}
                style={[styles.sexCard, coupleSexConfig === config && styles.sexCardSelected]}
                onPress={() => setCoupleSexConfig(config)}
                testID={`couple-${config}`}
              >
                <View style={styles.coupleIcons}>
                  <Ionicons
                    name={config.startsWith("M") ? "male" : "female"}
                    size={28}
                    color={config.startsWith("M") ? Colors.maleIcon : Colors.femaleIcon}
                  />
                  <Text style={styles.plusSign}>+</Text>
                  <Ionicons
                    name={config.endsWith("M") ? "male" : "female"}
                    size={28}
                    color={config.endsWith("M") ? Colors.maleIcon : Colors.femaleIcon}
                  />
                </View>
                <Text style={[styles.sexLabel, coupleSexConfig === config && styles.sexLabelSelected]}>
                  {config}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </>
      ) : (
        <View style={styles.sexGrid}>
          <TouchableOpacity
            style={[styles.sexCard, styles.sexCardLarge, sex === "M" && styles.sexCardSelected]}
            onPress={() => setSex("M")}
            testID="sex-male"
          >
            <Ionicons name="male" size={48} color={sex === "M" ? Colors.maleIcon : Colors.textSecondary} />
            <Text style={[styles.sexLabel, sex === "M" && { color: Colors.maleIcon }]}>
              {t("register.step2.male")}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.sexCard, styles.sexCardLarge, sex === "F" && styles.sexCardSelected]}
            onPress={() => setSex("F")}
            testID="sex-female"
          >
            <Ionicons name="female" size={48} color={sex === "F" ? Colors.femaleIcon : Colors.textSecondary} />
            <Text style={[styles.sexLabel, sex === "F" && { color: Colors.femaleIcon }]}>
              {t("register.step2.female")}
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );

  const renderStep3 = () => (
    <View style={styles.stepContent}>
      <Text style={styles.stepTitle}>{t("register.step3.title")}</Text>

      <View style={styles.inputWrapper}>
        <Ionicons name="at" size={20} color={Colors.textSecondary} style={styles.inputIcon} />
        <TextInput
          style={styles.input}
          placeholder={t("auth.nickname")}
          placeholderTextColor={Colors.textSecondary}
          value={nickname}
          onChangeText={setNickname}
          autoCapitalize="none"
          autoCorrect={false}
          testID="reg-nickname"
        />
      </View>

      <View style={styles.inputWrapper}>
        <Ionicons name="mail-outline" size={20} color={Colors.textSecondary} style={styles.inputIcon} />
        <TextInput
          style={styles.input}
          placeholder={t("auth.email")}
          placeholderTextColor={Colors.textSecondary}
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          testID="reg-email"
        />
        {emailVerifEnabled && (
          <TouchableOpacity
            onPress={() => Alert.alert(
              "Verifica Email",
              "La verifica dell'email è una sicurezza che il tuo indirizzo sia associato correttamente al tuo account.\n\nTi servirà in caso di reset della password."
            )}
            style={{ paddingHorizontal: 8 }}
          >
            <Ionicons name="information-circle-outline" size={20} color={Colors.accent} />
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.phoneRow}>
        <TouchableOpacity
          style={styles.prefixButton}
          onPress={() => setShowPrefixModal(true)}
          testID="reg-phone-prefix"
        >
          <Text style={styles.prefixText}>{phonePrefix}</Text>
          <Ionicons name="chevron-down" size={14} color={Colors.textSecondary} />
        </TouchableOpacity>
        <View style={styles.phoneInputWrapper}>
          <TextInput
            style={styles.phoneInput}
            placeholder={`${t("auth.phone")} (opzionale)`}
            placeholderTextColor={Colors.textSecondary}
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
            testID="reg-phone"
          />
        </View>
      </View>

      <View style={styles.inputWrapper}>
        <Ionicons name="lock-closed-outline" size={20} color={Colors.textSecondary} style={styles.inputIcon} />
        <TextInput
          style={[styles.input, styles.passwordInput]}
          placeholder={t("auth.password")}
          placeholderTextColor={Colors.textSecondary}
          value={password}
          onChangeText={setPassword}
          secureTextEntry={!showPassword}
          autoCapitalize="none"
          testID="reg-password"
        />
        <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={styles.eyeButton}>
          <Ionicons
            name={showPassword ? "eye-off-outline" : "eye-outline"}
            size={22}
            color={Colors.textSecondary}
          />
        </TouchableOpacity>
      </View>

      <View style={styles.inputWrapper}>
        <Ionicons name="lock-closed-outline" size={20} color={Colors.textSecondary} style={styles.inputIcon} />
        <TextInput
          style={[styles.input, styles.passwordInput]}
          placeholder="Conferma Password"
          placeholderTextColor={Colors.textSecondary}
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          secureTextEntry={!showConfirmPassword}
          autoCapitalize="none"
          testID="reg-confirm-password"
        />
        <TouchableOpacity onPress={() => setShowConfirmPassword(!showConfirmPassword)} style={styles.eyeButton}>
          <Ionicons
            name={showConfirmPassword ? "eye-off-outline" : "eye-outline"}
            size={22}
            color={Colors.textSecondary}
          />
        </TouchableOpacity>
      </View>

      <View style={styles.inputWrapper}>
        <Ionicons name="calendar-outline" size={20} color={Colors.textSecondary} style={styles.inputIcon} />
        <TextInput
          style={styles.input}
          placeholder={`${t("auth.birthYear")} (opzionale)`}
          placeholderTextColor={Colors.textSecondary}
          value={birthYear}
          onChangeText={setBirthYear}
          keyboardType="number-pad"
          maxLength={4}
          testID="reg-birthyear"
        />
      </View>

      <TouchableOpacity
        style={styles.inputWrapper}
        onPress={() => { setShowCountries(!showCountries); setShowRegions(false); }}
        testID="reg-country-toggle"
      >
        <Ionicons name="globe-outline" size={20} color={Colors.textSecondary} style={styles.inputIcon} />
        <Text style={[styles.input, { lineHeight: 52 }, !country && { color: Colors.textSecondary }]}>
          {country ? `${EUROPEAN_COUNTRIES.find(c => c.code === country)?.flag} ${EUROPEAN_COUNTRIES.find(c => c.code === country)?.name}` : "Paese (opzionale)"}
        </Text>
        <Ionicons name={showCountries ? "chevron-up" : "chevron-down"} size={20} color={Colors.textSecondary} />
      </TouchableOpacity>

      {showCountries && (
        <View style={styles.regionList}>
          <ScrollView style={styles.regionScroll} nestedScrollEnabled>
            {EUROPEAN_COUNTRIES.map((c) => (
              <TouchableOpacity
                key={c.code}
                style={[styles.regionItem, country === c.code && styles.regionItemSelected]}
                onPress={() => { setCountry(c.code); setRegion(""); setShowCountries(false); }}
              >
                <Text style={[styles.regionText, country === c.code && styles.regionTextSelected]}>{c.flag} {c.name}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      {country && (
        <>
          <TouchableOpacity
            style={styles.inputWrapper}
            onPress={() => { setShowRegions(!showRegions); setShowCountries(false); }}
            testID="reg-region-toggle"
          >
            <Ionicons name="location-outline" size={20} color={Colors.textSecondary} style={styles.inputIcon} />
            <Text style={[styles.input, { lineHeight: 52 }, !region && { color: Colors.textSecondary }]}>
              {region || `${t("auth.region")} (opzionale)`}
            </Text>
            <Ionicons name={showRegions ? "chevron-up" : "chevron-down"} size={20} color={Colors.textSecondary} />
          </TouchableOpacity>

          {showRegions && (
            <View style={styles.regionList}>
              <ScrollView style={styles.regionScroll} nestedScrollEnabled>
                {getRegionsForCountry(country).map((r) => (
                  <TouchableOpacity
                    key={r.name}
                    style={[styles.regionItem, region === r.name && styles.regionItemSelected]}
                    onPress={() => { setRegion(r.name); setShowRegions(false); }}
                  >
                    <Text style={[styles.regionText, region === r.name && styles.regionTextSelected]}>{r.name}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )}
        </>
      )}

      <View style={styles.inviteSection}>
        <View style={styles.inputWrapper}>
          <Ionicons name="gift-outline" size={20} color={Colors.accent} style={styles.inputIcon} />
          <TextInput
            style={styles.input}
            placeholder="Codice invito (opzionale)"
            placeholderTextColor={Colors.textSecondary}
            value={inviteCode}
            onChangeText={(v) => setInviteCode(v.toUpperCase())}
            autoCapitalize="characters"
            autoCorrect={false}
            testID="reg-invite-code"
          />
          {invitePreviewLoading && <ActivityIndicator size="small" color={Colors.accent} style={{ marginRight: 8 }} />}
          {!invitePreviewLoading && inviteCode.trim().length > 0 && (
            <Ionicons
              name={invitePreview ? "checkmark-circle" : "close-circle"}
              size={20}
              color={invitePreview ? "#4CAF50" : Colors.textSecondary}
              style={{ marginRight: 8 }}
            />
          )}
        </View>

        {invitePreview && (
          <View style={styles.inviteBanner}>
            <Ionicons name="gift" size={28} color={Colors.accent} />
            <View style={styles.inviteBannerText}>
              <Text style={styles.inviteBannerTitle}>Omaggio disponibile!</Text>
              {invitePreview.label && <Text style={styles.inviteBannerLabel}>{invitePreview.label}</Text>}
              {invitePreview.giftMessage && (
                <Text style={styles.inviteBannerMessage} numberOfLines={3}>{invitePreview.giftMessage}</Text>
              )}
            </View>
          </View>
        )}
      </View>

      <Modal
        visible={showPrefixModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowPrefixModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Prefisso internazionale</Text>
              <TouchableOpacity onPress={() => setShowPrefixModal(false)}>
                <Ionicons name="close" size={24} color={Colors.text} />
              </TouchableOpacity>
            </View>
            <FlatList
              data={PHONE_PREFIXES}
              keyExtractor={(item) => item.code}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[
                    styles.prefixItem,
                    phonePrefix === item.code && styles.prefixItemSelected,
                  ]}
                  onPress={() => {
                    setPhonePrefix(item.code);
                    setShowPrefixModal(false);
                  }}
                >
                  <Text style={[styles.prefixItemCode, phonePrefix === item.code && styles.prefixItemCodeSelected]}>
                    {item.code}
                  </Text>
                  <Text style={[styles.prefixItemCountry, phonePrefix === item.code && styles.prefixItemCountrySelected]}>
                    {item.country}
                  </Text>
                  {phonePrefix === item.code && (
                    <Ionicons name="checkmark" size={20} color={Colors.accent} />
                  )}
                </TouchableOpacity>
              )}
            />
          </View>
        </View>
      </Modal>
    </View>
  );

  const renderStep4 = () => (
    <View style={styles.stepContent}>
      <Text style={styles.stepTitle}>{t("register.step4.title")}</Text>

      <View style={styles.eulaContainer}>
        <ScrollView style={styles.eulaScroll} nestedScrollEnabled>
          <Text style={styles.eulaText}>{EULA_TEXT}</Text>
        </ScrollView>
      </View>

      <TouchableOpacity
        style={styles.checkboxRow}
        onPress={() => setEulaAccepted(!eulaAccepted)}
        testID="eula-checkbox"
      >
        <View style={[styles.checkbox, eulaAccepted && styles.checkboxChecked]}>
          {eulaAccepted && <Ionicons name="checkmark" size={16} color={Colors.background} />}
        </View>
        <Text style={styles.checkboxLabel}>{t("register.step4.accept")}</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.checkboxRow}
        onPress={() => setPrivacyAccepted(!privacyAccepted)}
        testID="privacy-checkbox"
      >
        <View style={[styles.checkbox, privacyAccepted && styles.checkboxChecked]}>
          {privacyAccepted && <Ionicons name="checkmark" size={16} color={Colors.background} />}
        </View>
        <Text style={styles.checkboxLabel}>{t("register.step4.acceptPrivacy")}</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={() => router.push("/privacy-policy")} style={styles.privacyLinkRow}>
        <Ionicons name="document-text-outline" size={14} color={Colors.accent} />
        <Text style={styles.privacyLink}>Privacy Policy</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView
        contentContainerStyle={[
          styles.container,
          {
            paddingTop: Platform.OS === "web" ? 67 + 20 : insets.top + 20,
            paddingBottom: Platform.OS === "web" ? 34 + 20 : insets.bottom + 20,
          },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <TouchableOpacity onPress={handleBack} style={styles.backButton} testID="register-back">
          <Ionicons name="arrow-back" size={24} color={Colors.text} />
        </TouchableOpacity>

        {renderStepIndicator()}

        {error ? (
          <View style={styles.errorBanner}>
            <Ionicons name="alert-circle" size={18} color={Colors.error} />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        {step === 1 && renderStep1()}
        {step === 2 && renderStep2()}
        {step === 3 && renderStep3()}
        {step === 4 && renderStep4()}

        <TouchableOpacity
          style={[styles.nextButton, registerMutation.isPending && styles.nextButtonDisabled]}
          onPress={handleNext}
          disabled={registerMutation.isPending}
          testID="register-next"
        >
          {registerMutation.isPending ? (
            <ActivityIndicator color={Colors.background} />
          ) : (
            <Text style={styles.nextButtonText}>
              {step === totalSteps ? t("register.complete") : t("register.next")}
            </Text>
          )}
        </TouchableOpacity>

        {step === 1 && (
          <View style={styles.loginRow}>
            <Text style={styles.loginPrompt}>{t("auth.hasAccount")}</Text>
            <TouchableOpacity onPress={() => router.back()} testID="go-login">
              <Text style={styles.loginLink}>{t("auth.login")}</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>

      <Modal
        visible={showGiftModal}
        transparent
        animationType="fade"
        onRequestClose={() => {}}
      >
        <View style={styles.giftModalOverlay}>
          <View style={styles.giftModalCard}>
            <Ionicons name="gift" size={56} color={Colors.accent} style={{ marginBottom: 16 }} />
            <Text style={styles.giftModalTitle}>🎁 Omaggio sbloccato!</Text>
            <Text style={styles.giftModalMessage}>{giftModalMessage}</Text>
            <View style={styles.giftModalCodeBox}>
              <Text style={styles.giftModalCodeLabel}>Il tuo codice</Text>
              <Text style={styles.giftModalCode}>{giftModalCode}</Text>
            </View>
            <TouchableOpacity style={styles.giftModalButton} onPress={handleGiftModalClose}>
              <Text style={styles.giftModalButtonText}>Ho capito!</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  container: {
    flexGrow: 1,
    paddingHorizontal: 28,
  },
  backButton: {
    alignSelf: "flex-start",
    padding: 4,
    marginBottom: 8,
  },
  stepIndicator: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 8,
    marginBottom: 24,
  },
  stepDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.border,
  },
  stepDotActive: {
    backgroundColor: Colors.accent,
    width: 28,
  },
  stepContent: {
    gap: 16,
    marginBottom: 24,
  },
  stepTitle: {
    fontSize: 26,
    fontFamily: "Inter_700Bold",
    color: Colors.text,
    textAlign: "center",
  },
  stepSubtitle: {
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
    textAlign: "center",
  },
  typeGrid: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 14,
    marginTop: 12,
  },
  typeCard: {
    width: 100,
    height: 120,
    backgroundColor: Colors.surface,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: Colors.border,
    gap: 8,
  },
  typeCardSelected: {
    borderColor: Colors.accent,
    backgroundColor: Colors.surfaceLight,
  },
  typeLabel: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    color: Colors.textSecondary,
  },
  sexGrid: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 14,
    marginTop: 12,
  },
  sexCard: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: Colors.border,
    paddingVertical: 16,
    paddingHorizontal: 20,
    gap: 8,
  },
  sexCardLarge: {
    width: 130,
    height: 130,
  },
  sexCardSelected: {
    borderColor: Colors.accent,
    backgroundColor: Colors.surfaceLight,
  },
  sexLabel: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: Colors.textSecondary,
  },
  sexLabelSelected: {
    color: Colors.accent,
  },
  coupleIcons: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  plusSign: {
    color: Colors.textSecondary,
    fontSize: 18,
    fontFamily: "Inter_700Bold",
  },
  inputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 14,
    height: 52,
  },
  inputIcon: {
    marginRight: 10,
  },
  input: {
    flex: 1,
    color: Colors.text,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    height: "100%",
  },
  passwordInput: {
    paddingRight: 40,
  },
  eyeButton: {
    position: "absolute",
    right: 14,
    height: "100%",
    justifyContent: "center",
  },
  phoneRow: {
    flexDirection: "row",
    gap: 8,
  },
  prefixButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 12,
    height: 52,
    gap: 4,
  },
  prefixText: {
    color: Colors.text,
    fontSize: 15,
    fontFamily: "Inter_500Medium",
  },
  phoneInputWrapper: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 14,
    height: 52,
  },
  phoneInput: {
    flex: 1,
    color: Colors.text,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    height: "100%",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: "60%",
    paddingBottom: Platform.OS === "web" ? 34 : 0,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  modalTitle: {
    fontSize: 18,
    fontFamily: "Inter_600SemiBold",
    color: Colors.text,
  },
  prefixItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  prefixItemSelected: {
    backgroundColor: Colors.surfaceLight,
  },
  prefixItemCode: {
    width: 60,
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    color: Colors.text,
  },
  prefixItemCodeSelected: {
    color: Colors.accent,
  },
  prefixItemCountry: {
    flex: 1,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
  },
  prefixItemCountrySelected: {
    color: Colors.accent,
  },
  regionList: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    maxHeight: 200,
    overflow: "hidden",
  },
  regionScroll: {
    paddingVertical: 4,
  },
  regionItem: {
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  regionItemSelected: {
    backgroundColor: Colors.surfaceLight,
  },
  regionText: {
    color: Colors.text,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
  },
  regionTextSelected: {
    color: Colors.accent,
    fontFamily: "Inter_600SemiBold",
  },
  eulaContainer: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    height: 280,
    overflow: "hidden",
  },
  eulaScroll: {
    padding: 16,
  },
  eulaText: {
    color: Colors.textSecondary,
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    lineHeight: 20,
  },
  checkboxRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 4,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: Colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxChecked: {
    backgroundColor: Colors.accent,
    borderColor: Colors.accent,
  },
  checkboxLabel: {
    color: Colors.text,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    flex: 1,
  },
  errorBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(229, 57, 53, 0.15)",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    gap: 8,
    marginBottom: 16,
  },
  errorText: {
    color: Colors.error,
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    flex: 1,
  },
  nextButton: {
    backgroundColor: Colors.accent,
    borderRadius: 12,
    height: 52,
    alignItems: "center",
    justifyContent: "center",
  },
  nextButtonDisabled: {
    opacity: 0.7,
  },
  nextButtonText: {
    color: Colors.background,
    fontSize: 17,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.5,
  },
  loginRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 6,
    marginTop: 16,
  },
  loginPrompt: {
    color: Colors.textSecondary,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
  },
  loginLink: {
    color: Colors.accent,
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
  privacyLink: {
    marginTop: 0,
    fontSize: 12,
    color: Colors.accent,
    textDecorationLine: "underline" as const,
  },
  privacyLinkRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 4,
    marginTop: 6,
    marginLeft: 36,
  },
  inviteSection: {
    marginTop: 8,
    gap: 8,
  },
  inviteBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: "rgba(255, 152, 0, 0.12)",
    borderWidth: 1,
    borderColor: Colors.accent,
    borderRadius: 12,
    padding: 14,
    gap: 12,
  },
  inviteBannerText: {
    flex: 1,
    gap: 3,
  },
  inviteBannerTitle: {
    color: Colors.accent,
    fontSize: 15,
    fontFamily: "Inter_700Bold",
  },
  inviteBannerLabel: {
    color: Colors.textSecondary,
    fontSize: 12,
    fontFamily: "Inter_500Medium",
  },
  inviteBannerMessage: {
    color: Colors.text,
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    lineHeight: 18,
  },
  giftModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  giftModalCard: {
    backgroundColor: Colors.surface,
    borderRadius: 20,
    padding: 32,
    alignItems: "center",
    width: "100%",
    maxWidth: 360,
  },
  giftModalTitle: {
    fontSize: 22,
    fontFamily: "Inter_700Bold",
    color: Colors.text,
    marginBottom: 12,
    textAlign: "center",
  },
  giftModalMessage: {
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 24,
  },
  giftModalCodeBox: {
    backgroundColor: Colors.background,
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 24,
    alignItems: "center",
    marginBottom: 28,
    width: "100%",
    borderWidth: 1,
    borderColor: Colors.accent,
  },
  giftModalCodeLabel: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    color: Colors.textSecondary,
    textTransform: "uppercase" as const,
    letterSpacing: 1.5,
    marginBottom: 6,
  },
  giftModalCode: {
    fontSize: 36,
    fontFamily: "Inter_700Bold",
    color: Colors.accent,
    letterSpacing: 4,
  },
  giftModalButton: {
    backgroundColor: Colors.accent,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 40,
  },
  giftModalButtonText: {
    color: Colors.background,
    fontSize: 17,
    fontFamily: "Inter_600SemiBold",
  },
});
