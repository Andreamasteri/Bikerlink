export function parseApiError(err: unknown, fallback: string): string {
  return (err instanceof Error ? err.message : null) || fallback;
}
