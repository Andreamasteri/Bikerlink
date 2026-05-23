import React from "react";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import UserListSheet from "@/components/map/UserListSheet";
import UserDetailSheet from "@/components/map/UserDetailSheet";
import SosSheet from "@/components/map/SosSheet";
import EasterEggSheet from "@/components/map/EasterEggSheet";
import PhotoLightbox from "@/components/map/PhotoLightbox";
import HomeMessageModal from "@/components/map/HomeMessageModal";
import AreaSelectorModal from "@/components/map/AreaSelectorModal";

interface HomeModalsAndSheetsProps {
  showOnlineList: boolean;
  setShowOnlineList: (show: boolean) => void;
  showBikerList: boolean;
  setShowBikerList: (show: boolean) => void;
  showZavorrinaList: boolean;
  setShowZavorrinaList: (show: boolean) => void;
  showOfflineOnline: boolean;
  setShowOfflineOnline: (show: boolean) => void;
  onlineListQuery: any;
  bikerListQuery: any;
  zavListQuery: any;
  offlineCountdown: number;
  startOfflineTimer: () => void;
  handleLocateUser: (user: any) => void;
  
  selectedUser: any;
  setSelectedUser: (user: any) => void;
  selectedUserDetail: any;
  selectedUserProposals: any[];
  detailLoading: boolean;
  setSelectedMapPhoto: (uri: string | null) => void;
  myOrganizedEvents: any[];
  targetUserEventIds: any[];
  
  activeSosRequests: any[];
  showSosDetail: boolean;
  setShowSosDetail: (show: boolean) => void;
  acceptSosMutation: any;
  
  selectedEgg: any;
  setSelectedEgg: (egg: any) => void;
  collectEggMutation: any;
  
  selectedMapPhoto: string | null;
  
  showHomeMessage: boolean;
  setShowHomeMessage: (show: boolean) => void;
  homeMessageText: string;
  
  showAreaModal: boolean;
  setShowAreaModal: (show: boolean) => void;
  selectedCountries: string[];
  toggleCountryInModal: (code: string) => void;
  toggleContinentInModal: (code: string) => void;
  saveCountries: (countries: string[]) => void;
  
  onToggleOfflineOnline: () => void;
  user: any;
  t: (key: string) => string;
}

export const HomeModalsAndSheets: React.FC<HomeModalsAndSheetsProps> = ({
  showOnlineList,
  setShowOnlineList,
  showBikerList,
  setShowBikerList,
  showZavorrinaList,
  setShowZavorrinaList,
  showOfflineOnline,
  setShowOfflineOnline: _setShowOfflineOnline,
  onlineListQuery,
  bikerListQuery,
  zavListQuery,
  offlineCountdown,
  startOfflineTimer: _startOfflineTimer,
  handleLocateUser,
  
  selectedUser,
  setSelectedUser,
  selectedUserDetail,
  selectedUserProposals,
  detailLoading,
  setSelectedMapPhoto,
  myOrganizedEvents,
  targetUserEventIds,
  
  activeSosRequests,
  showSosDetail,
  setShowSosDetail,
  acceptSosMutation,
  
  selectedEgg,
  setSelectedEgg,
  collectEggMutation,
  
  selectedMapPhoto,
  
  showHomeMessage,
  setShowHomeMessage,
  homeMessageText,
  
  showAreaModal,
  setShowAreaModal,
  selectedCountries,
  toggleCountryInModal,
  toggleContinentInModal,
  saveCountries,
  
  onToggleOfflineOnline,
  user,
  t,
}) => {
  return (
    <>
      <SosSheet
        activeSosRequests={activeSosRequests}
        currentUserId={user?.id}
        showDetail={showSosDetail}
        onOpenDetail={() => setShowSosDetail(true)}
        onCloseDetail={() => setShowSosDetail(false)}
        onAccept={(id) => acceptSosMutation.mutate(id)}
        accepting={acceptSosMutation.isPending}
      />

      <UserListSheet
        visible={showOnlineList}
        onClose={() => setShowOnlineList(false)}
        title="Utenti Online"
        icon={<Ionicons name="radio-button-on" size={20} color={Colors.success} />}
        data={onlineListQuery.data}
        isLoading={onlineListQuery.isLoading}
        emptyIcon={<Ionicons name="people-outline" size={32} color={Colors.textSecondary} />}
        emptyText={t("home.noUsersOnline")}
        currentUserId={user?.id}
        onLocateUser={handleLocateUser}
        showMoto={true}
        showOfflineToggle={true}
        showOffline={showOfflineOnline}
        offlineCountdown={offlineCountdown}
        onToggleOffline={onToggleOfflineOnline}
      />

      <UserListSheet
        visible={showBikerList}
        onClose={() => setShowBikerList(false)}
        title={`${t("profile.bikerType")} ${t("home.available")}`}
        icon={<Ionicons name="hand-left" size={20} color={Colors.accent} />}
        data={bikerListQuery.data}
        isLoading={bikerListQuery.isLoading}
        emptyIcon={<Ionicons name="bicycle" size={32} color={Colors.textSecondary} />}
        emptyText={t("map.noBikerAvailable")}
        currentUserId={user?.id}
        onLocateUser={handleLocateUser}
        showMoto={true}
      />

      <UserListSheet
        visible={showZavorrinaList}
        onClose={() => setShowZavorrinaList(false)}
        title={`${t("profile.zavorrinaType")} ${t("home.available")}`}
        icon={<MaterialCommunityIcons name="seat-passenger" size={20} color={Colors.femaleIcon} />}
        data={zavListQuery.data}
        isLoading={zavListQuery.isLoading}
        emptyIcon={<MaterialCommunityIcons name="seat-passenger" size={32} color={Colors.textSecondary} />}
        emptyText={t("match.noPassenger")}
        currentUserId={user?.id}
        onLocateUser={handleLocateUser}
      />

      <UserDetailSheet
        selectedUser={selectedUser}
        selectedUserDetail={selectedUserDetail}
        selectedUserProposals={selectedUserProposals}
        detailLoading={detailLoading}
        onClose={() => setSelectedUser(null)}
        onPhotoPress={(uri) => setSelectedMapPhoto(uri)}
        myOrganizedEvents={myOrganizedEvents}
        targetUserEventIds={targetUserEventIds}
        currentUserId={user?.id}
      />

      <EasterEggSheet
        egg={selectedEgg}
        onClose={() => setSelectedEgg(null)}
        onCollect={(id) => collectEggMutation.mutate(id)}
        collecting={collectEggMutation.isPending}
      />

      <PhotoLightbox photoUri={selectedMapPhoto} onClose={() => setSelectedMapPhoto(null)} />

      <HomeMessageModal
        visible={showHomeMessage}
        text={homeMessageText}
        onClose={() => setShowHomeMessage(false)}
      />

      <AreaSelectorModal
        visible={showAreaModal}
        selectedCountries={selectedCountries}
        onToggleCountry={toggleCountryInModal}
        onToggleContinent={toggleContinentInModal}
        onSave={() => saveCountries(selectedCountries)}
        onClose={() => setShowAreaModal(false)}
      />
    </>
  );
};
