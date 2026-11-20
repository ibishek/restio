export interface ServerTimingMetric {
  name: string;
  duration?: number; // Duration in milliseconds
  description?: string;
  isFlag: boolean;
}

export interface ServerTimingSummary {
  metrics: ServerTimingMetric[];
  totalServerDurationMs: number;
  clientRoundTripMs: number;
  networkLatencyMs: number;
  hasTimings: boolean;
}

/**
 * Split a header string by commas, ignoring commas inside quoted strings.
 */
function splitEntries(headerValue: string): string[] {
  const entries: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < headerValue.length; i++) {
    const char = headerValue[i];

    if (char === '"' && (i === 0 || headerValue[i - 1] !== "\\")) {
      inQuotes = !inQuotes;
      current += char;
    } else if (char === "," && !inQuotes) {
      if (current.trim()) {
        entries.push(current.trim());
      }
      current = "";
    } else {
      current += char;
    }
  }

  if (current.trim()) {
    entries.push(current.trim());
  }

  return entries;
}

/**
 * Strip surrounding quotes from a string if present.
 */
function unquote(str: string): string {
  const trimmed = str.trim();
  if (trimmed.startsWith('"') && trimmed.endsWith('"') && trimmed.length >= 2) {
    return trimmed.slice(1, -1).replace(/\\"/g, '"');
  }
  return trimmed;
}

/**
 * Parse a single Server-Timing entry (e.g. `db;dur=123.4;desc="Query"`).
 */
export function parseSingleTiming(entry: string): ServerTimingMetric | null {
  const parts = entry
    .split(";")
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length === 0) return null;

  const name = parts[0];
  let duration: number | undefined;
  let description: string | undefined;

  for (let i = 1; i < parts.length; i++) {
    const part = parts[i];
    const eqIdx = part.indexOf("=");

    if (eqIdx !== -1) {
      const key = part.slice(0, eqIdx).trim().toLowerCase();
      const val = part.slice(eqIdx + 1).trim();

      if (key === "dur") {
        const parsed = parseFloat(val);
        if (!isNaN(parsed) && isFinite(parsed)) {
          duration = Math.max(0, parsed);
        }
      } else if (key === "desc") {
        description = unquote(val);
      }
    }
  }

  return {
    name,
    duration,
    description,
    isFlag: duration === undefined,
  };
}

/**
 * Parse one or multiple Server-Timing headers into structured metrics.
 */
export function parseServerTiming(headerValue?: string | string[]): ServerTimingMetric[] {
  if (!headerValue) return [];

  const rawValues = Array.isArray(headerValue) ? headerValue : [headerValue];
  const allEntries: string[] = [];

  for (const raw of rawValues) {
    if (typeof raw === "string" && raw.trim()) {
      allEntries.push(...splitEntries(raw));
    }
  }

  const metrics: ServerTimingMetric[] = [];
  for (const entry of allEntries) {
    const parsed = parseSingleTiming(entry);
    if (parsed) {
      metrics.push(parsed);
    }
  }

  return metrics;
}

/**
 * Extract and summarize Server-Timing metrics from response headers and client round-trip time.
 */
export function summarizeServerTiming(
  headers: Record<string, string> | undefined,
  clientRoundTripMs: number,
): ServerTimingSummary {
  let headerValue: string | undefined;

  if (headers) {
    for (const [key, value] of Object.entries(headers)) {
      if (key.toLowerCase() === "server-timing") {
        headerValue = value;
        break;
      }
    }
  }

  const metrics = parseServerTiming(headerValue);
  let totalServerDurationMs = 0;

  for (const m of metrics) {
    if (typeof m.duration === "number") {
      totalServerDurationMs += m.duration;
    }
  }

  totalServerDurationMs = Math.round(totalServerDurationMs * 100) / 100;
  const networkLatencyMs = Math.max(
    0,
    Math.round((clientRoundTripMs - totalServerDurationMs) * 100) / 100,
  );

  return {
    metrics,
    totalServerDurationMs,
    clientRoundTripMs,
    networkLatencyMs,
    hasTimings: metrics.length > 0,
  };
}
