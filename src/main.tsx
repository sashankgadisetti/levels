import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles/globals.css";
import { MainShell } from "./components/MainShell";
import { SystemPopup } from "./components/SystemPopup";
import { bootstrapStore } from "./store/bootstrap";

bootstrapStore();

// Tiny pathname router. Works for dev ("/system") and the built multi-page app ("/system.html").
export function App() {
  const path = window.location.pathname;
  if (path === "/system" || path.endsWith("/system.html")) return <SystemPopup />;
  return <MainShell />;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
