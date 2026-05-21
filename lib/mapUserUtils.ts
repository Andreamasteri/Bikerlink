import Colors from "@/constants/colors";
import { Ionicons } from "@expo/vector-icons";

export function getUserColor(u: any): string {
  if (u.userType === "coppia") return Colors.accent;
  if (u.sex === "F") return Colors.femaleIcon;
  if (u.sex === "M") return Colors.maleIcon;
  if (u.userType?.startsWith("zavorrina")) return Colors.femaleIcon;
  if (u.userType?.startsWith("biker")) return Colors.maleIcon;
  return Colors.accent;
}

export function getUserTypeLabel(u: any, t: (key: string) => string): string {
  if (u.userType?.startsWith("biker")) return t("profile.bikerType");
  if (u.userType?.startsWith("zavorrina")) return t("profile.zavorrinaType");
  return t("profile.coupleType");
}

export function getUserIcon(u: any): keyof typeof Ionicons.glyphMap {
  if (u.userType === "coppia") return "people";
  if (u.userType?.startsWith("zavorrina")) return "person";
  return "bicycle";
}
