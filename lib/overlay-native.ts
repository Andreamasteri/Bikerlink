import { NativeModules, Platform, Linking } from "react-native";

const { BikerLinkOverlay } = NativeModules;

const isSupported = Platform.OS === "android" && !!BikerLinkOverlay;
const APP_PACKAGE = "com.bikerlink.app";

export const OverlayNative = {
  checkPermission: (): Promise<boolean> => {
    if (!isSupported) return Promise.resolve(false);
    return BikerLinkOverlay.checkPermission();
  },

  requestPermission: (): void => {
    if (!isSupported) {
      Linking.openURL(
        `intent://package:${APP_PACKAGE}#Intent;scheme=package;action=android.settings.action.MANAGE_OVERLAY_PERMISSION;end`
      ).catch(() => {
        Linking.openSettings().catch(() => {});
      });
      return;
    }
    BikerLinkOverlay.requestPermission();
  },

  showOverlay: (badgeChat: number, badgeNotif: number): void => {
    if (!isSupported) return;
    BikerLinkOverlay.showOverlay(badgeChat, badgeNotif);
  },

  hideOverlay: (): void => {
    if (!isSupported) return;
    BikerLinkOverlay.hideOverlay();
  },

  updateBadges: (badgeChat: number, badgeNotif: number): void => {
    if (!isSupported) return;
    BikerLinkOverlay.updateBadges(badgeChat, badgeNotif);
  },
};
