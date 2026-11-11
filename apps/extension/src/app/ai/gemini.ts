/**
 * Google Gemini adapter (see blueprints/ai-assist.md). This module is the only
 * one that imports the Gemini SDK, and it is loaded with a dynamic import so
 * the SDK stays out of the startup bundle.
 */
import { GoogleGenAI } from "@google/genai";

import { textModels, type AiProvider, type AiRequest, type ListedModel } from "../../shared/ai";

/** Models asked for per page of the model list. */
const PAGE_SIZE = 100;

/**
 * The Gemini adapter: lists text models and streams generated text.
 */
export const gemini: AiProvider = {
  async listModels(key: string, signal: AbortSignal) {
    const client = new GoogleGenAI({ apiKey: key });
    const pager = await client.models.list({ config: { pageSize: PAGE_SIZE, abortSignal: signal } });
    const listed: ListedModel[] = [];
    for await (const model of pager) listed.push(model);
    return textModels(listed);
  },

  async *stream({ key, model, system, prompt, signal }: AiRequest) {
    const client = new GoogleGenAI({ apiKey: key });
    const chunks = await client.models.generateContentStream({
      model,
      contents: prompt,
      config: { systemInstruction: system, abortSignal: signal },
    });
    for await (const chunk of chunks) {
      signal.throwIfAborted();
      const text = chunk.text;
      if (text) yield text;
    }
  },
};
