import React, { useState } from "react";
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
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/colors";
import { t } from "@/lib/i18n";
import { useAuth } from "@/lib/auth-context";

const ITALIAN_REGIONS = [
  "Abruzzo", "Basilicata", "Calabria", "Campania", "Emilia-Romagna",
  "Friuli Venezia Giulia", "Lazio", "Liguria", "Lombardia", "Marche",
  "Molise", "Piemonte", "Puglia", "Sardegna", "Sicilia",
  "Toscana", "Trentino-Alto Adige", "Umbria", "Valle d'Aosta", "Veneto",
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

  const [step, setStep] = useState(1);
  const [error, setError] = useState("");

  const [userType, setUserType] = useState<"biker" | "zavorrina" | "coppia" | "">("");
  const [sex, setSex] = useState<"M" | "F" | "">("");
  const [coupleSexConfig, setCoupleSexConfig] = useState<"M+M" | "M+F" | "F+F" | "">("");
  const [nickname, setNickname] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [birthYear, setBirthYear] = useState("");
  const [region, setRegion] = useState("");
  const [showRegions, setShowRegions] = useState(false);
  const [eulaAccepted, setEulaAccepted] = useState(false);

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
    } else if (step === 4) {
      if (!eulaAccepted) {
        setError("Devi accettare i termini e le condizioni");
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
    const data: any = {
      nickname: nickname.trim(),
      email: email.trim().toLowerCase(),
      password,
      userType,
      eulaAccepted: true as const,
    };
    if (phone.trim()) data.phone = phone.trim();
    if (userType === "coppia" && coupleSexConfig) {
      data.coupleSexConfig = coupleSexConfig;
    } else if (sex) {
      data.sex = sex;
    }
    if (birthYear) data.birthYear = parseInt(birthYear, 10);
    if (region) data.region = region;

    registerMutation.mutate(data, {
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
          <MaterialCommunityIcons
            name="motorbike"
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
          <MaterialCommunityIcons
            name="seat-passenger"
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
          <MaterialCommunityIcons
            name="account-group"
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
      </View>

      <View style={styles.inputWrapper}>
        <Ionicons name="call-outline" size={20} color={Colors.textSecondary} style={styles.inputIcon} />
        <TextInput
          style={styles.input}
          placeholder={`${t("auth.phone")} (opzionale)`}
          placeholderTextColor={Colors.textSecondary}
          value={phone}
          onChangeText={setPhone}
          keyboardType="phone-pad"
          testID="reg-phone"
        />
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
        onPress={() => setShowRegions(!showRegions)}
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
            {ITALIAN_REGIONS.map((r) => (
              <TouchableOpacity
                key={r}
                style={[styles.regionItem, region === r && styles.regionItemSelected]}
                onPress={() => { setRegion(r); setShowRegions(false); }}
              >
                <Text style={[styles.regionText, region === r && styles.regionTextSelected]}>{r}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}
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
    fontWeight: "bold" as const,
    color: Colors.text,
    textAlign: "center",
  },
  stepSubtitle: {
    fontSize: 15,
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
    fontWeight: "600" as const,
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
    fontWeight: "600" as const,
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
    fontWeight: "bold" as const,
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
  },
  regionTextSelected: {
    color: Colors.accent,
    fontWeight: "600" as const,
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
    marginBottom: 12,
  },
  errorText: {
    color: Colors.error,
    fontSize: 13,
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
    fontWeight: "700" as const,
    letterSpacing: 0.5,
  },
  loginRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 6,
    marginTop: 20,
  },
  loginPrompt: {
    color: Colors.textSecondary,
    fontSize: 14,
  },
  loginLink: {
    color: Colors.accent,
    fontSize: 14,
    fontWeight: "600" as const,
  },
});
