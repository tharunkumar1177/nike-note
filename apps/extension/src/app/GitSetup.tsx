/**
 * Guided Git setup for the notes folder: turn on Git, set the author identity,
 * connect a remote, and push for the first time. Also the "Git is missing" screen.
 */
import { useState, type FormEvent, type ReactNode } from "react";

import { CheckIcon, FolderIcon } from "../shared/icons";
import type { SetupStage, WorkspaceState } from "../shared/workspace";
import { ScreenCard } from "./ScreenCard";
import type { WorkspaceStore, WorkspaceView } from "./workspaceStore";

/** Checklist steps in the order the helper requires them. */
const STEPS = [
  { stage: "init", title: "Turn on version history" },
  { stage: "identity", title: "Name your changes" },
  { stage: "origin", title: "Connect a remote repository" },
  { stage: "publish", title: "Sync for the first time" },
] as const satisfies readonly { stage: SetupStage; title: string }[];

/** Stages that appear in the checklist. */
type StepStage = (typeof STEPS)[number]["stage"];

/**
 * Notes folder name with a "Change folder" action.
 */
function FolderLine({ workspace, store }: { workspace: WorkspaceState; store: WorkspaceStore }) {
  return (
    <div className="folder-line">
      <FolderIcon />
      <span className="folder-line__name" title={workspace.root ?? undefined}>
        {workspace.rootName}
      </span>
      <button type="button" className="folder-line__change" onClick={() => store.setPicking(true)}>
        Change folder
      </button>
    </div>
  );
}

/**
 * Error line for the last failed setup action.
 */
function SetupError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p className="screen__error" role="alert">
      {message}
    </p>
  );
}

/**
 * Form for the identity step.
 */
function IdentityForm({ store, busy }: { store: WorkspaceStore; busy: boolean }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");

  /**
   * Save the identity for this notes folder.
   */
  function submit(event: FormEvent): void {
    event.preventDefault();
    void store.run("gitSetIdentity", { name: name.trim(), email: email.trim() });
  }

  return (
    <form className="setup-form" onSubmit={submit}>
      <p>Git labels every change with a name and email. They stay in this notes folder only.</p>
      <label className="setup-form__field">
        <span>Name</span>
        <input
          className="q-input"
          value={name}
          autoComplete="name"
          onChange={(event) => setName(event.target.value)}
        />
      </label>
      <label className="setup-form__field">
        <span>Email</span>
        <input
          className="q-input"
          type="email"
          value={email}
          autoComplete="email"
          onChange={(event) => setEmail(event.target.value)}
        />
      </label>
      <div className="screen__actions">
        <button
          type="submit"
          className="q-button q-button--primary"
          disabled={busy || name.trim() === "" || email.trim() === ""}
        >
          {busy ? "Saving…" : "Save"}
        </button>
      </div>
    </form>
  );
}

/**
 * Form for the remote step.
 */
function OriginForm({ store, busy }: { store: WorkspaceStore; busy: boolean }) {
  const [url, setUrl] = useState("");

  /**
   * Connect the remote repository.
   */
  function submit(event: FormEvent): void {
    event.preventDefault();
    void store.run("gitSetOrigin", { url: url.trim() });
  }

  return (
    <form className="setup-form" onSubmit={submit}>
      <p>
        Create an empty repository on GitHub, GitLab, or any Git host, then paste its URL. Quire
        signs in with the Git credentials already set up on this computer.
      </p>
      <label className="setup-form__field">
        <span>Repository URL</span>
        <input
          className="q-input"
          value={url}
          placeholder="https://github.com/you/notes.git"
          spellCheck={false}
          onChange={(event) => setUrl(event.target.value)}
        />
      </label>
      <div className="screen__actions">
        <button
          type="submit"
          className="q-button q-button--primary"
          disabled={busy || url.trim() === ""}
        >
          {busy ? "Connecting…" : "Connect"}
        </button>
      </div>
    </form>
  );
}

/**
 * Body of the current checklist step.
 */
function StepBody({
  stage,
  workspace,
  store,
  view,
}: {
  stage: StepStage;
  workspace: WorkspaceState;
  store: WorkspaceStore;
  view: WorkspaceView;
}): ReactNode {
  switch (stage) {
    case "init":
      return (
        <div className="setup-form">
          <p>Quire records every change with Git, so you can sync this folder and undo mistakes.</p>
          <div className="screen__actions">
            <button
              type="button"
              className="q-button q-button--primary"
              disabled={view.busy === "gitInit"}
              onClick={() => void store.run("gitInit")}
            >
              {view.busy === "gitInit" ? "Turning on…" : "Turn on Git"}
            </button>
          </div>
        </div>
      );
    case "identity":
      return <IdentityForm store={store} busy={view.busy === "gitSetIdentity"} />;
    case "origin":
      return <OriginForm store={store} busy={view.busy === "gitSetOrigin"} />;
    case "publish": {
      const busy = view.busy === "gitPublish";
      return (
        <div className="setup-form">
          <p>
            Quire commits this folder and pushes it to <code>{workspace.git?.origin}</code>.
            {workspace.git?.hasCommits ? "" : " An empty folder gets a README.md first."}
          </p>
          <div className="screen__actions">
            <button
              type="button"
              className="q-button q-button--primary"
              disabled={busy}
              onClick={() => void store.run("gitPublish")}
            >
              {busy ? "Syncing…" : "Sync now"}
            </button>
          </div>
          {busy && <p className="setup-form__hint">This can take a minute on a slow network.</p>}
        </div>
      );
    }
  }
}

/**
 * Render the Git setup checklist for the current stage.
 */
export function GitSetup({
  stage,
  workspace,
  store,
  view,
}: {
  stage: StepStage;
  workspace: WorkspaceState;
  store: WorkspaceStore;
  view: WorkspaceView;
}) {
  const currentIndex = STEPS.findIndex((step) => step.stage === stage);
  return (
    <ScreenCard title="Set up sync" wide>
      <FolderLine workspace={workspace} store={store} />
      <ol className="checklist">
        {STEPS.map((step, index) => {
          const state = index < currentIndex ? "done" : index === currentIndex ? "current" : "todo";
          return (
            <li
              key={step.stage}
              className={`checklist__step checklist__step--${state}`}
              aria-current={state === "current" ? "step" : undefined}
            >
              <span className="checklist__marker" aria-hidden="true">
                {state === "done" ? <CheckIcon /> : index + 1}
              </span>
              <div className="checklist__content">
                <h2 className="checklist__title">
                  {step.title}
                  {state === "done" && <span className="q-visually-hidden"> (done)</span>}
                </h2>
                {state === "current" && (
                  <StepBody stage={step.stage} workspace={workspace} store={store} view={view} />
                )}
              </div>
            </li>
          );
        })}
      </ol>
      <SetupError message={view.error} />
    </ScreenCard>
  );
}

/**
 * Screen shown when the helper cannot run Git.
 */
export function GitMissing({
  workspace,
  store,
}: {
  workspace: WorkspaceState;
  store: WorkspaceStore;
}) {
  return (
    <ScreenCard title="Install Git" onRetry={() => void store.load()} wide>
      <FolderLine workspace={workspace} store={store} />
      <p>
        Quire syncs your notes with Git, but Git isn&apos;t installed on this computer or
        isn&apos;t on the system path. Install it from{" "}
        <a href="https://git-scm.com/downloads" target="_blank" rel="noreferrer">
          git-scm.com
        </a>
        , restart the browser, then select Retry.
      </p>
    </ScreenCard>
  );
}
