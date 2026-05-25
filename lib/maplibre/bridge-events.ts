export type BridgeEventType =
  | "ready"
  | "tap"
  | "userPress"
  | "easterEggPress"
  | "eventPress"
  | "routeTap"
  | "coordPicked"
  | "regionChange"
  | "trackingReady"
  | "error";

export interface BridgeEvent {
  type: BridgeEventType;
  lat?: number;
  lng?: number;
  userId?: string;
  eggId?: string;
  eventId?: string;
  zoom?: number;
  message?: string;
}

export type BridgeCommandType =
  | "updateState"
  | "focusOn"
  | "updateWaypoints"
  | "updateTracking"
  | "setCoord"
  | "centerOnUser"
  | "updateHazards";

export interface BridgeCommand {
  cmd: BridgeCommandType;
  payload?: unknown;
}

export function parseMessage(data: string): BridgeEvent | null {
  try {
    return JSON.parse(data) as BridgeEvent;
  } catch {
    return null;
  }
}

export function buildCommand(cmd: BridgeCommandType, payload?: unknown): string {
  const msg: BridgeCommand = { cmd, payload };
  return JSON.stringify(msg);
}

export const BRIDGE_RECEIVE_SCRIPT = `
function postMsg(data) {
  var json = JSON.stringify(data);
  if (window.ReactNativeWebView) {
    window.ReactNativeWebView.postMessage(json);
  } else {
    window.parent.postMessage(json, "*");
  }
}
`;

export const BRIDGE_SEND_LISTENER = `
window.addEventListener("message", function(e) {
  var msg;
  try { msg = JSON.parse(e.data); } catch(err) { return; }
  if (!msg || !msg.cmd) return;
  if (window.mlBridge && typeof window.mlBridge[msg.cmd] === "function") {
    window.mlBridge[msg.cmd](msg.payload);
  }
});
`;
