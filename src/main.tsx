import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource/fraunces/latin-500.css";
import "@fontsource/fraunces/latin-600.css";
import "@fontsource/fraunces/latin-500-italic.css";
import "@fontsource/outfit/latin-400.css";
import "@fontsource/outfit/latin-500.css";
import "@fontsource/outfit/latin-600.css";
import { App } from "./App";
import { StoreProvider } from "./store";
import "./styles.css";

const root = document.getElementById("root");
if (!root) throw new Error("No está el contenedor de Oleaje.");

createRoot(root).render(
  <StrictMode>
    <StoreProvider>
      <App />
    </StoreProvider>
  </StrictMode>,
);
