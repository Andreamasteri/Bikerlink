import { useEffect, useRef } from "react";
import { router } from "expo-router";
import { useAuth } from "@/lib/auth-context";
import { getApiUrl, authFetchHeaders } from "@/lib/query-client";

// Polling diagnostico remoto: ogni 60s controlla se un admin ha richiesto un run
// diagnostico. Se pendente, esegue silenziosamente in background e invia il report
// con triggeredBy="remote". Per admin/moderatori naviga alla schermata risultati.
//
// SEPARAZIONE NAVIGAZIONE/CONTEXT (Task #5071): questa logica viveva in
// AuthProvider ed era l'unico side-effect di navigazione (router.push) dentro il
// context auth. È stata estratta qui — un componente provider-free montato nel
// layout — così auth-context non chiama più router.replace/push. Usa il singleton
// `router` di expo-router (stabile, non l'hook useRouter) quindi nessun rischio di
// loop "router in deps" documentato in router-in-useEffect-deps.md.
export function RemoteDiagnosticPoller() {
  const { user } = useAuth();
  const remoteDiagRunningRef = useRef(false);

  useEffect(() => {
    if (!user) return;
    const poll = async () => {
      if (remoteDiagRunningRef.current) return;
      try {
        const res = await fetch(new URL("/api/diagnostic/pending", getApiUrl()).toString(), {
          headers: authFetchHeaders(),
          credentials: "include",
        });
        if (!res.ok) return;
        const data = await res.json() as { pending?: boolean };
        if (!data?.pending) return;
        remoteDiagRunningRef.current = true;
        try {
          const role = user?.role;
          const isAdminOrMod = role === "admin" || role === "moderatore" || role === "moderator";
          const { runAllTests } = await import("@/lib/diagnostic/runner");
          const report = await runAllTests({ isAdmin: role === "admin" });
          const { apiRequest: req } = await import("@/lib/query-client");
          await req("POST", "/api/diagnostic/report", {
            triggeredBy: "remote",
            appVersion: report.appVersion,
            platform: report.platform,
            deviceModel: report.deviceModel,
            sentryEventId: report.sentryEventId,
            summary: report.summary,
            results: report.results,
          });
          if (isAdminOrMod) {
            try {
              router.push({
                pathname: "/diagnostica-risultati",
                params: { reportJson: JSON.stringify(report) },
              } as never);
            } catch {
              // best-effort: navigazione non critica
            }
          }
        } catch {
          // best-effort: silently skip on errors
        } finally {
          remoteDiagRunningRef.current = false;
        }
      } catch {
        // network error — skip silently
      }
    };

    poll();
    const interval = setInterval(poll, 60_000);
    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!user]);

  return null;
}
