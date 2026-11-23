import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router/dom";
import { router } from "./router";
import "./styles.css";
import { startOffscreenPausing } from "./lib/offscreen";
import { startTooltips } from "./lib/tooltips";
import { startSelectSizing } from "./lib/selects";

const root = document.getElementById("root")!;
// Prerendered SEO markup (see scripts/prerender.mjs) is replaced by the live app.
root.innerHTML = "";
createRoot(root).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);

startOffscreenPausing();
startTooltips();
startSelectSizing();
