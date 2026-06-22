import Colors from "@/constants/colors";

export function userTypeColor(userType: string): string {
  switch (userType) {
    case "biker": return Colors.maleIcon;
    case "zavorrina": return Colors.femaleIcon;
    case "coppia": return Colors.coupleIcon;
    default: return Colors.textSecondary;
  }
}

export function userTypeLabel(userType: string): string {
  switch (userType) {
    case "biker": return "B";
    case "zavorrina": return "Z";
    case "coppia": return "C";
    default: return "?";
  }
}

export function userRoleText(userType: string): string {
  switch (userType) {
    case "biker": return "biker";
    case "zavorrina": return "zavorrina";
    case "coppia": return "coppia";
    default: return userType;
  }
}

export const TYPE_LABELS: { key: string; label: string; color: string }[] = [
  { key: "bikerBikerBrand",            label: "B-B",     color: Colors.accent },
  { key: "bikerClubBrand",             label: "B-Club",  color: "#9C27B0" },
  { key: "bikerBikerTypeStyle",        label: "Tipo BB", color: "#2196F3" },
  { key: "bikerBikerDistance",         label: "Dist BB", color: Colors.success },
  { key: "bikerBikerMusic",            label: "Mus BB",  color: "#FF5722" },
  { key: "bikerBikerLeanAngle",        label: "Piega",   color: "#795548" },
  { key: "bikerBikerRouteTypeZone",    label: "Zona BB", color: "#607D8B" },
  { key: "bikerBikerAvgSpeed",         label: "Speed",   color: Colors.warning },
  { key: "bikerBikerAvgDuration",      label: "Dur",     color: "#FFA726" },
  { key: "bikerBikerDayTime",          label: "Orario",  color: "#FFCC02" },
  { key: "bikerBikerEvents",           label: "Eventi",  color: "#26C6DA" },
];

export const BZ_TYPE_LABELS: { key: string; label: string; color: string }[] = [
  { key: "bikerZavorrinaBrand",         label: "B-Z",     color: "#E91E8C" },
  { key: "bikerZavorrinaBase",          label: "Intento", color: "#C2185B" },
  { key: "zavorrinaClubBrand",          label: "Z-Club",  color: "#673AB7" },
  { key: "bikerZavorrinaTypeStyle",     label: "Tipo BZ", color: "#03A9F4" },
  { key: "bikerZavorrinaDistance",      label: "Dist BZ", color: "#66BB6A" },
  { key: "bikerZavorrinaMusic",         label: "Mus BZ",  color: "#FF7043" },
  { key: "bikerZavorrinaRouteTypeZone", label: "Zona BZ", color: "#78909C" },
];
