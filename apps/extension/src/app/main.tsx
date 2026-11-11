/**
 * App page entry point: applies the appearance settings, connects to the
 * helper, and renders the app.
 */
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { AppearanceStore } from "../shared/appearance";
import "../shared/tokens.css";
import "./app.css";
import { App } from "./App";
import { AppearanceContext } from "./appearanceContext";
import { ConnectionStore } from "./connection";

const root = document.getElementById("root");
if (!root) throw new Error("App root element is missing");

const appearance = new AppearanceStore(localStorage, document.documentElement);
appearance.follow(window);

const store = new ConnectionStore();
store.connect();

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") store.retryIfFailed();
});

createRoot(root).render(
  <StrictMode>
    <AppearanceContext value={appearance}>
      <App store={store} />
    </AppearanceContext>
  </StrictMode>,
);
