import Colors from "@/constants/colors";
import { Ionicons } from "@expo/vector-icons";

interface UserLike {
  userType?: string | null;
  sex?: string | null;
}

export function getUserColor(u: UserLike): string {
  if (u.userType === "coppia") return Colors.accent;
  if (u.sex === "F") return Colors.femaleIcon;
  if (u.sex === "M") return Colors.maleIcon;
  if (u.userType?.startsWith("zavorrina")) return Colors.femaleIcon;
  if (u.userType?.startsWith("biker")) return Colors.maleIcon;
  return Colors.accent;
}

export function getUserTypeLabel(u: UserLike, t: (key: string) => string): string {
  if (u.userType?.startsWith("biker")) return t("profile.bikerType");
  if (u.userType?.startsWith("zavorrina")) return t("profile.zavorrinaType");
  return t("profile.coupleType");
}

export function getUserIcon(u: UserLike): keyof typeof Ionicons.glyphMap {
  if (u.userType === "coppia") return "people";
  if (u.userType?.startsWith("zavorrina")) return "person";
  return "bicycle";
}
