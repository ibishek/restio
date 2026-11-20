import { getAppVersion } from "#lib/ipc/app";
import { checkForUpdates, GITHUB_RELEASES_URL } from "#lib/utils/version";
import { openExternalUrl } from "#lib/ipc/opener";
import { toast } from "#lib/components/ui/toasts.svelte";

export interface UpdaterState {
  currentVersion: string;
  latestVersion: string | null;
  updateAvailable: boolean;
  checking: boolean;
  releasesUrl: string;
}

export const updater = $state<UpdaterState>({
  currentVersion: typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "0.1.0",
  latestVersion: null,
  updateAvailable: false,
  checking: false,
  releasesUrl: GITHUB_RELEASES_URL,
});

/**
 * Initialize the updater on app startup. Checks cache or remote silently in background.
 */
export async function initUpdater(): Promise<void> {
  try {
    updater.currentVersion = await getAppVersion();
    const result = await checkForUpdates(updater.currentVersion);
    if (result.updateAvailable && result.latestVersion) {
      updater.latestVersion = result.latestVersion;
      updater.updateAvailable = true;
    }
  } catch {
    // Fail silently on app startup
  }
}

/**
 * Trigger an explicit, manual update check (e.g. from Command Palette or Settings).
 * Shows toast notifications with user feedback.
 */
export async function manualCheckForUpdates(): Promise<void> {
  if (updater.checking) return;
  updater.checking = true;

  try {
    updater.currentVersion = await getAppVersion();
    const result = await checkForUpdates(updater.currentVersion, { force: true });
    updater.checking = false;

    if (result.error) {
      toast.warn("Could not check for updates", "Please check your network connection.");
      return;
    }

    if (result.updateAvailable && result.latestVersion) {
      updater.latestVersion = result.latestVersion;
      updater.updateAvailable = true;
      toast.info(
        `RestIO v${result.latestVersion} is available!`,
        "Click the version badge or releases link to download.",
      );
    } else {
      updater.updateAvailable = false;
      toast.success(`RestIO is up to date (v${updater.currentVersion}).`);
    }
  } catch (err) {
    updater.checking = false;
    toast.warn("Update check failed", err instanceof Error ? err.message : String(err));
  }
}

/**
 * Open the release page in the user's default browser.
 */
export async function openReleasePage(): Promise<void> {
  try {
    await openExternalUrl(updater.releasesUrl);
  } catch (err) {
    console.error("Failed to open release page:", err);
  }
}
