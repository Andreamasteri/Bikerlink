import { QueryClient, QueryFunction } from "@tanstack/react-query";

export function getApiUrl(): string {
  let host = process.env.EXPO_PUBLIC_DOMAIN;

  if (!host) {
    host = "biker-link.replit.app";
  }

  let url = new URL(`https://${host}`);

  // Strip trailing slash so string concatenation like `${getApiUrl()}${path}` works correctly.
  return url.href.replace(/\/$/, "");
}

function handleUnauthorized() {
  queryClient.setQueryData(["/api/auth/me"], null);
}

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const contentType = res.headers.get("content-type") || "";
    if (contentType.includes("text/html")) {
      throw new Error("Server non disponibile. Riprova tra un momento.");
    }
    const text = (await res.text()) || res.statusText;
    if (text.trimStart().startsWith("<!DOCTYPE") || text.trimStart().startsWith("<html")) {
      throw new Error("Server non disponibile. Riprova tra un momento.");
    }
    throw new Error(`${res.status}: ${text}`);
  }
}

export async function apiRequest(
  method: string,
  route: string,
  data?: unknown | undefined,
): Promise<Response> {
  const baseUrl = getApiUrl();
  const url = new URL(route, baseUrl);

  const res = await fetch(url.toString(), {
    method,
    headers: data ? { "Content-Type": "application/json" } : {},
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

  if (res.status === 401 && !route.includes("/api/auth/")) {
    handleUnauthorized();
  }

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const baseUrl = getApiUrl();
    const url = new URL(queryKey.join("/") as string, baseUrl);

    const res = await fetch(url.toString(), {
      credentials: "include",
    });

    if (res.status === 401) {
      const isAuthQuery = (queryKey[0] as string)?.includes("/api/auth/");
      if (!isAuthQuery) {
        handleUnauthorized();
      }
      if (unauthorizedBehavior === "returnNull") {
        return null;
      }
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "returnNull" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
