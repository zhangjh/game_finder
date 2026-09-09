import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";

import { AnalyticsProvider } from "./analytics/provider";
import { I18nProvider } from "./i18n";
import "./index.css";
import { App } from "./App";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <I18nProvider>
        <AnalyticsProvider>
          <App />
        </AnalyticsProvider>
      </I18nProvider>
    </BrowserRouter>
  </StrictMode>,
);
