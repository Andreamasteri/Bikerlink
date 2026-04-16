import { NativeModules, Platform, Linking } from "react-native";
import * as Application from "expo-application";

const { BikerLinkOverlay } = NativeModules;

const isSupported = Platform.OS === "android" && !!BikerLinkOverlay;

export const OverlayNative = {
  checkPermission: (): Promise<boolean> => {
    if (!isSupported) return Promise.resolve(false);
    return BikerLinkOverlay.checkPermission();
  },

  requestPermission: (): void => {
    if (!isSupported) {
      const pkg = Application.applicationId ?? "com.bikerlink.app";
      Linking.openURL(
        `intent://package:${pkg}#Intent;scheme=package;action=android.settings.action.MANAGE_OVERLAY_PERMISSION;end`
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
