// Minimal, dependency-free JSON syntax highlighter. Escapes the input FIRST so
// untrusted response bodies can't inject markup, then wraps tokens in spans.
// The Tailwind classes are written as literals so the scanner keeps them.

export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

const TOKEN =
  /"(?:\\.|[^"\\])*"(?:\s*:)?|\b(?:true|false)\b|\bnull\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g;

/** Return HTML (already escaped) with JSON tokens wrapped in colored spans. */
export function highlightJson(json: string): string {
  return escapeHtml(json).replace(TOKEN, (match) => {
    let cls = "text-emerald-300"; // number
    if (match[0] === '"') {
      cls = match.trimEnd().endsWith(":") ? "text-sky-300" : "text-amber-200"; // key : value
    } else if (match === "true" || match === "false") {
      cls = "text-violet-300";
    } else if (match === "null") {
      cls = "text-rose-400";
    }
    return `<span class="${cls}">${match}</span>`;
  });
}
