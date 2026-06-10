import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Modal,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { t } from "@/lib/i18n";
import { PhoneInput } from "./step-basic/PhoneInput";
import { DatePicker } from "./step-basic/DatePicker";
import { LocationSelector } from "./step-basic/LocationSelector";
import { InviteCodeInput } from "./step-basic/InviteCodeInput";

interface StepBasicInfoProps {
  nickname: string;
  setNickname: (v: string) => void;
  email: string;
  setEmail: (v: string) => void;
  password: string;
  setPassword: (v: string) => void;
  confirmPassword: string;
  setConfirmPassword: (v: string) => void;
  showPassword: boolean;
  setShowPassword: (v: boolean) => void;
  showConfirmPassword: boolean;
  setShowConfirmPassword: (v: boolean) => void;
  phoneFieldEnabled: boolean;
  phonePrefix: string;
  setPhonePrefix: (v: string) => void;
  phone: string;
  setPhone: (v: string) => void;
  showPrefixModal: boolean;
  setShowPrefixModal: (v: boolean) => void;
  phonePrefixes: { code: string; country: string }[];
  birthYear: string;
  setBirthYear: (v: string) => void;
  country: string;
  setCountry: (v: string) => void;
  showCountries: boolean;
  setShowCountries: (v: boolean) => void;
  region: string;
  setRegion: (v: string) => void;
  showRegions: boolean;
  setShowRegions: (v: boolean) => void;
  expandedContinents: Set<string>;
  setExpandedContinents: (v: Set<string>) => void;
  inviteCode: string;
  setInviteCode: (v: string) => void;
  invitePreview: { code: string; label: string | null; giftMessage: string | null } | null;
  invitePreviewLoading: boolean;
  error: string;
  emailConfirmed: boolean;
  setShowEmailConfirm: (v: boolean) => void;
}

function getPasswordError(password: string): string | null {
  if (password.length < 8) return "La password deve avere almeno 8 caratteri.";
  if (!/[A-Z]/.test(password)) return "La password deve contenere almeno una lettera MAIUSCOLA.";
  if (!/[a-z]/.test(password)) return "La password deve contenere almeno una lettera minuscola.";
  if (!/[0-9]/.test(password)) return "La password deve contenere almeno un numero.";
  return null;
}

export const StepBasicInfo: React.FC<StepBasicInfoProps> = ({
  nickname,
  setNickname,
  email,
  setEmail,
  password,
  setPassword,
  confirmPassword,
  setConfirmPassword,
  showPassword,
  setShowPassword,
  showConfirmPassword,
  setShowConfirmPassword,
  phoneFieldEnabled,
  phonePrefix,
  setPhonePrefix,
  phone,
  setPhone,
  showPrefixModal,
  setShowPrefixModal,
  phonePrefixes,
  birthYear,
  setBirthYear,
  country,
  setCountry,
  showCountries,
  setShowCountries,
  region,
  setRegion,
  showRegions,
  setShowRegions,
  expandedContinents,
  setExpandedContinents,
  inviteCode,
  setInviteCode,
  invitePreview,
  invitePreviewLoading,
  error,
  emailConfirmed,
  setShowEmailConfirm,
}) => {
  const [passwordModalVisible, setPasswordModalVisible] = useState(false);
  const [passwordModalMessage, setPasswordModalMessage] = useState("");

  const handleConfirmPasswordFocus = () => {
    const err = getPasswordError(password);
    if (err) {
      setPasswordModalMessage(err);
      setPasswordModalVisible(true);
    }
  };

  return (
    <View style={styles.stepContent}>
      <Text style={styles.stepTitle}>Joini BikerLink!</Text>

      <View style={[styles.inputWrapper, styles.inputWrapperRequired]}>
        <Ionicons name="person-outline" size={22} color={Colors.textSecondary} style={styles.inputIcon} />
        <TextInput
          style={styles.input}
          placeholder={t("register.step3.nicknamePlaceholder")}
          placeholderTextColor={Colors.textSecondary}
          value={nickname}
          onChangeText={setNickname}
          autoCapitalize="none"
          testID="input-nickname"
        />
      </View>

      <View style={[styles.inputWrapper, styles.inputWrapperRequired]}>
        <Ionicons name="mail-outline" size={22} color={Colors.textSecondary} style={styles.inputIcon} />
        <TextInput
          style={styles.input}
          placeholder={t("register.step3.emailPlaceholder")}
          placeholderTextColor={Colors.textSecondary}
          value={email}
          onChangeText={(val) => {
            setEmail(val);
          }}
          onBlur={() => {
            if (email.trim() && !emailConfirmed) {
              setShowEmailConfirm(true);
            }
          }}
          keyboardType="email-address"
          autoCapitalize="none"
          testID="input-email"
        />
        {emailConfirmed && <Ionicons name="checkmark-circle" size={20} color={Colors.accent} />}
      </View>

      {error && error.includes("email") && <Text style={styles.inlineError}>{error}</Text>}

      <PhoneInput
        phoneFieldEnabled={phoneFieldEnabled}
        phonePrefix={phonePrefix}
        setPhonePrefix={setPhonePrefix}
        phone={phone}
        setPhone={setPhone}
        showPrefixModal={showPrefixModal}
        setShowPrefixModal={setShowPrefixModal}
        phonePrefixes={phonePrefixes}
      />

      <View style={[styles.inputWrapper, styles.inputWrapperRequired]}>
        <Ionicons name="lock-closed-outline" size={22} color={Colors.textSecondary} style={styles.inputIcon} />
        <TextInput
          style={[styles.input, styles.passwordInput]}
          placeholder="8 caratteri, 1 numero, 1 maiusc., 1 min."
          placeholderTextColor={Colors.textSecondary}
          value={password}
          onChangeText={setPassword}
          secureTextEntry={!showPassword}
          testID="input-password"
        />
        <TouchableOpacity
          style={styles.eyeButton}
          onPress={() => setShowPassword(!showPassword)}
        >
          <Ionicons
            name={showPassword ? "eye-off-outline" : "eye-outline"}
            size={22}
            color={Colors.textSecondary}
          />
        </TouchableOpacity>
      </View>

      <View style={[styles.inputWrapper, styles.inputWrapperRequired]}>
        <Ionicons name="lock-closed-outline" size={22} color={Colors.textSecondary} style={styles.inputIcon} />
        <TextInput
          style={[styles.input, styles.passwordInput]}
          placeholder={t("register.step3.confirmPasswordPlaceholder")}
          placeholderTextColor={Colors.textSecondary}
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          onFocus={handleConfirmPasswordFocus}
          secureTextEntry={!showConfirmPassword}
          testID="input-confirm-password"
        />
        <TouchableOpacity
          style={styles.eyeButton}
          onPress={() => setShowConfirmPassword(!showConfirmPassword)}
        >
          <Ionicons
            name={showConfirmPassword ? "eye-off-outline" : "eye-outline"}
            size={22}
            color={Colors.textSecondary}
          />
        </TouchableOpacity>
      </View>

      <DatePicker birthYear={birthYear} setBirthYear={setBirthYear} />

      <InviteCodeInput
        inviteCode={inviteCode}
        setInviteCode={setInviteCode}
        invitePreview={invitePreview}
        invitePreviewLoading={invitePreviewLoading}
      />

      <LocationSelector
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
      />

      <Modal visible={passwordModalVisible} transparent animationType="fade">
        <View style={styles.pwModalOverlay}>
          <View style={styles.pwModalContent}>
            <Ionicons name="warning-outline" size={40} color={Colors.error} style={styles.pwModalIcon} />
            <Text style={styles.pwModalMessage}>{passwordModalMessage}</Text>
            <TouchableOpacity
              style={styles.pwModalButton}
              onPress={() => setPasswordModalVisible(false)}
            >
              <Text style={styles.pwModalButtonText}>Ok, ho capito</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
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
  inputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 14,
    height: 58,
  },
  inputWrapperRequired: {
    borderColor: Colors.accent + "88",
  },
  inputIcon: {
    marginRight: 10,
  },
  input: {
    flex: 1,
    color: Colors.text,
    fontSize: 19,
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
  inlineError: {
    color: Colors.error,
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    marginTop: -8,
    marginLeft: 4,
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
    height: 58,
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
    height: 58,
  },
  phoneInput: {
    flex: 1,
    color: Colors.text,
    fontSize: 17,
    fontFamily: "Inter_400Regular",
    height: "100%",
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
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    lineHeight: 18,
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
    paddingBottom: 0,
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
  continentHeader: {
    backgroundColor: Colors.background,
    paddingVertical: 8,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  continentLabel: {
    color: Colors.textSecondary,
    fontSize: 12,
    fontFamily: "Inter_700Bold",
    textTransform: "uppercase" as const,
    letterSpacing: 1,
  },
  pwModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.65)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 32,
  },
  pwModalContent: {
    backgroundColor: Colors.surface,
    borderRadius: 20,
    padding: 28,
    alignItems: "center",
    gap: 20,
    width: "100%",
  },
  pwModalIcon: {
    marginBottom: 4,
  },
  pwModalMessage: {
    color: Colors.text,
    fontSize: 22,
    fontFamily: "Inter_700Bold",
    textAlign: "center",
    lineHeight: 30,
  },
  pwModalButton: {
    backgroundColor: Colors.accent,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 32,
    alignItems: "center",
    width: "100%",
  },
  pwModalButtonText: {
    color: Colors.background,
    fontSize: 17,
    fontFamily: "Inter_700Bold",
  },
});
