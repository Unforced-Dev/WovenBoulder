import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { App } from "./App.tsx";
import { ClientProvider } from "./api/context.tsx";
import { createClient } from "./api/client.ts";
import "./styles.css";

// The router's basename is the surface mount (Vite's BASE_URL, e.g.
// "/surface/woven-boulder/"); the host SPA-fallbacks deep links to this
// bundle.
const basename = import.meta.env.BASE_URL.replace(/\/$/, "");

const rootEl = document.getElementById("root");
if (rootEl === null) throw new Error("missing #root");

createRoot(rootEl).render(
  <StrictMode>
    <BrowserRouter basename={basename}>
      <ClientProvider client={createClient()}>
        <App />
      </ClientProvider>
    </BrowserRouter>
  </StrictMode>,
);
