import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "@/App";
import "@/styles/globals.css";

void window.addEventListener("unhandledrejection", (event) => {
  event.preventDefault();
  console.error("[samy-soft] promesse non gérée :", event.reason);
});
ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
