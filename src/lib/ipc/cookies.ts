import { call } from "./client";
import type { Cookie } from "#lib/types";

/** Fetch all stored cookies for the active workspace, optionally filtered by domain. */
export async function getCookies(domain?: string): Promise<Cookie[]> {
  return call<Cookie[]>("get_cookies", { domain });
}

/** Create or update a cookie in the active workspace. */
export async function saveCookie(cookie: Cookie): Promise<void> {
  return call<void>("save_cookie", { cookie });
}

/** Delete a cookie by its unique ID. */
export async function deleteCookie(id: string): Promise<void> {
  return call<void>("delete_cookie", { id });
}

/** Clear all cookies for the active workspace (or a specific domain). */
export async function clearCookies(domain?: string): Promise<void> {
  return call<void>("clear_cookies", { domain });
}
