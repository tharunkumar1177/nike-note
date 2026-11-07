/**
 * Unit tests for sub-page link lines and page-relative link resolution.
 */
import { describe, expect, it } from "vitest";

import { isExternalHref, parsePageLinkLine, resolvePageHref } from "../src/links";

describe("parsePageLinkLine", () => {
  it("accepts the forms the page tree accepts", () => {
    expect(parsePageLinkLine("[Trips](Trips/README.md)")).toEqual({
      title: "Trips",
      folder: "Trips",
    });
    expect(parsePageLinkLine("  [Japan](<Japan 2027/README.md>) ")).toEqual({
      title: "Japan",
      folder: "Japan 2027",
    });
    expect(parsePageLinkLine("[Rome](./Rome%20Trip/README.md)")?.folder).toBe("Rome Trip");
  });

  it("rejects everything else", () => {
    for (const line of [
      "See [x](Other/README.md) inline",
      "[Deep](a/b/README.md)",
      "[Assets](assets/README.md)",
      "[Hidden](.git/README.md)",
      "[File](notes.md)",
      "[Bad](%E0%A4%A/README.md)",
    ]) {
      expect(parsePageLinkLine(line)).toBeNull();
    }
  });
});

describe("resolvePageHref", () => {
  it("resolves relative README links against the current page", () => {
    expect(resolvePageHref("", "Trips/README.md")).toBe("Trips");
    expect(resolvePageHref("Trips", "Japan%202027/README.md")).toBe("Trips/Japan 2027");
    expect(resolvePageHref("Trips/Japan", "../Berlin/README.md")).toBe("Trips/Berlin");
    expect(resolvePageHref("Trips", "../README.md")).toBe("");
    expect(resolvePageHref("Trips", "./README.md#plan")).toBe("Trips");
  });

  it("returns null for other links and for escapes from the notes folder", () => {
    expect(resolvePageHref("", "../README.md")).toBeNull();
    expect(resolvePageHref("", "https://example.com/README.md")).toBeNull();
    expect(resolvePageHref("", "/etc/README.md")).toBeNull();
    expect(resolvePageHref("", "notes.md")).toBeNull();
    expect(resolvePageHref("", "#section")).toBeNull();
  });
});

describe("isExternalHref", () => {
  it("accepts only web and mail links", () => {
    expect(isExternalHref("https://example.com")).toBe(true);
    expect(isExternalHref("MAILTO:a@b.c")).toBe(true);
    expect(isExternalHref("javascript:alert(1)")).toBe(false);
    expect(isExternalHref("data:text/html,x")).toBe(false);
  });
});
