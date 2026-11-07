/**
 * App page root: shows the connection screen until the helper is connected,
 * then the setup flow and workspace for that connection.
 */
import { useSyncExternalStore } from "react";

import { Connected } from "./Connected";
import type { ConnectionStore } from "./connection";
import { ConnectionScreen } from "./ConnectionScreen";

/**
 * Render the screen that matches the current helper connection state.
 */
export function App({ store }: { store: ConnectionStore }) {
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot);

  if (state.status === "connected") {
    return <Connected key={state.session} hello={state.hello} helper={state.helper} />;
  }
  return <ConnectionScreen state={state} onRetry={() => store.connect()} />;
}
