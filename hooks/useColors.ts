import { useTheme } from "@/lib/theme-context";
import type { ThemeColors } from "@/constants/colors";

export function useColors(): ThemeColors {
  const { colors } = useTheme();
  return colors;
}
