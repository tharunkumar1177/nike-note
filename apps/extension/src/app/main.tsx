/**
 * App page entry point: connects to the helper and renders the app.
 */
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "../shared/tokens.css";
import "./app.css";
import { App } from "./App";
import { ConnectionStore } from "./connection";

const root = document.getElementById("root");
if (!root) throw new Error("App root element is missing");

const store = new ConnectionStore();
store.connect();

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") store.retryIfFailed();
});

createRoot(root).render(
  <StrictMode>
    <App store={store} />
  </StrictMode>,
);
