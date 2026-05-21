import React from "react";
import { View as RNView, Text as RNText, StyleSheet as RNStyleSheet, Switch as RNSwitch, ActivityIndicator as RNActivityIndicator, TouchableOpacity as RNTouchableOpacity } from "react-native";
import { Ionicons as IoniconsSet } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { useT } from "@/lib/language-context";

const styles = RNStyleSheet.create({
  sectionHeaderRow: {
    flexDirection: "row", alignItems: "center", gap: 8, marginTop: 20, marginBottom: 12,
  },
  sectionTitle: {
    fontFamily: "Inter_700Bold", fontSize: 16, color: Colors.textSecondary,
    textTransform: "uppercase", letterSpacing: 0.5,
  },
  paidCard: {
    backgroundColor: Colors.surface, borderRadius: 12, padding: 16, marginBottom: 16,
    borderWidth: 1, borderColor: Colors.warning,
  },
  synecoHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  synecoInfo: { flexDirection: "row", alignItems: "center", gap: 10 },
  synecoLabel: { fontFamily: "Inter_600SemiBold", fontSize: 16, color: Colors.text },
  synecoDesc: { fontFamily: "Inter_400Regular", fontSize: 13, color: Colors.textSecondary, marginTop: 8 },
  paypalCard: {
    backgroundColor: Colors.surface, borderRadius: 12, padding: 16, marginTop: 16,
    borderWidth: 1, borderColor: "#003087",
  },
  emailVerifCard: {
    backgroundColor: Colors.surface, borderRadius: 12, padding: 16, marginBottom: 16,
    borderWidth: 1, borderColor: Colors.accent,
  },
});

interface GeneralToggleSectionProps {
  marketplaceEnabled: boolean;
  onMarketplaceToggle: (val: boolean) => void;
  marketplaceLoading: boolean;
  gpsRequired: boolean;
  onGpsRequiredToggle: (val: boolean) => void;
  gpsRequiredLoading: boolean;
  ghostModeEnabled: boolean;
  onGhostModeToggle: (val: boolean) => void;
  ghostModeLoading: boolean;
  emailVerifEnabled: boolean;
  onEmailVerifToggle: (val: boolean) => void;
  emailVerifLoading: boolean;
  phoneFieldEnabled: boolean;
  onPhoneFieldToggle: (val: boolean) => void;
  phoneFieldLoading: boolean;
  userAvailableOnLogin: boolean;
  onUserAvailableToggle: (val: boolean) => void;
  userAvailableLoading: boolean;
  primalEnabled: boolean;
  onPrimalToggle: (val: boolean) => void;
  primalLoading: boolean;
  unitsPrefEnabled: boolean;
  onUnitsPrefToggle: (val: boolean) => void;
  unitsPrefLoading: boolean;
}

export function GeneralToggleSection({
  marketplaceEnabled,
  onMarketplaceToggle,
  marketplaceLoading,
  gpsRequired,
  onGpsRequiredToggle,
  gpsRequiredLoading,
  ghostModeEnabled,
  onGhostModeToggle,
  ghostModeLoading,
  emailVerifEnabled,
  onEmailVerifToggle,
  emailVerifLoading,
  phoneFieldEnabled,
  onPhoneFieldToggle,
  phoneFieldLoading,
  userAvailableOnLogin,
  onUserAvailableToggle,
  userAvailableLoading,
  primalEnabled,
  onPrimalToggle,
  primalLoading,
  unitsPrefEnabled,
  onUnitsPrefToggle,
  unitsPrefLoading,
}: GeneralToggleSectionProps) {
  const t = useT();

  return (
    <RNView>
      <RNView style={styles.sectionHeaderRow}>
        <IoniconsSet name="apps" size={20} color={Colors.accent} />
        <RNText style={styles.sectionTitle}>{t("admin.appFeatures")}</RNText>
      </RNView>

      <RNView style={styles.paypalCard}>
        <RNView style={styles.synecoHeader}>
          <RNView style={styles.synecoInfo}>
            <IoniconsSet name="pricetag" size={20} color="#FF9800" />
            <RNText style={styles.synecoLabel}>Mercatino Moto</RNText>
          </RNView>
          {marketplaceLoading ? (
            <RNActivityIndicator size="small" color={Colors.textSecondary} />
          ) : (
            <RNSwitch
              value={marketplaceEnabled}
              onValueChange={onMarketplaceToggle}
              trackColor={{ false: Colors.border, true: "#FF9800" }}
              thumbColor={marketplaceEnabled ? Colors.text : Colors.textSecondary}
            />
          )}
        </RNView>
        <RNText style={styles.synecoDesc}>
          {marketplaceEnabled
            ? "I biker possono mettere in vendita le moto dal garage. Le moto in vendita appaiono nel profilo e nel motoclub."
            : t("admin.marketplaceInactive")}
        </RNText>
      </RNView>

      <RNView style={styles.paypalCard}>
        <RNView style={styles.synecoHeader}>
          <RNView style={styles.synecoInfo}>
            <IoniconsSet name="navigate" size={20} color="#4CAF50" />
            <RNText style={styles.synecoLabel}>GPS Obbligatorio</RNText>
          </RNView>
          {gpsRequiredLoading ? (
            <RNActivityIndicator size="small" color={Colors.textSecondary} />
          ) : (
            <RNSwitch
              value={gpsRequired}
              onValueChange={onGpsRequiredToggle}
              trackColor={{ false: Colors.border, true: "#4CAF50" }}
              thumbColor={gpsRequired ? Colors.text : Colors.textSecondary}
            />
          )}
        </RNView>
        <RNText style={styles.synecoDesc}>
          {gpsRequired
            ? "Senza permesso GPS, l'utente vede solo Profilo e Garage. Le altre tab sono nascoste."
            : "GPS non obbligatorio: tutte le tab sono sempre visibili, anche senza permesso di localizzazione."}
        </RNText>
      </RNView>

      <RNView style={styles.paypalCard}>
        <RNView style={styles.synecoHeader}>
          <RNView style={styles.synecoInfo}>
            <IoniconsSet name="eye-off" size={20} color="#9C27B0" />
            <RNText style={styles.synecoLabel}>Ghost Mode</RNText>
          </RNView>
          {ghostModeLoading ? (
            <RNActivityIndicator size="small" color={Colors.textSecondary} />
          ) : (
            <RNSwitch
              value={ghostModeEnabled}
              onValueChange={onGhostModeToggle}
              trackColor={{ false: Colors.border, true: "#9C27B0" }}
              thumbColor={ghostModeEnabled ? Colors.text : Colors.textSecondary}
            />
          )}
        </RNView>
        <RNText style={styles.synecoDesc}>
          {ghostModeEnabled
            ? t("admin.invisibleModeDesc")
            : "Ghost Mode disabilitato. Gli utenti non possono nascondersi dalla piattaforma."}
        </RNText>
      </RNView>

      <RNView style={styles.sectionHeaderRow}>
        <IoniconsSet name="people" size={20} color={Colors.accent} />
        <RNText style={styles.sectionTitle}>Gestione Utenti</RNText>
      </RNView>

      <RNView style={styles.emailVerifCard}>
        <RNView style={styles.synecoHeader}>
          <RNView style={styles.synecoInfo}>
            <IoniconsSet name="mail" size={20} color={Colors.accent} />
            <RNText style={styles.synecoLabel}>Verifica Email</RNText>
            <RNTouchableOpacity
              onPress={() => {}} // This should ideally show an alert, but alerts are side effects. 
              style={{ marginLeft: 6 }}
            >
              <IoniconsSet name="information-circle-outline" size={20} color={Colors.textSecondary} />
            </RNTouchableOpacity>
          </RNView>
          {emailVerifLoading ? (
            <RNActivityIndicator size="small" color={Colors.textSecondary} />
          ) : (
            <RNSwitch
              value={emailVerifEnabled}
              onValueChange={onEmailVerifToggle}
              trackColor={{ false: Colors.border, true: Colors.accent }}
              thumbColor={emailVerifEnabled ? Colors.text : Colors.textSecondary}
            />
          )}
        </RNView>
        <RNText style={styles.synecoDesc}>
          {emailVerifEnabled ? t("admin.emailVerifActive") : t("admin.emailVerifInactive")}
        </RNText>
      </RNView>

      <RNView style={styles.emailVerifCard}>
        <RNView style={styles.synecoHeader}>
          <RNView style={styles.synecoInfo}>
            <IoniconsSet name="call-outline" size={20} color={Colors.accent} />
            <RNText style={styles.synecoLabel}>Campo telefono in registrazione</RNText>
          </RNView>
          {phoneFieldLoading ? (
            <RNActivityIndicator size="small" color={Colors.textSecondary} />
          ) : (
            <RNSwitch
              value={phoneFieldEnabled}
              onValueChange={onPhoneFieldToggle}
              trackColor={{ false: Colors.border, true: Colors.accent }}
              thumbColor={phoneFieldEnabled ? Colors.text : Colors.textSecondary}
            />
          )}
        </RNView>
        <RNText style={styles.synecoDesc}>
          {phoneFieldEnabled ? t("admin.phoneFieldVisible") : t("admin.phoneFieldHidden")}
        </RNText>
      </RNView>

      <RNView style={styles.emailVerifCard}>
        <RNView style={styles.synecoHeader}>
          <RNView style={styles.synecoInfo}>
            <IoniconsSet name="radio-button-on-outline" size={20} color={Colors.success} />
            <RNText style={styles.synecoLabel}>Utente Disponibile all'accesso</RNText>
          </RNView>
          {userAvailableLoading ? (
            <RNActivityIndicator size="small" color={Colors.textSecondary} />
          ) : (
            <RNSwitch
              value={userAvailableOnLogin}
              onValueChange={onUserAvailableToggle}
              trackColor={{ false: Colors.border, true: Colors.success }}
              thumbColor={userAvailableOnLogin ? Colors.text : Colors.textSecondary}
            />
          )}
        </RNView>
        <RNText style={styles.synecoDesc}>
          {userAvailableOnLogin ? "Gli utenti risultano disponibili appena effettuato il login" : "Gli utenti risultano non disponibili al login (devono attivarsi manualmente)"}
        </RNText>
      </RNView>

      <RNView style={styles.emailVerifCard}>
        <RNView style={styles.synecoHeader}>
          <RNView style={styles.synecoInfo}>
            <IoniconsSet name="star" size={20} color="#FF3B30" />
            <RNText style={styles.synecoLabel}>Account Primal</RNText>
          </RNView>
          {primalLoading ? (
            <RNActivityIndicator size="small" color={Colors.textSecondary} />
          ) : (
            <RNSwitch
              value={primalEnabled}
              onValueChange={onPrimalToggle}
              trackColor={{ false: Colors.border, true: "#FF3B30" }}
              thumbColor={primalEnabled ? Colors.text : Colors.textSecondary}
            />
          )}
        </RNView>
        <RNText style={styles.synecoDesc}>
          {primalEnabled ? "Account creati prima del rilascio ufficiale — badge speciale e vantaggi attivi" : "Badge Primal disattivato per tutti gli utenti"}
        </RNText>
      </RNView>

      <RNView style={styles.emailVerifCard}>
        <RNView style={styles.synecoHeader}>
          <RNView style={styles.synecoInfo}>
            <IoniconsSet name="speedometer-outline" size={20} color={Colors.accent} />
            <RNText style={styles.synecoLabel}>Scelta Unità di Misura</RNText>
          </RNView>
          {unitsPrefLoading ? (
            <RNActivityIndicator size="small" color={Colors.textSecondary} />
          ) : (
            <RNSwitch
              value={unitsPrefEnabled}
              onValueChange={onUnitsPrefToggle}
              trackColor={{ false: Colors.border, true: Colors.accent }}
              thumbColor={unitsPrefEnabled ? Colors.text : Colors.textSecondary}
            />
          )}
        </RNView>
        <RNText style={styles.synecoDesc}>
          {unitsPrefEnabled ? "Gli utenti possono scegliere tra km/h e mph nel profilo" : "Unità di misura bloccate su KM/H (Italia)"}
        </RNText>
      </RNView>
    </RNView>
  );
}
