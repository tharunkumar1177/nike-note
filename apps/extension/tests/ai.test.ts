/**
 * Unit tests for the AI settings validator, model choice, the summary, write,
 * ask, and visual prompts, cleaning generated text and HTML, and error
 * messages.
 */
import { describe, expect, it } from "vitest";

import {
  askPrompt,
  cleanGenerated,
  cleanVisualHtml,
  defaultModel,
  describeAiError,
  MAX_PAGE_CHARS,
  pageForPrompt,
  parseAiSettings,
  summaryPrompt,
  textModels,
  visualPrompt,
  writePrompt,
} from "../src/shared/ai";

describe("parseAiSettings", () => {
  it("accepts complete settings", () => {
    const settings = { provider: "gemini", model: "gemini-2.5-flash", key: "AIza-key" };
    expect(parseAiSettings(settings)).toEqual(settings);
  });

  it("treats anything incomplete as not set up", () => {
    expect(parseAiSettings(undefined)).toBeNull();
    expect(parseAiSettings({ provider: "other", model: "m", key: "k" })).toBeNull();
    expect(parseAiSettings({ provider: "gemini", model: " ", key: "k" })).toBeNull();
    expect(parseAiSettings({ provider: "gemini", model: "m", key: 4 })).toBeNull();
  });
});

describe("textModels and defaultModel", () => {
  const listed = [
    { name: "models/gemini-2.5-pro", displayName: "Gemini 2.5 Pro", supportedActions: ["generateContent"] },
    { name: "models/gemini-2.0-flash", displayName: "Gemini 2.0 Flash", supportedActions: ["generateContent"] },
    { name: "models/gemini-2.5-flash", displayName: "Gemini 2.5 Flash", supportedActions: ["generateContent", "countTokens"] },
    { name: "models/gemini-embedding-001", supportedActions: ["embedContent"] },
    { name: "models/gemini-2.5-flash-preview-tts", supportedActions: ["generateContent"] },
    { name: "models/gemma-3-4b-it", displayName: " ", supportedActions: ["generateContent"] },
    { displayName: "No name", supportedActions: ["generateContent"] },
  ];

  it("keeps text models, drops the prefix, and sorts by label", () => {
    expect(textModels(listed).map((model) => model.id)).toEqual([
      "gemini-2.0-flash",
      "gemini-2.5-flash",
      "gemini-2.5-pro",
      "gemma-3-4b-it",
    ]);
    expect(textModels(listed).at(-1)?.label).toBe("gemma-3-4b-it");
  });

  it("prefers the previous model, then the newest stable Flash", () => {
    const models = textModels(listed);
    expect(defaultModel(models, "gemini-2.5-pro")).toBe("gemini-2.5-pro");
    expect(defaultModel(models, "gone")).toBe("gemini-2.5-flash");
    expect(defaultModel(models.filter((model) => !model.id.includes("flash")), null)).toBe(
      "gemini-2.5-pro",
    );
    expect(defaultModel([], null)).toBeNull();
  });
});

describe("summaryPrompt", () => {
  it("sends the page without its byte order mark and with LF endings", () => {
    const prompt = summaryPrompt("Trip", "\uFEFF# Trip\r\n- Book hotel\r\n");
    expect(prompt.prompt).toBe("Page title: Trip\n\nPage (Markdown):\n# Trip\n- Book hotel\n");
    expect(prompt.system).toContain("bullet points");
  });

  it("cuts long pages with a note", () => {
    const text = pageForPrompt("a".repeat(MAX_PAGE_CHARS + 10));
    expect(text.startsWith("a".repeat(MAX_PAGE_CHARS))).toBe(true);
    expect(text).toContain("cut because it is long");
  });
});

describe("writePrompt and askPrompt", () => {
  it("carry the page and the trimmed request or question", () => {
    const write = writePrompt("  a 3-day Kyoto plan \n", "Trip", "# Trip\n");
    expect(write.prompt).toBe(
      "Page title: Trip\n\nPage (Markdown):\n# Trip\n\n\nWhat to write:\na 3-day Kyoto plan",
    );
    expect(write.system).toContain("Never use a # heading");
    const ask = askPrompt("When do we fly?", "Trip", "# Trip\nFly 12 April\n");
    expect(ask.prompt.endsWith("Question:\nWhen do we fly?")).toBe(true);
    expect(ask.system).toContain("only what the page says");
  });
});

describe("cleanGenerated", () => {
  it("unwraps a Markdown fence and keeps one page title", () => {
    expect(cleanGenerated("\n```markdown\n# Kyoto\r\n- Day 1\n```\n\n")).toBe("## Kyoto\n- Day 1");
    expect(cleanGenerated("~~~md\n## Plan\n~~~")).toBe("## Plan");
  });

  it("keeps code blocks and headings inside them", () => {
    const code = "```bash\n# install\nnpm i\n```";
    expect(cleanGenerated(code)).toBe(code);
    expect(cleanGenerated("Intro\n~~~\n# not a heading\n```\n~~~\n# Heading")).toBe(
      "Intro\n~~~\n# not a heading\n```\n~~~\n## Heading",
    );
    expect(cleanGenerated("  \n ")).toBe("");
  });
});

describe("visualPrompt", () => {
  it("asks for one offline HTML document about the trimmed concept", () => {
    const prompt = visualPrompt("  Git merge vs rebase \n", "Git", "# Git\n");
    expect(prompt.prompt).toBe(
      "Page title: Git\n\nPage (Markdown):\n# Git\n\n\nConcept to show:\nGit merge vs rebase",
    );
    expect(prompt.system).toContain("starts with <!doctype html>");
    expect(prompt.system).toContain("without network access");
    expect(prompt.system).toContain("never size anything with vh units");
  });
});

describe("cleanVisualHtml", () => {
  const page = "<!doctype html>\n<html><body><svg></svg></body></html>";

  it("keeps a bare document and unwraps a fence around it", () => {
    expect(cleanVisualHtml(`\n${page}\n`)).toBe(page);
    expect(cleanVisualHtml(`\`\`\`html\r\n${page}\r\n\`\`\`\n`)).toBe(page);
    expect(cleanVisualHtml(`~~~\n${page}\n~~~`)).toBe(page);
  });

  it("drops words before the document", () => {
    expect(cleanVisualHtml(`Here is your visual:\n\n${page}`)).toBe(page);
    expect(cleanVisualHtml("Sure!\n<html lang=\"en\"><p>x</p></html>")).toBe(
      '<html lang="en"><p>x</p></html>',
    );
  });

  it("answers nothing for text without HTML", () => {
    expect(cleanVisualHtml("I cannot draw that.")).toBe("");
    expect(cleanVisualHtml("  ")).toBe("");
  });
});

describe("describeAiError", () => {
  it("reads the provider's JSON error message", () => {
    const error = new Error(
      'got status: 400 Bad Request. {"error":{"code":400,"message":"API key not valid. Please pass a valid API key.","status":"INVALID_ARGUMENT"}}',
    );
    expect(describeAiError(error)).toBe("API key not valid. Please pass a valid API key.");
  });

  it("unwraps a JSON body nested in a streamed error's message", () => {
    const body = JSON.stringify(
      { error: { code: 400, message: "API key not valid. Please pass a valid API key." } },
      null,
      2,
    );
    const error = new Error(JSON.stringify({ error: { message: `${body}\n`, code: 400 } }));
    expect(describeAiError(error)).toBe("API key not valid. Please pass a valid API key.");
  });

  it("explains network failures and stops", () => {
    expect(describeAiError(new TypeError("Failed to fetch"))).toContain("could not be reached");
    expect(describeAiError(new DOMException("The operation was aborted.", "AbortError"))).toBe(
      "Stopped.",
    );
    expect(describeAiError("plain")).toBe("plain");
    expect(describeAiError(new Error("broken {json"))).toBe("broken {json");
  });
});
