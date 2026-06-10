import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
} from "react-native";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/colors";
import { t } from "@/lib/i18n";
import { useAuth } from "@/lib/auth-context";
import { getApiUrl } from "@/lib/query-client";

import { StepUserType } from "@/components/register/StepUserType";
import { StepGender } from "@/components/register/StepGender";
import { StepBasicInfo } from "@/components/register/StepBasicInfo";
import { StepLegal } from "@/components/register/StepLegal";
import { PrivacyNoticeModal } from "@/components/register/PrivacyNoticeModal";
import { EmailConfirmModal } from "@/components/register/EmailConfirmModal";
import { GiftModal } from "@/components/register/GiftModal";
import { StepIndicator } from "@/components/register/StepIndicator";
import { ErrorBanner } from "@/components/register/ErrorBanner";
import { NavigationButtons } from "@/components/register/NavigationButtons";
import { LoginPrompt } from "@/components/register/LoginPrompt";
import {
  PHONE_PREFIXES,
  PHONE_PREFIX_TO_COUNTRY,
  EULA_TEXTS,
} from "@/constants/register";
import { SupportContactModal } from "@/components/SupportContactModal";

export default function RegisterScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { registerMutation } = useAuth();
  const params = useLocalSearchParams<{ inviteCode?: string }>();

  useQuery<{ enabled: boolean }>({
    queryKey: ["/api/settings/email-verification"],
  });
  const { data: phoneFieldData } = useQuery<{ enabled: boolean }>({
    queryKey: ["/api/settings/phone-field-enabled"],
  });
  const phoneFieldEnabled = phoneFieldData?.enabled === true;

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
  const [eulaAccepted, setEulaAccepted] = useState(true);
  const [privacyAccepted, setPrivacyAccepted] = useState(true);
  const [marketingAccepted, setMarketingAccepted] = useState(true);

  const [showPrivacyModal, setShowPrivacyModal] = useState(false);
  const [privacyModalSeen, setPrivacyModalSeen] = useState(false);
  const [showEmailConfirm, setShowEmailConfirm] = useState(false);
  const [emailConfirmed, setEmailConfirmed] = useState(false);
  const [expandedContinents, setExpandedContinents] = useState<Set<string>>(() => {
    return new Set<string>();
  });

  const [showSupportModal, setShowSupportModal] = useState(false);
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
    if (step === 3 && !privacyModalSeen) {
      setShowPrivacyModal(true);
      setPrivacyModalSeen(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

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
        setError(t("auth.selectUserType"));
        return false;
      }
    } else if (step === 2) {
      if (userType === "coppia") {
        if (!coupleSexConfig) {
          setError(t("auth.selectCoupleConfig"));
          return false;
        }
      } else {
        if (!sex) {
          setError(t("auth.selectGender"));
          return false;
        }
      }
    } else if (step === 3) {
      if (!nickname.trim()) { setError(t("auth.enterNickname")); return false; }
      if (nickname.trim().length < 3) { setError("Il nickname deve avere almeno 3 caratteri"); return false; }
      if (!email.trim()) { setError(t("auth.enterEmail")); return false; }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setError(t("validation.emailInvalid")); return false; }
      if (!password) { setError(t("auth.enterPassword")); return false; }
      if (password.length < 8) { setError(t("validation.passwordMin")); return false; }
      if (!/[A-Z]/.test(password)) { setError(t("validation.passwordUpper")); return false; }
      if (!/[a-z]/.test(password)) { setError(t("validation.passwordLower")); return false; }
      if (!/[0-9]/.test(password)) { setError(t("validation.passwordNumber")); return false; }
      if (password !== confirmPassword) { setError("Le password non coincidono"); return false; }
      if (!country) { setError("Seleziona il tuo paese"); return false; }
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

    const data = {
      nickname: nickname.trim(),
      email: email.trim().toLowerCase(),
      password,
      userType: userType as "biker" | "zavorrina" | "coppia",
      eulaAccepted: true as const,
      phone: phone.trim() ? phonePrefix + phone.trim() : undefined,
      coupleSexConfig: (userType === "coppia" && coupleSexConfig) ? coupleSexConfig as "M+M" | "M+F" | "F+F" : undefined,
      sex: (userType !== "coppia" && sex) ? sex as "M" | "F" : undefined,
      birthYear: birthYear ? parseInt(birthYear, 10) : undefined,
      country: country || PHONE_PREFIX_TO_COUNTRY[phonePrefix] || "IT",
      region: region || undefined,
      invitationCode: inviteCode.trim() ? inviteCode.trim().toUpperCase() : undefined,
      marketingAccepted,
    };

    registerMutation.mutate(data, {
      onSuccess: (response: unknown) => {
        const res = response as { giftMessage?: string; requiresEmailVerification?: boolean } | null;
        if (res?.giftMessage) {
          setGiftModalMessage(res.giftMessage);
          setGiftModalCode(inviteCode.trim().toUpperCase());
          if (res?.requiresEmailVerification) {
            setPendingNavigation("verify");
            setVerifyEmail(data.email);
          } else {
            setPendingNavigation("tabs");
          }
          setShowGiftModal(true);
        } else if (res?.requiresEmailVerification) {
          router.replace({ pathname: "/(auth)/verify-email", params: { email: data.email } });
        } else {
          router.replace("/(tabs)");
        }
      },
      onError: (err: Error) => {
        const msg = err.message || t("auth.registerError");
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

  return (
    <View style={styles.flex}>
      <KeyboardAwareScrollViewCompat
        contentContainerStyle={[
          styles.container,
          {
            paddingTop: insets.top + 20,
            paddingBottom: insets.bottom + 20,
          },
        ]}
        keyboardShouldPersistTaps="handled"
        bottomOffset={24}
      >
        <TouchableOpacity onPress={handleBack} style={styles.backButton} testID="register-back">
          <Ionicons name="arrow-back" size={24} color={Colors.text} />
        </TouchableOpacity>

        <StepIndicator currentStep={step} totalSteps={totalSteps} />

        {step !== 3 && <ErrorBanner error={error} />}

        {step === 1 && (
          <StepUserType
            userType={userType}
            setUserType={setUserType}
          />
        )}
        {step === 2 && (
          <StepGender
            userType={userType}
            sex={sex}
            setSex={setSex}
            coupleSexConfig={coupleSexConfig}
            setCoupleSexConfig={setCoupleSexConfig}
          />
        )}
        {step === 3 && (
          <StepBasicInfo
            nickname={nickname}
            setNickname={setNickname}
            email={email}
            setEmail={setEmail}
            password={password}
            setPassword={setPassword}
            confirmPassword={confirmPassword}
            setConfirmPassword={setConfirmPassword}
            showPassword={showPassword}
            setShowPassword={setShowPassword}
            showConfirmPassword={showConfirmPassword}
            setShowConfirmPassword={setShowConfirmPassword}
            phoneFieldEnabled={phoneFieldEnabled}
            phonePrefix={phonePrefix}
            setPhonePrefix={setPhonePrefix}
            phone={phone}
            setPhone={setPhone}
            showPrefixModal={showPrefixModal}
            setShowPrefixModal={setShowPrefixModal}
            phonePrefixes={PHONE_PREFIXES}
            birthYear={birthYear}
            setBirthYear={setBirthYear}
            country={country}
            setCountry={setCountry}
            showCountries={showCountries}
            setShowCountries={setShowCountries}
            region={region}
            setRegion={setRegion}
            showRegions={showRegions}
            setShowRegions={setShowRegions}
            expandedContinents={expandedContinents}
            setExpandedContinents={setExpandedContinents}
            inviteCode={inviteCode}
            setInviteCode={setInviteCode}
            invitePreview={invitePreview}
            invitePreviewLoading={invitePreviewLoading}
            error={error}
            emailConfirmed={emailConfirmed}
            setShowEmailConfirm={setShowEmailConfirm}
          />
        )}
        {step === 4 && (
          <StepLegal
            eulaAccepted={eulaAccepted}
            setEulaAccepted={setEulaAccepted}
            privacyAccepted={privacyAccepted}
            setPrivacyAccepted={setPrivacyAccepted}
            marketingAccepted={marketingAccepted}
            setMarketingAccepted={setMarketingAccepted}
            eulaTexts={EULA_TEXTS}
          />
        )}

        <NavigationButtons
          step={step}
          totalSteps={totalSteps}
          isPending={registerMutation.isPending}
          onNext={handleNext}
        />

        {step === 1 && (
          <LoginPrompt onPress={() => router.back()} />
        )}

        <TouchableOpacity
          onPress={() => setShowSupportModal(true)}
          style={styles.supportRow}
          testID="register-support"
        >
          <Text style={styles.supportLink}>Problemi? Contatta il supporto</Text>
        </TouchableOpacity>
      </KeyboardAwareScrollViewCompat>

      <SupportContactModal visible={showSupportModal} onClose={() => setShowSupportModal(false)} />

      <PrivacyNoticeModal
        visible={showPrivacyModal}
        onClose={() => setShowPrivacyModal(false)}
      />

      <EmailConfirmModal
        visible={showEmailConfirm}
        email={email}
        onConfirm={() => {
          setEmailConfirmed(true);
          setShowEmailConfirm(false);
        }}
        onEdit={() => setShowEmailConfirm(false)}
      />

      <GiftModal
        visible={showGiftModal}
        message={giftModalMessage}
        code={giftModalCode}
        onClose={handleGiftModalClose}
      />
    </View>
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
  loginLink: {
    color: Colors.accent,
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
  supportRow: {
    alignItems: "center",
    marginTop: 12,
    paddingVertical: 4,
  },
  supportLink: {
    color: Colors.textSecondary,
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    textDecorationLine: "underline",
  },
});
