// JSON body validation + pretty-printing for the request editor. Pure and
// dependency-free. Validation is advisory (non-blocking) — an invalid body can
// still be sent verbatim; we only surface the parser's complaint.

/** Bodies larger than this are not validated on every keystroke — parsing a
 *  multi-MB string per edit would stutter the editor. Mirrors the response
 *  viewer's philosophy of guarding expensive work on large payloads. */
const MAX_VALIDATE_BYTES = 512 * 1024;

export interface JsonCheck {
  /** `true` when the body is valid JSON, empty, or too large to check. */
  valid: boolean;
  /** Parser message when invalid; empty otherwise. */
  error: string;
  /** 1-based line of the error, or 0 when the engine didn't report a position. */
  line: number;
  /** 1-based column of the error, or 0 when unknown. */
  column: number;
  /** `true` when the body exceeded {@link MAX_VALIDATE_BYTES} and was skipped. */
  skipped: boolean;
}

const ok = (skipped = false): JsonCheck => ({
  valid: true,
  error: "",
  line: 0,
  column: 0,
  skipped,
});

/**
 * Validate a JSON string. Empty / whitespace-only input is treated as valid
 * (there's no body to complain about yet). Position is best-effort: some
 * engines' `JSON.parse` errors carry a character offset (`… at position N`),
 * others don't — when absent, line/column stay 0.
 */
export function checkJson(text: string): JsonCheck {
  if (!text.trim()) return ok();
  if (text.length > MAX_VALIDATE_BYTES) return ok(true);
  try {
    JSON.parse(text);
    return ok();
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    const { line, column } = locate(message, text);
    return { valid: false, error: message, line, column, skipped: false };
  }
}

/** Convert a `position N` offset (if the parser message carries one) into a
 *  1-based line/column pair within `text`. */
function locate(message: string, text: string): { line: number; column: number } {
  const m = message.match(/position (\d+)/i);
  if (!m) return { line: 0, column: 0 };
  const pos = Math.min(Number(m[1]), text.length);
  let line = 1;
  let column = 1;
  for (let i = 0; i < pos; i++) {
    if (text[i] === "\n") {
      line++;
      column = 1;
    } else {
      column++;
    }
  }
  return { line, column };
}

/** Pretty-print JSON with the given indent. Returns `null` when the input isn't
 *  valid JSON, so the caller can leave the original text untouched. */
export function formatJson(text: string, indent = 2): string | null {
  try {
    return JSON.stringify(JSON.parse(text), null, indent);
  } catch {
    return null;
  }
}
