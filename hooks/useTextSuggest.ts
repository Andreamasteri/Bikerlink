import { useEffect, useState } from "react";
import { getApiUrl, authFetchHeaders } from "@/lib/query-client";

/**
 * Hook "intendevi?" (Task #2518).
 *
 * Chiama l'endpoint /api/text-interpreter/suggest dopo `debounceMs` ms di
 * inattività e ritorna i suggerimenti fuzzy + match alias. Niente fetch se
 * il valore corrente combacia con `currentExact` (case-insensitive trim) —
 * in quel caso non c'è bisogno di suggerire nulla.
 */
export interface TextSuggestResult {
  alias: { value: string; confidence: number } | null;
  fuzzy: Array<{ value: string; similarity: number }>;
  exact: { value: string } | null;
}

export function useTextSuggest(
  value: string,
  category: string,
  opts: { debounceMs?: number; minLength?: number; enabled?: boolean } = {},
): { suggestions: TextSuggestResult | null; loading: boolean } {
  const { debounceMs = 350, minLength = 3, enabled = true } = opts;
  const [suggestions, setSuggestions] = useState<TextSuggestResult | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!enabled || !value || value.trim().length < minLength) {
      setSuggestions(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const handle = setTimeout(async () => {
      try {
        const headers = await authFetchHeaders();
        const url = new URL("/api/text-interpreter/suggest", getApiUrl());
        url.searchParams.set("q", value);
        url.searchParams.set("category", category);
        url.searchParams.set("limit", "3");
        const res = await fetch(url.toString(), { headers, credentials: "include" });
        if (!res.ok) {
          if (!cancelled) setSuggestions(null);
          return;
        }
        const json = await res.json();
        if (!cancelled) {
          setSuggestions({
            alias: json.alias ? { value: json.alias.value, confidence: json.alias.confidence } : null,
            fuzzy: Array.isArray(json.fuzzy) ? json.fuzzy : [],
            exact: json.exact ? { value: json.exact.value } : null,
          });
        }
      } catch {
        if (!cancelled) setSuggestions(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, debounceMs);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [value, category, debounceMs, minLength, enabled]);

  return { suggestions, loading };
}
