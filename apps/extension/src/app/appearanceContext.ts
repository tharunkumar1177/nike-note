/**
 * React context that carries the app page's appearance settings store
 * (see blueprints/settings.md) from the entry point to the settings dialog.
 */
import { createContext } from "react";

import type { AppearanceStore } from "../shared/appearance";

/** The app page's appearance store; null outside the app page. */
export const AppearanceContext = createContext<AppearanceStore | null>(null);
