# AI assist

## Outcome or responsibility

AI actions are optional and use the user's own provider key, Gemini first. **Summarize** in the page bar writes a short bullet summary of the open page; the first time, it opens AI setup, where the user picks a provider, enters a key, checks it (which lists the models the key can use), picks a model, and saves. **AI settings** (or **Set up AI**) in the sidebar changes the model or key, or removes the key. Covers the provider registry, the lazily loaded Gemini adapter, the settings store, the setup and summary dialogs, and the build check that keeps provider SDKs out of the startup bundle. Slice 16 adds writing and asking on top of this.

## Current verified status

**Status:** Partial

Verified in CI (Vitest for the settings validator, model filtering and the default model, the summary prompt and page cutting, error messages, and the startup-chunk check; end-to-end tests that run the real Gemini SDK against the real API with an invalid key, from Summarize through setup and from a saved key through a summary, plus removing the key; the build fails if the SDK reaches a startup chunk) and by hand in Chrome on Windows with the CI build: Summarize opened setup on a CRLF page with a byte order mark, the SDK loaded from its own chunk on demand, and the provider's refusal of a wrong key was shown in the dialog. A successful key check and a streamed summary have not been verified with a real key.

## Architecture dependencies

- [AI providers](../architecture.md#ai-providers): the registry, adapter interface, key storage, network rules, and the startup-chunk check.
- [Extension identity](../architecture.md#extension-identity): the manifest permissions.

## Local rules and implications

- Rule ownership: settings validation, model filtering, prompts, and error messages live in `apps/extension/src/shared/ai.ts`. Only `apps/extension/src/app/ai/gemini.ts` imports the Gemini SDK, and only `providers.ts` imports that file, with a dynamic import.
- Nothing is sent to a provider until the user selects **Check key** or runs an AI action. Setup says so, and the summary dialog names the provider and model that wrote it.
- A key is checked by listing models before it can be saved. Models that cannot write text (embedding, speech, image, video, live, and similar) are left out. The newest stable Flash model is preselected, or the saved model when it is still offered.
- The summary prompt sends the page title and its Markdown without the byte order mark and with LF line endings, cut at 100,000 characters with a note. The answer streams into the dialog and renders as read-only blocks. Stop keeps what came so far; Try again starts over; Copy copies the Markdown. Summaries are not written into the page.
- Provider errors show the provider's own message when it sends one; network failures and stops have their own messages.

## Related blueprints

### Required

- [page-rendering](page-rendering.md): the read-only block views the summary uses.

### Impact checks

- [build-pipeline](build-pipeline.md): check when dependencies, chunking, or the build plugin change.
- [extension-shell](extension-shell.md): check when manifest permissions change.

## Relevant implementation and tests

- `apps/extension/src/shared/ai.ts`, `apps/extension/tests/ai.test.ts`
- `apps/extension/src/app/ai/{providers,gemini,aiStore}.ts`, `apps/extension/src/app/ai/{AiSetupDialog,SummaryDialog}.tsx`, `apps/extension/src/app/{PageView,Workspace}.tsx`
- `apps/extension/src/build/{plugin,manifest}.ts`, `apps/extension/tests/build.test.ts`
- `apps/extension/e2e/ai.spec.ts`

## Acceptance or verification criteria

- [x] Summarize before setup opens AI setup; a key the provider refuses shows the provider's message and cannot be saved.
- [x] With saved settings, Summarize runs the chosen model through the lazily loaded SDK and shows its answer or its error, with Try again.
- [x] The saved key and model show in AI settings, and Remove key forgets them.
- [x] The build fails when a provider SDK would load at startup.

## Remaining gaps and unknowns

- A successful key check and a streamed summary have not been verified by hand with a real key.
- Gemini is the only provider.
- The key is stored unencrypted in the browser profile's extension storage, like other browser-stored secrets.
- Summaries cannot be inserted into the page yet; slice 16 adds writing into pages.
