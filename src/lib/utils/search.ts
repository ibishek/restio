// Global Search & Command Palette indexing, scoring, and filtering engine.

import type { Collection, Folder, HttpMethod, HttpRequest } from "#lib/types";
import type { RequestLocation } from "#lib/features/workbench/stores/types";

export type PaletteCategory = "commands" | "requests" | "history" | "environments" | "workspaces";

export interface PaletteItem {
  id: string;
  category: PaletteCategory;
  title: string;
  subtitle?: string;
  badge?: string;
  badgeTone?: "brand" | "method" | "status" | "neutral" | "warn";
  method?: HttpMethod | string;
  statusCode?: number;
  shortcut?: string[];
  icon?: string;
  keywords?: string[];
  action: () => void | Promise<void>;
}

export interface FlattenedRequest {
  req: HttpRequest;
  loc: RequestLocation;
  trail: string;
}

/** Recursively flatten collections and folders into a list of requests with location trails. */
export function flattenRequests(collections: Collection[]): FlattenedRequest[] {
  const result: FlattenedRequest[] = [];

  function walk(node: Collection | Folder, loc: RequestLocation, trail: string) {
    for (const r of node.requests) {
      result.push({ req: r, loc, trail });
    }
    for (const f of node.folders) {
      walk(
        f,
        { collectionId: loc.collectionId, folderIds: [...loc.folderIds, f.id] },
        `${trail} / ${f.name}`,
      );
    }
  }

  for (const c of collections) {
    walk(c, { collectionId: c.id, folderIds: [] }, c.name);
  }

  return result;
}

export interface ParsePrefixResult {
  categoryFilter: PaletteCategory | null;
  cleanQuery: string;
}

/** Parse optional query prefixes like '>', 'req:', 'hist:', 'env:', 'ws:' */
export function parseSearchPrefix(rawQuery: string): ParsePrefixResult {
  const q = rawQuery.trim();

  if (q.startsWith(">")) {
    return { categoryFilter: "commands", cleanQuery: q.slice(1).trim() };
  }
  if (q.startsWith("cmd:")) {
    return { categoryFilter: "commands", cleanQuery: q.slice(4).trim() };
  }
  if (q.startsWith("/") || q.startsWith("req:")) {
    const clean = q.startsWith("/") ? q.slice(1).trim() : q.slice(4).trim();
    return { categoryFilter: "requests", cleanQuery: clean };
  }
  if (q.startsWith("hist:")) {
    return { categoryFilter: "history", cleanQuery: q.slice(5).trim() };
  }
  if (q.startsWith("env:")) {
    return { categoryFilter: "environments", cleanQuery: q.slice(4).trim() };
  }
  if (q.startsWith("ws:")) {
    return { categoryFilter: "workspaces", cleanQuery: q.slice(3).trim() };
  }

  return { categoryFilter: null, cleanQuery: q };
}

/** Compute a match score for a candidate item against search terms (higher is better). */
export function scoreItem(item: PaletteItem, terms: string[]): number {
  if (terms.length === 0) return 1;

  const titleLower = item.title.toLowerCase();
  const subtitleLower = (item.subtitle || "").toLowerCase();
  const methodLower = (item.method || "").toLowerCase();
  const keywordsLower = (item.keywords || []).map((k) => k.toLowerCase()).join(" ");

  let totalScore = 0;

  for (const term of terms) {
    let termScore = 0;

    // Exact title match
    if (titleLower === term) {
      termScore = Math.max(termScore, 100);
    } else if (titleLower.startsWith(term)) {
      termScore = Math.max(termScore, 75);
    } else if (titleLower.includes(term)) {
      termScore = Math.max(termScore, 50);
    }

    // Method match (e.g. searching "GET" or "POST")
    if (methodLower === term) {
      termScore = Math.max(termScore, 60);
    }

    // Subtitle match (URL or trail)
    if (subtitleLower.includes(term)) {
      termScore = Math.max(termScore, 35);
    }

    // Keyword match
    if (keywordsLower.includes(term)) {
      termScore = Math.max(termScore, 25);
    }

    // If any term didn't match anywhere, reject the item
    if (termScore === 0) return 0;
    totalScore += termScore;
  }

  // Boost commands slightly when typing generic action verbs
  if (item.category === "commands") totalScore += 5;

  return totalScore;
}

/** Filter and rank palette items given a search query. */
export function filterPaletteItems(items: PaletteItem[], rawQuery: string): PaletteItem[] {
  const { categoryFilter, cleanQuery } = parseSearchPrefix(rawQuery);

  let pool = items;
  if (categoryFilter) {
    pool = pool.filter((i) => i.category === categoryFilter);
  }

  const terms = cleanQuery.toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) {
    return pool;
  }

  const scored: { item: PaletteItem; score: number }[] = [];
  for (const item of pool) {
    const score = scoreItem(item, terms);
    if (score > 0) {
      scored.push({ item, score });
    }
  }

  // Sort by score descending
  scored.sort((a, b) => b.score - a.score);

  return scored.map((s) => s.item);
}
