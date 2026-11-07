# AI assist

## Outcome or responsibility

AI actions are optional and use the user's own provider key, Gemini first. The page bar has **Ask AI**, which answers questions about the open page, and **Summarize**, which writes a short bullet summary of it. Typing `/ai` on a line opens **Write with AI**, which generates Markdown blocks from a request (for example, a vacation plan) and inserts them at that line. The first AI action opens AI setup, where the user picks a provider, enters a key, checks it (which lists the models the key can use), picks a model, and saves. **AI settings** (or **Set up AI**) in the sidebar changes the model or key, or removes the key. Covers the provider registry, the lazily loaded Gemini adapter, the settings store, prompts and output cleanup, the setup, ask, write, and summary dialogs, and the build check that keeps provider SDKs out of the startup bundle.

## Current verified status

**Status:** Partial

Verified in CI (Vitest for the settings validator, model filtering and the default model, the summary, ask, and write prompts, page cutting, cleanup of generated Markdown, error messages including error bodies nested in streamed errors, the `/ai` slash command, and the startup-chunk check; end-to-end tests that run the real Gemini SDK against the real API with an invalid key, from Summarize through setup, from a saved key through Ask AI, `/ai` and Write with AI, and a summary, plus removing the key; each checks that the refusal reads as plain text; the build fails if the SDK reaches a startup chunk) and by hand in Chrome on Windows with the CI build: on CRLF pages with a byte order mark, Summarize opened setup, Ask AI and `/ai` reached the provider with the saved key and showed its refusal, and cancelling Write with AI left the file unchanged apart from the line `/ai` was typed on. Hand testing found the refusal shown as a raw JSON body on streamed calls; nested bodies are now unwrapped. A successful key check and streamed answers, summaries, and inserted text have not been verified with a real key.

## Architecture dependencies

- [AI providers](../architecture.md#ai-providers): the registry, adapter interface, key storage, network rules, and the startup-chunk check.
- [Extension identity](../architecture.md#extension-identity): the manifest permissions.
- [Block model and line mapping](../architecture.md#block-model-and-line-mapping): inserted text goes in as whole lines at the line `/ai` was typed on.

## Local rules and implications

- Rule ownership: settings validation, model filtering, prompts, output cleanup, and error messages live in `apps/extension/src/shared/ai.ts`. Only `apps/extension/src/app/ai/gemini.ts` imports the Gemini SDK, and only `providers.ts` imports that file, with a dynamic import.
- Nothing is sent to a provider until the user selects **Check key** or runs an AI action. Setup says so, and every AI dialog names the provider and model that wrote its answer.
- A key is checked by listing models before it can be saved. Models that cannot write text (embedding, speech, image, video, live, and similar) are left out. The newest stable Flash model is preselected, or the saved model when it is still offered.
- Every prompt sends the page title and its Markdown without the byte order mark and with LF line endings, cut at 100,000 characters with a note. Answers stream into the dialog and render as read-only blocks. Stop keeps what came so far; Copy copies the Markdown. A dialog's run stops when it closes or is replaced.
- Ask AI answers only from the page and says when the page does not hold the answer. Summarize has Try again. Neither writes into the page.
- Write with AI asks for Markdown blocks without a level-1 heading or a code fence around the whole answer. Before inserting, a fence wrapping the whole answer is removed, `# ` headings outside code become `## `, and the text is trimmed, so the page title stays the only level-1 heading. Insert puts the text on the `/ai` line when it is empty, or on new lines after it, through the editor's normal save path; Cancel inserts nothing. Insert is disabled while text is streaming and when no text came; text kept by Stop can be inserted. Enter generates and Shift+Enter starts a new line in the request.
- Provider errors show the provider's own message when it sends one, unwrapping JSON error bodies nested inside other error messages; network failures and stops have their own messages.

## Related blueprints

### Required

- [page-rendering](page-rendering.md): the read-only block views the answers use.
- [slash-menu](slash-menu.md): the `/ai` command that opens Write with AI.

### Impact checks

- [build-pipeline](build-pipeline.md): check when dependencies, chunking, or the build plugin change.
- [extension-shell](extension-shell.md): check when manifest permissions change.
- [page-editing](page-editing.md): check when the editor's transform or save path changes.

## Relevant implementation and tests

- `apps/extension/src/shared/ai.ts`, `apps/extension/tests/ai.test.ts`
- `apps/extension/src/app/ai/{providers,gemini,aiStore}.ts`, `apps/extension/src/app/ai/{AiSetupDialog,AiOutput,CopyButton,AskDialog,WriteDialog,SummaryDialog,PageAiDialog}.tsx`, `apps/extension/src/app/{PageView,Workspace}.tsx`, `apps/extension/src/app/blocks/PageEditor.tsx`
- `apps/extension/src/shared/slash.ts`, `apps/extension/tests/slash.test.ts`
- `apps/extension/src/build/{plugin,manifest}.ts`, `apps/extension/tests/build.test.ts`
- `apps/extension/e2e/ai.spec.ts`, `apps/extension/e2e/slash.spec.ts`

## Acceptance or verification criteria

- [x] Summarize before setup opens AI setup; a key the provider refuses shows the provider's message as plain text and cannot be saved.
- [x] With saved settings, Summarize runs the chosen model through the lazily loaded SDK and shows its answer or its error, with Try again.
- [x] Ask AI sends the question with the page and shows the answer or the provider's error.
- [x] `/ai` removes the command and opens Write with AI; Enter generates, Insert stays disabled without an answer, and Cancel leaves the page unchanged.
- [x] Generated Markdown loses a wrapping fence and level-1 headings before it is inserted.
- [x] The saved key and model show in AI settings, and Remove key forgets them.
- [x] The build fails when a provider SDK would load at startup.

## Remaining gaps and unknowns

- A successful key check and streamed answers, summaries, and inserted text have not been verified by hand with a real key.
- Gemini is the only provider.
- The key is stored unencrypted in the browser profile's extension storage, like other browser-stored secrets.
- Ask AI answers one question at a time without follow-up history, and generated text cannot rewrite or replace existing blocks.
