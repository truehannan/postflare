import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import "./styles/app.css";
import { App } from "./App";
import { queryClient } from "./lib/query";

const rootEl = document.getElementById("root")!;
if (!document.documentElement.hasAttribute("data-mode")) {
  document.documentElement.setAttribute("data-mode", localStorage.getItem("pf-theme") || "dark");
}

createRoot(rootEl).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
);
