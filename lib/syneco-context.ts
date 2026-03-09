import { useSetting } from "@/lib/settings-context";

export function useSynecoVisible(): boolean {
  return useSetting("synecoBranding");
}
