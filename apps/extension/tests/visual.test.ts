/**
 * Unit tests for the visual sandbox: its content security policy, the sandbox
 * page the build emits, the messages the app accepts from it, and the height
 * limits.
 */
import { describe, expect, it } from "vitest";

import {
  parseVisualMessage,
  VISUAL_CSP,
  VISUAL_MAX_HEIGHT,
  VISUAL_MESSAGES,
  VISUAL_MIN_HEIGHT,
  visualHeight,
  visualPageHtml,
} from "../src/shared/visual";

describe("VISUAL_CSP", () => {
  const directives = new Map(
    VISUAL_CSP.split(";").map((part) => {
      const [name = "", ...values] = part.trim().split(/\s+/);
      return [name, values] as const;
    }),
  );

  it("sandboxes the page with scripts only", () => {
    expect(directives.get("sandbox")).toEqual(["allow-scripts"]);
  });

  it("blocks the network and every source but inline code and data", () => {
    expect(directives.get("default-src")).toEqual(["'none'"]);
    expect(directives.get("form-action")).toEqual(["'none'"]);
    expect(directives.has("connect-src")).toBe(false);
    expect(directives.has("frame-src")).toBe(false);
    for (const [name, values] of directives) {
      if (name === "sandbox") continue;
      for (const value of values) {
        expect(["'none'", "'unsafe-inline'", "'unsafe-eval'", "data:", "blob:"]).toContain(value);
      }
    }
  });
});

describe("visualPageHtml", () => {
  it("is a standards-mode page whose only script is the inline loader", () => {
    const html = visualPageHtml();
    expect(html.startsWith("<!doctype html>\n")).toBe(true);
    expect(html.match(/<script/g)).toHaveLength(1);
    expect(html).not.toMatch(/<script[^>]*\ssrc=/);
    expect(html).toContain(JSON.stringify(VISUAL_MESSAGES));
    expect(html).toContain("document.write(data.html)");
    expect(html).toContain("event.source !== window.parent");
  });
});

describe("parseVisualMessage", () => {
  it("accepts the loader's greeting and finite heights", () => {
    expect(parseVisualMessage({ type: VISUAL_MESSAGES.ready })).toEqual({ type: "ready" });
    expect(parseVisualMessage({ type: VISUAL_MESSAGES.height, height: 412.5 })).toEqual({
      type: "height",
      height: 412.5,
    });
  });

  it("ignores everything else", () => {
    expect(parseVisualMessage(null)).toBeNull();
    expect(parseVisualMessage("quire-visual-ready")).toBeNull();
    expect(parseVisualMessage({ type: VISUAL_MESSAGES.render, html: "<p>x</p>" })).toBeNull();
    expect(parseVisualMessage({ type: VISUAL_MESSAGES.height, height: "400" })).toBeNull();
    expect(parseVisualMessage({ type: VISUAL_MESSAGES.height, height: Infinity })).toBeNull();
    expect(parseVisualMessage({ type: "other", height: 10 })).toBeNull();
  });
});

describe("visualHeight", () => {
  it("rounds up and keeps heights within the limits", () => {
    expect(visualHeight(412.2)).toBe(413);
    expect(visualHeight(0)).toBe(VISUAL_MIN_HEIGHT);
    expect(visualHeight(-50)).toBe(VISUAL_MIN_HEIGHT);
    expect(visualHeight(100_000)).toBe(VISUAL_MAX_HEIGHT);
  });
});
