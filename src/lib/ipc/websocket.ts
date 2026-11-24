import type { KeyValue, WsEvent, WsOutboundMessage } from "#lib/types";
import { call, Channel } from "./client";

/** Initiate a WebSocket connection to the given endpoint. */
export const wsConnect = (
  connectionId: string,
  url: string,
  headers: KeyValue[],
  dangerAcceptInvalidCerts: boolean,
  onEvent: (event: WsEvent) => void,
) => {
  const channel = new Channel<WsEvent>(onEvent);
  return call<void>("ws_connect", {
    connectionId,
    url,
    headers,
    dangerAcceptInvalidCerts,
    onEvent: channel,
  });
};

/** Send a message (text, binary, or ping) over an active WebSocket connection. */
export const wsSend = (connectionId: string, message: WsOutboundMessage) =>
  call<void>("ws_send", { connectionId, message });

/** Terminate a WebSocket connection cleanly. */
export const wsDisconnect = (connectionId: string, code?: number, reason?: string) =>
  call<void>("ws_disconnect", { connectionId, code, reason });
