export type {
  BridgeEventType,
  BridgeEvent,
  BridgeCommandType,
  BridgeCommand,
} from "@/lib/maplibre/bridge-events";

export { parseMessage, buildCommand } from "@/lib/maplibre/bridge-events";

export const OL_BRIDGE_RECEIVE_SCRIPT = `
function postMsg(data) {
  var json = JSON.stringify(data);
  if (window.ReactNativeWebView) {
    window.ReactNativeWebView.postMessage(json);
  } else {
    window.parent.postMessage(json, "*");
  }
}
`;

export const OL_BRIDGE_SEND_LISTENER = `
window.addEventListener("message", function(e) {
  var msg;
  try { msg = JSON.parse(e.data); } catch(err) { return; }
  if (!msg || !msg.cmd) return;
  if (window.olBridge && typeof window.olBridge[msg.cmd] === "function") {
    window.olBridge[msg.cmd](msg.payload);
  }
});
`;
