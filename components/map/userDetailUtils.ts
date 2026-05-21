import Colors from "@/constants/colors";

export function formatLastSeen(dateStr: string | null | undefined): string {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "";
  const dd = String(d.getDate()).padStart(2, "0");
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const yy = String(d.getFullYear()).slice(-2);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${dd}/${mo}/'${yy} - ${hh}.${mm}`;
}

export function getUserColor(u: any): string {
  if (u?.userType === "coppia") return Colors.accent;
  if (u?.sex === "F") return Colors.femaleIcon;
  if (u?.sex === "M") return Colors.maleIcon;
  if (u?.userType?.startsWith("zavorrina")) return Colors.femaleIcon;
  if (u?.userType?.startsWith("biker")) return Colors.maleIcon;
  return Colors.accent;
}

export function getUserIcon(u: any): "people" | "person" | "bicycle" {
  if (u?.userType === "coppia") return "people";
  if (u?.userType?.startsWith("zavorrina")) return "person";
  return "bicycle";
}

export function getUserTypeLabel(u: any, t: (k: string) => string): string {
  if (u?.userType?.startsWith("biker")) return t("profile.bikerType");
  if (u?.userType?.startsWith("zavorrina")) return t("profile.zavorrinaType");
  return t("profile.coupleType");
}
