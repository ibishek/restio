import { describe, expect, it } from "vitest";
import { extForContentType, humanBytes, humanMs, saveFiltersForContentType } from "./format";

describe("format and file helper utils", () => {
  it("formats human byte sizes correctly", () => {
    expect(humanBytes(500)).toBe("500 B");
    expect(humanBytes(1024)).toBe("1.0 KB");
    expect(humanBytes(2048)).toBe("2.0 KB");
    expect(humanBytes(1024 * 1024 * 3.5)).toBe("3.5 MB");
  });

  it("formats human millisecond durations correctly", () => {
    expect(humanMs(45)).toBe("45 ms");
    expect(humanMs(999)).toBe("999 ms");
    expect(humanMs(1250)).toBe("1.25 s");
    expect(humanMs(3500)).toBe("3.50 s");
  });

  it("maps content types to file extensions correctly", () => {
    expect(extForContentType("application/json")).toBe("json");
    expect(extForContentType("application/json; charset=utf-8")).toBe("json");
    expect(extForContentType("text/html")).toBe("html");
    expect(extForContentType("application/xml")).toBe("xml");
    expect(extForContentType("text/csv")).toBe("csv");
    expect(extForContentType("image/png")).toBe("png");
    expect(extForContentType("image/jpeg")).toBe("jpg");
    expect(extForContentType("image/svg+xml")).toBe("svg");
    expect(extForContentType("application/pdf")).toBe("pdf");
    expect(extForContentType("text/plain")).toBe("txt");
    expect(extForContentType("application/octet-stream")).toBe("bin");
    expect(extForContentType("unknown/mime")).toBe("bin");
  });

  it("generates save dialog filters for content type", () => {
    const jsonFilters = saveFiltersForContentType("application/json");
    expect(jsonFilters).toHaveLength(2);
    expect(jsonFilters[0].name).toBe("JSON File");
    expect(jsonFilters[0].extensions).toEqual(["json"]);
    expect(jsonFilters[1].name).toBe("All Files");

    const pngFilters = saveFiltersForContentType("image/png");
    expect(pngFilters[0].name).toBe("PNG Image");
    expect(pngFilters[0].extensions).toEqual(["png"]);
  });
});
