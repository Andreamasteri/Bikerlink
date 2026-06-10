import type React from "react";
import { MaterialCommunityIcons, MaterialIcons, Ionicons } from "@expo/vector-icons";

export type MaterialIconName = React.ComponentProps<typeof MaterialIcons>["name"];
export type MaterialCommunityIconName = React.ComponentProps<typeof MaterialCommunityIcons>["name"];
export type IoniconsName = React.ComponentProps<typeof Ionicons>["name"];

export type AdminItem = {
  key: string;
  label: string;
  route?: string;
  accentColor?: string;
} & (
  | { iconSet: "MaterialIcons"; icon: MaterialIconName }
  | { iconSet: "MaterialCommunityIcons"; icon: MaterialCommunityIconName }
  | { iconSet: "Ionicons"; icon: IoniconsName }
);

export type AdminGroupHeader =
  | { headerIconSet: "MaterialIcons"; headerIcon: MaterialIconName }
  | { headerIconSet: "MaterialCommunityIcons"; headerIcon: MaterialCommunityIconName }
  | { headerIconSet: "Ionicons"; headerIcon: IoniconsName };

export type AdminGroup = AdminGroupHeader & {
  title: string;
  items: AdminItem[];
};
