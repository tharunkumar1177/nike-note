/**
 * Popup entry point.
 */
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "../shared/tokens.css";
import "./popup.css";
import { Popup } from "./Popup";

const root = document.getElementById("root");
if (!root) throw new Error("Popup root element is missing");

createRoot(root).render(
  <StrictMode>
    <Popup version={chrome.runtime.getManifest().version} />
  </StrictMode>,
);
