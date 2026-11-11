/**
 * The AI provider registry (see architecture.md, AI providers): each provider's
 * label, where to get a key, and a lazy loader for its adapter and SDK. App
 * code reaches a provider only through this registry.
 */
import type { AiProvider, ProviderId } from "../../shared/ai";

/** What the app shows about a provider before its SDK is loaded. */
export interface ProviderInfo {
  id: ProviderId;
  label: string;
  /** Where the user creates an API key. */
  keyUrl: string;
  /** Load the adapter, fetching its SDK chunk the first time. */
  load: () => Promise<AiProvider>;
}

/** Every provider, in menu order. */
export const PROVIDERS: readonly ProviderInfo[] = [
  {
    id: "gemini",
    label: "Google Gemini",
    keyUrl: "https://aistudio.google.com/apikey",
    load: async () => (await import("./gemini")).gemini,
  },
];

/**
 * The registry entry for `id`.
 */
export function providerInfo(id: ProviderId): ProviderInfo {
  const info = PROVIDERS.find((provider) => provider.id === id);
  if (!info) throw new Error(`Unknown AI provider "${id}".`);
  return info;
}
