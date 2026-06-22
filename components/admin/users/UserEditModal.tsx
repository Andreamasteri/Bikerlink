import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { AdminUser } from "./UserCard";
import RegionPicker from "@/components/RegionPicker";

const USER_TYPES = [
  { value: "biker", label: "Biker" },
  { value: "zavorrina", label: "Zavorrina" },
  { value: "coppia", label: "Coppia" },
] as const;

const SEX_OPTIONS = [
  { value: "M", label: "M" },
  { value: "F", label: "F" },
] as const;

export interface ProfilePayload {
  userType: "biker" | "zavorrina" | "coppia";
  sex?: "M" | "F" | null;
  birthYear?: number | null;
  region?: string | null;
}

interface UserEditModalProps {
  visible: boolean;
  onClose: () => void;
  user: AdminUser | null;
  editEmail: string;
  setEditEmail: (email: string) => void;
  editPassword: string;
  setEditPassword: (password: string) => void;
  onSaveEmail: () => void;
  onSavePassword: () => void;
  onStatusChange: (user: AdminUser) => void;
  onMakeModerator: (user: AdminUser) => void;
  onDeleteUser: (user: AdminUser) => void;
  getStatusColor: (status: string) => string;
  onSaveProfile?: (payload: ProfilePayload) => void;
  isSavingProfile?: boolean;
}

export const UserEditModal: React.FC<UserEditModalProps> = ({
  visible,
  onClose,
  user,
  editEmail,
  setEditEmail,
  editPassword,
  setEditPassword,
  onSaveEmail,
  onSavePassword,
  onStatusChange,
  onMakeModerator,
  onDeleteUser,
  getStatusColor,
  onSaveProfile,
  isSavingProfile = false,
}) => {
  const [editUserType, setEditUserType] = useState<"biker" | "zavorrina" | "coppia">("biker");
  const [editSex, setEditSex] = useState<"M" | "F" | null>(null);
  const [editBirthYearStr, setEditBirthYearStr] = useState("");
  const [editRegion, setEditRegion] = useState("");
  const [showRegionPicker, setShowRegionPicker] = useState(false);
  const [dirty, setDirty] = useState({ userType: false, sex: false, birthYear: false, region: false });

  useEffect(() => {
    if (user && visible) {
      setEditUserType((user.userType as "biker" | "zavorrina" | "coppia") || "biker");
      setEditSex(user.sex === "M" || user.sex === "F" ? user.sex : null);
      setEditBirthYearStr(user.birthYear != null ? String(user.birthYear) : "");
      setEditRegion(user.region ?? "");
      setDirty({ userType: false, sex: false, birthYear: false, region: false });
    }
  }, [user, visible]);

  if (!user) return null;

  function handleSaveProfile() {
    if (!onSaveProfile) return;
    if (!dirty.userType && !dirty.sex && !dirty.birthYear && !dirty.region) {
      Alert.alert("Nessuna modifica", "Modifica almeno un campo prima di salvare.");
      return;
    }
    const birthYear = editBirthYearStr ? parseInt(editBirthYearStr, 10) : null;
    if (dirty.birthYear && editBirthYearStr && (isNaN(birthYear!) || birthYear! < 1920 || birthYear! > new Date().getFullYear())) {
      Alert.alert("Errore", "Anno di nascita non valido");
      return;
    }
    const payload: ProfilePayload = { userType: dirty.userType ? editUserType : (user!.userType as "biker" | "zavorrina" | "coppia") };
    if (dirty.sex) payload.sex = editSex;
    if (dirty.birthYear) payload.birthYear = birthYear;
    if (dirty.region) payload.region = editRegion.trim() || null;
    onSaveProfile(payload);
  }

  return (
    <>
      <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Gestisci Utente</Text>
              <TouchableOpacity onPress={onClose}>
                <Ionicons name="close" size={24} color={Colors.text} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.scrollBody} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <Text style={styles.fieldLabel}>Modifica Email</Text>
              <View style={styles.fieldRow}>
                <TextInput
                  style={[styles.input, { flex: 1 }]}
                  value={editEmail}
                  onChangeText={setEditEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                />
                <TouchableOpacity style={styles.saveBtn} onPress={onSaveEmail}>
                  <Text style={styles.saveBtnText}>Salva</Text>
                </TouchableOpacity>
              </View>

              <Text style={[styles.fieldLabel, { marginTop: 16 }]}>Reimposta Password</Text>
              <View style={styles.fieldRow}>
                <TextInput
                  style={[styles.input, { flex: 1 }]}
                  value={editPassword}
                  onChangeText={setEditPassword}
                  placeholder="Nuova password"
                  placeholderTextColor={Colors.textSecondary}
                  secureTextEntry
                />
                <TouchableOpacity style={styles.saveBtn} onPress={onSavePassword}>
                  <Text style={styles.saveBtnText}>Cambia</Text>
                </TouchableOpacity>
              </View>

              <View style={[styles.infoSection, { marginTop: 20 }]}>
                <Text style={styles.infoLabel}>Stato Attuale</Text>
                <Text style={[styles.infoValue, { color: getStatusColor(user.status) }]}>
                  {user.status}
                </Text>
              </View>

              {onSaveProfile && (
                <>
                  <View style={styles.sectionDivider}>
                    <Text style={styles.sectionTitle}>Profilo</Text>
                  </View>

                  <View style={styles.inlineRow}>
                    <Text style={styles.inlineLabel}>Tipo utente</Text>
                    <View style={styles.chipRowInline}>
                      {USER_TYPES.map((t) => (
                        <TouchableOpacity
                          key={t.value}
                          style={[styles.chip, editUserType === t.value && styles.chipActive]}
                          onPress={() => {
                            setEditUserType(t.value);
                            setDirty((d) => ({ ...d, userType: true }));
                          }}
                        >
                          <Text style={[styles.chipText, editUserType === t.value && styles.chipTextActive]}>
                            {t.label}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>

                  <View style={styles.inlineRow}>
                    <Text style={styles.inlineLabel}>Sesso</Text>
                    <View style={styles.chipRowInline}>
                      {SEX_OPTIONS.map((s) => (
                        <TouchableOpacity
                          key={s.value}
                          style={[styles.chip, editSex === s.value && styles.chipActive]}
                          onPress={() => {
                            setEditSex(editSex === s.value ? null : s.value);
                            setDirty((d) => ({ ...d, sex: true }));
                          }}
                        >
                          <Text style={[styles.chipText, editSex === s.value && styles.chipTextActive]}>
                            {s.label}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>

                  <View style={styles.inlineRow}>
                    <Text style={styles.inlineLabel}>Anno di nascita</Text>
                    <TextInput
                      style={[styles.input, styles.inputCompact]}
                      value={editBirthYearStr}
                      onChangeText={(v) => {
                        setEditBirthYearStr(v);
                        setDirty((d) => ({ ...d, birthYear: true }));
                      }}
                      placeholder="es. 1990"
                      placeholderTextColor={Colors.textSecondary}
                      keyboardType="number-pad"
                      maxLength={4}
                    />
                  </View>

                  <View style={styles.inlineRow}>
                    <Text style={styles.inlineLabel}>Regione</Text>
                    <TouchableOpacity
                      style={styles.regionSelector}
                      onPress={() => setShowRegionPicker(true)}
                      activeOpacity={0.7}
                    >
                      <Text style={editRegion ? styles.regionText : styles.regionPlaceholder}>
                        {editRegion || "Seleziona"}
                      </Text>
                      <Ionicons name="chevron-down" size={16} color={Colors.textSecondary} />
                    </TouchableOpacity>
                  </View>
                </>
              )}

              <View style={styles.quickActions}>
                {user.role === "user" && (
                  <TouchableOpacity
                    style={styles.quickActionBtn}
                    onPress={() => {
                      onClose();
                      onMakeModerator(user);
                    }}
                  >
                    <Ionicons name="shield-checkmark-outline" size={20} color={Colors.maleIcon} />
                    <Text style={styles.quickActionText}>Rendi Moderatore</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  style={styles.quickActionBtn}
                  onPress={() => {
                    onClose();
                    onStatusChange(user);
                  }}
                >
                  <Ionicons name="ban-outline" size={20} color={Colors.warning} />
                  <Text style={styles.quickActionText}>Cambia Stato</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.quickActionBtn, { borderColor: Colors.error }]}
                  onPress={() => {
                    onClose();
                    onDeleteUser(user);
                  }}
                >
                  <Ionicons name="trash-outline" size={20} color={Colors.error} />
                  <Text style={[styles.quickActionText, { color: Colors.error }]}>Elimina</Text>
                </TouchableOpacity>
              </View>

              <View style={{ height: 8 }} />
            </ScrollView>

            {onSaveProfile && (
              <View style={styles.footer}>
                <TouchableOpacity
                  style={[styles.saveProfileBtn, isSavingProfile && styles.saveProfileBtnDisabled]}
                  onPress={handleSaveProfile}
                  disabled={isSavingProfile}
                >
                  <Ionicons name="checkmark-circle-outline" size={18} color="#0D0D0D" />
                  <Text style={styles.saveProfileBtnText}>
                    {isSavingProfile ? "Salvataggio..." : "Salva Profilo"}
                  </Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
      </Modal>

      {onSaveProfile && (
        <RegionPicker
          visible={showRegionPicker}
          selectedRegion={editRegion}
          onSelect={(r) => { setEditRegion(r); setDirty((d) => ({ ...d, region: true })); }}
          onClose={() => setShowRegionPicker(false)}
        />
      )}
    </>
  );
};

import { styles } from "./UserEditModal.styles";
