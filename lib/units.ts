import type { DistanceUnit, SpeedUnit, TimeFormat } from "./units-context";

export function convertDistance(
  km: number,
  unit: DistanceUnit
): { value: number; label: string } {
  switch (unit) {
    case "mi_ft":
    case "mi_yd":
      return { value: km * 0.621371, label: "mi" };
    case "nmi_ftm":
      return { value: km * 0.539957, label: "nmi" };
    case "km_m":
    default:
      return { value: km, label: "km" };
  }
}

export function formatDistance(
  km: number,
  unit: DistanceUnit,
  decimals = 2
): string {
  const { value, label } = convertDistance(km, unit);
  return `${value.toFixed(decimals)} ${label}`;
}

export function convertSpeed(
  kmh: number,
  unit: SpeedUnit
): { value: number; label: string } {
  switch (unit) {
    case "mph":
      return { value: kmh * 0.621371, label: "mph" };
    case "knots":
      return { value: kmh * 0.539957, label: "kn" };
    case "kmh":
    default:
      return { value: kmh, label: "km/h" };
  }
}

export function formatSpeed(
  kmh: number,
  unit: SpeedUnit,
  decimals = 1
): string {
  const { value, label } = convertSpeed(kmh, unit);
  return `${value.toFixed(decimals)} ${label}`;
}

export function formatDateTime(
  dateStr: string,
  locale: string,
  timeFormat: TimeFormat
): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString(locale, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: timeFormat === "12h",
  });
}

export function formatDate(dateStr: string, locale: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString(locale, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}
