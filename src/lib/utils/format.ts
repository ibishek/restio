// Small, shared display formatters. Kept pure so they can be reused across the
// response viewer, status bar, and toasts without duplicating the thresholds.

/** Human-readable byte size: `842 B`, `1.2 KB`, `3.4 MB`. */
export function humanBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Round-trip time: `142 ms` under a second, `1.24 s` beyond. */
export function humanMs(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return "0 ms";
  return ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(2)} s`;
}

/** Map a Content-Type header to an appropriate file extension. */
export function extForContentType(contentType: string): string {
  const ct = contentType.toLowerCase();
  if (ct.includes("json")) return "json";
  if (ct.includes("html")) return "html";
  if (ct.includes("svg")) return "svg";
  if (ct.includes("xml")) return "xml";
  if (ct.includes("javascript") || ct.includes("ecmascript")) return "js";
  if (ct.includes("css")) return "css";
  if (ct.includes("csv")) return "csv";
  if (ct.startsWith("image/png")) return "png";
  if (ct.startsWith("image/jpeg")) return "jpg";
  if (ct.startsWith("image/gif")) return "gif";
  if (ct.startsWith("image/webp")) return "webp";
  if (ct.startsWith("application/pdf")) return "pdf";
  if (ct.startsWith("text/")) return "txt";
  return "bin";
}

/** Generate file dialog filters based on Content-Type. */
export function saveFiltersForContentType(
  contentType: string,
): { name: string; extensions: string[] }[] {
  const ext = extForContentType(contentType);
  const filterMap: Record<string, string> = {
    json: "JSON File",
    html: "HTML Document",
    xml: "XML Document",
    js: "JavaScript File",
    css: "CSS Stylesheet",
    csv: "CSV Spreadsheet",
    png: "PNG Image",
    jpg: "JPEG Image",
    gif: "GIF Image",
    webp: "WebP Image",
    svg: "SVG Image",
    pdf: "PDF Document",
    txt: "Text Document",
  };
  const primaryName = filterMap[ext] ?? "Data File";
  return [
    { name: primaryName, extensions: [ext] },
    { name: "All Files", extensions: ["*"] },
  ];
}
