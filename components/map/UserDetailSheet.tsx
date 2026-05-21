import React from "react";
import {
  Modal,
  Pressable,
  View,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import Colors from "@/constants/colors";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import InviteEventModal from "@/components/map/InviteEventModal";
import UserDetailContent from "@/components/map/UserDetailContent";

type Props = {
  selectedUser: any;
  selectedUserDetail: any;
  selectedUserProposals: any[];
  detailLoading: boolean;
  onClose: () => void;
  onPhotoPress: (uri: string) => void;
  myOrganizedEvents: any[];
  targetUserEventIds: string[];
  currentUserId: string | null | undefined;
};

export default function UserDetailSheet({
  selectedUser,
  selectedUserDetail,
  selectedUserProposals,
  detailLoading,
  onClose,
  onPhotoPress,
  myOrganizedEvents,
  targetUserEventIds,
}: Props) {
  const insets = useSafeAreaInsets();
  const [showInviteModal, setShowInviteModal] = React.useState(false);

  return (
    <>
      <Modal
        visible={!!selectedUser}
        transparent
        animationType="slide"
        onRequestClose={() => { onClose(); setShowInviteModal(false); }}
      >
        <Pressable style={styles.overlay} onPress={onClose}>
          <Pressable
            style={[styles.sheet, { paddingBottom: insets.bottom || 16 }]}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.handle} />
            {detailLoading ? (
              <ActivityIndicator size="large" color={Colors.accent} style={{ marginVertical: 40 }} />
            ) : (
              <UserDetailContent
                selectedUser={selectedUser}
                selectedUserDetail={selectedUserDetail}
                selectedUserProposals={selectedUserProposals}
                detailLoading={detailLoading}
                onClose={onClose}
                onPhotoPress={onPhotoPress}
                myOrganizedEvents={myOrganizedEvents}
                onInvitePress={() => setShowInviteModal(true)}
              />
            )}
          </Pressable>
        </Pressable>
      </Modal>

      <InviteEventModal
        visible={showInviteModal}
        onClose={() => setShowInviteModal(false)}
        selectedUser={selectedUser}
        myOrganizedEvents={myOrganizedEvents}
        targetUserEventIds={targetUserEventIds}
      />
    </>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    maxHeight: "70%",
  },
  handle: {
    width: 40,
    height: 4,
    backgroundColor: Colors.border,
    borderRadius: 2,
    alignSelf: "center",
    marginBottom: 16,
  },
});
