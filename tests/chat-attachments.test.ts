import { describe, expect, test } from "bun:test";
import {
  formatFileSize,
  isImageMimeType,
  isTextMimeType,
} from "../src/lib/agent/attachments";

describe("formatFileSize", () => {
  test("formats sizes under thresholds", () => {
    expect(formatFileSize(0)).toBe("0 B");
    expect(formatFileSize(512)).toBe("512 B");
    expect(formatFileSize(1024)).toBe("1.0 KB");
    expect(formatFileSize(1536)).toBe("1.5 KB");
    expect(formatFileSize(10 * 1024 * 1024)).toBe("10.0 MB");
  });
});

describe("isImageMimeType", () => {
  test("detects image mime types", () => {
    expect(isImageMimeType("image/png")).toBe(true);
    expect(isImageMimeType("image/jpeg")).toBe(true);
    expect(isImageMimeType("image/svg+xml")).toBe(true);
  });

  test("detects images by extension when mime is missing or generic", () => {
    expect(isImageMimeType("photo.png")).toBe(true);
    expect(isImageMimeType("scan.jpg")).toBe(true);
    expect(isImageMimeType("chart.webp")).toBe(true);
  });

  test("rejects non-images", () => {
    expect(isImageMimeType("text/plain")).toBe(false);
    expect(isImageMimeType("notes.txt")).toBe(false);
    expect(isImageMimeType("data.csv")).toBe(false);
  });
});

describe("isTextMimeType", () => {
  test("accepts text mimes and application data types", () => {
    expect(isTextMimeType("text/plain", "a.txt")).toBe(true);
    expect(isTextMimeType("text/markdown", "a.md")).toBe(true);
    expect(isTextMimeType("application/json", "a.json")).toBe(true);
    expect(isTextMimeType("application/typescript", "a.ts")).toBe(true);
  });

  test("accepts code and config extensions with unknown mime", () => {
    for (const name of ["main.tsx", "data.csv", "run.sh", "compose.yaml"]) {
      expect(isTextMimeType("", name)).toBe(true);
    }
  });

  test("rejects binary kinds", () => {
    expect(isTextMimeType("image/png", "a.png")).toBe(false);
    expect(isTextMimeType("", "report.pdf")).toBe(false);
  });
});
