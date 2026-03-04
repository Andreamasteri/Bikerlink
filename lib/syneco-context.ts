import { useQuery } from "@tanstack/react-query";

export function useSynecoVisible(): boolean {
  const { data } = useQuery({ queryKey: ["/api/settings/syneco-branding"] });
  return (data as any)?.visible === true;
}
