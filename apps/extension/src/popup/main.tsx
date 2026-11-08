/**
 * Popup entry point: applies the appearance settings and renders the popup.
 */
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { AppearanceStore } from "../shared/appearance";
import "../shared/tokens.css";
import "./popup.css";
import { Popup } from "./Popup";

const root = document.getElementById("root");
if (!root) throw new Error("Popup root element is missing");

new AppearanceStore(localStorage, document.documentElement).follow(window);

createRoot(root).render(
  <StrictMode>
    <Popup version={chrome.runtime.getManifest().version} />
  </StrictMode>,
);
