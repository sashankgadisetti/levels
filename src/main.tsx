import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles/globals.css";
import { MainShell } from "./components/MainShell";
import { SystemPopup } from "./components/SystemPopup";
import { bootstrapStore } from "./store/bootstrap";
import { installOracle } from "./oracle/wire";

bootstrapStore();
if (!(window.location.pathname === "/system" || window.location.pathname.endsWith("/system.html"))) installOracle();

// Tiny pathname router. Works for dev ("/system") and the built multi-page app ("/system.html").
export function App() {
  const path = window.location.pathname;
  if (path === "/system" || path.endsWith("/system.html")) return <SystemPopup />;
  return <MainShell />;
}

// Keep one React root across Vite HMR re-executions of this module (otherwise the app remounts and loses UI state).
const g = globalThis as unknown as { __levelsRoot?: ReturnType<typeof createRoot> };
const root = g.__levelsRoot ?? (g.__levelsRoot = createRoot(document.getElementById("root")!));
root.render(
  <StrictMode>
    <App />
  </StrictMode>,
);
