import type { HttpRequest, HttpResponse, StreamChunk } from "#lib/types";
import { call, Channel } from "./client";

/** Send a request through the Rust HTTP engine, tagged with a run-id. */
export const sendRequest = (
  runId: string,
  req: HttpRequest,
  onChunk?: (chunk: StreamChunk) => void,
) => {
  const onStream = new Channel<StreamChunk>(onChunk);
  return call<HttpResponse>("send_request", { runId, req, onStream });
};

/** Abort an in-flight request by its run-id. */
export const cancelRequest = (runId: string) => call<void>("cancel_request", { runId });
