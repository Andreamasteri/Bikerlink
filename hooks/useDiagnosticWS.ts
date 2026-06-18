import { useEffect, useState } from "react";
import {
  getDiagnosticWSConnState,
  subscribeDiagnosticWSConnState,
  type DiagWSConnState,
} from "@/lib/diagnostic/ws-client";

/**
 * Subscribe to the diagnostic WebSocket connection state.
 * Returns "connected" (🟢 live WS) or "polling" (🟡 60s remote polling fallback).
 * Available to every authenticated user, not just admins.
 */
export function useDiagnosticWS(): DiagWSConnState {
  const [state, setState] = useState<DiagWSConnState>(getDiagnosticWSConnState);

  useEffect(() => {
    return subscribeDiagnosticWSConnState(setState);
  }, []);

  return state;
}
