export const REMOTE_VERSION_URL = "https://raw.githubusercontent.com/ibishek/restio/main/.version";
export const GITHUB_RELEASES_URL = "https://github.com/ibishek/restio/releases/latest";

const CACHE_KEY = "restio_update_cache";
const CACHE_TTL_MS = 4 * 60 * 60 * 1000; // 4 hours

export interface SemVer {
  major: number;
  minor: number;
  patch: number;
  prerelease?: string;
}

export interface UpdateCheckResult {
  currentVersion: string;
  latestVersion: string | null;
  updateAvailable: boolean;
  releasesUrl: string;
  error?: string;
}

/**
 * Parse a semver string (e.g. "0.1.0", "v1.2.3-beta.1").
 */
export function parseSemver(v: string): SemVer | null {
  if (!v || typeof v !== "string") return null;
  const match = v.trim().match(/^v?(\d+)\.(\d+)\.(\d+)(?:-([a-zA-Z0-9.-]+))?$/);
  if (!match) return null;
  return {
    major: parseInt(match[1], 10),
    minor: parseInt(match[2], 10),
    patch: parseInt(match[3], 10),
    prerelease: match[4],
  };
}

/**
 * Compare two semver strings. Returns true if `remote` is strictly newer than `current`.
 */
export function isNewerVersion(remote: string, current: string): boolean {
  const r = parseSemver(remote);
  const c = parseSemver(current);
  if (!r || !c) return false;

  if (r.major !== c.major) return r.major > c.major;
  if (r.minor !== c.minor) return r.minor > c.minor;
  if (r.patch !== c.patch) return r.patch > c.patch;

  // If major.minor.patch are identical, a non-prerelease is newer than a prerelease
  if (c.prerelease && !r.prerelease) return true;

  return false;
}

/**
 * Check if a newer version of RestIO is published.
 * Fails safely/silently on network failures or offline mode.
 */
export async function checkForUpdates(
  currentVersion: string,
  options?: { force?: boolean; fetchFn?: typeof fetch },
): Promise<UpdateCheckResult> {
  const fetcher = options?.fetchFn ?? (typeof fetch !== "undefined" ? fetch : undefined);

  // 1. Check local cache if not forced
  if (!options?.force && typeof localStorage !== "undefined") {
    try {
      const cached = localStorage.getItem(CACHE_KEY);
      if (cached) {
        const { timestamp, latestVersion } = JSON.parse(cached);
        if (
          typeof timestamp === "number" &&
          Date.now() - timestamp < CACHE_TTL_MS &&
          typeof latestVersion === "string"
        ) {
          return {
            currentVersion,
            latestVersion,
            updateAvailable: isNewerVersion(latestVersion, currentVersion),
            releasesUrl: GITHUB_RELEASES_URL,
          };
        }
      }
    } catch {
      // Ignore cache parse error
    }
  }

  if (!fetcher) {
    return {
      currentVersion,
      latestVersion: null,
      updateAvailable: false,
      releasesUrl: GITHUB_RELEASES_URL,
      error: "fetch is not available",
    };
  }

  // 2. Fetch remote version
  try {
    const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timeoutId = controller ? setTimeout(() => controller.abort(), 6000) : null;

    const res = await fetcher(REMOTE_VERSION_URL, {
      signal: controller ? controller.signal : undefined,
      cache: "no-store",
    });

    if (timeoutId) clearTimeout(timeoutId);

    if (!res.ok) {
      return {
        currentVersion,
        latestVersion: null,
        updateAvailable: false,
        releasesUrl: GITHUB_RELEASES_URL,
        error: `HTTP ${res.status}`,
      };
    }

    const text = (await res.text()).trim();
    if (!parseSemver(text)) {
      return {
        currentVersion,
        latestVersion: null,
        updateAvailable: false,
        releasesUrl: GITHUB_RELEASES_URL,
        error: `Invalid semver: ${text}`,
      };
    }

    // Cache valid response
    if (typeof localStorage !== "undefined") {
      try {
        localStorage.setItem(
          CACHE_KEY,
          JSON.stringify({ timestamp: Date.now(), latestVersion: text }),
        );
      } catch {
        // Ignore localStorage write errors
      }
    }

    return {
      currentVersion,
      latestVersion: text,
      updateAvailable: isNewerVersion(text, currentVersion),
      releasesUrl: GITHUB_RELEASES_URL,
    };
  } catch (err) {
    return {
      currentVersion,
      latestVersion: null,
      updateAvailable: false,
      releasesUrl: GITHUB_RELEASES_URL,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
