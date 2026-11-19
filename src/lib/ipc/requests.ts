import type { HttpRequest, HttpResponse } from "#lib/types";
import { call } from "./client";

/** Send a request through the Rust HTTP engine, tagged with a run-id. */
export const sendRequest = (runId: string, req: HttpRequest) =>
  call<HttpResponse>("send_request", { runId, req });

/** Abort an in-flight request by its run-id. */
export const cancelRequest = (runId: string) => call<void>("cancel_request", { runId });
