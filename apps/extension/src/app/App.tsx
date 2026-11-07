/**
 * App page root: shows the connection screen until the helper is connected,
 * then the workspace.
 */
import { useSyncExternalStore } from "react";

import type { ConnectionStore } from "./connection";
import { ConnectionScreen } from "./ConnectionScreen";
import { Workspace } from "./Workspace";

/**
 * Render the screen that matches the current helper connection state.
 */
export function App({ store }: { store: ConnectionStore }) {
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot);

  if (state.status === "connected") {
    return <Workspace hello={state.hello} />;
  }
  return <ConnectionScreen state={state} onRetry={() => store.connect()} />;
}
