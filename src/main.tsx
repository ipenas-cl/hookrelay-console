import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { createClient, MockClient } from "./api";
import "./styles.css";

const client = createClient();
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App client={client} mock={client instanceof MockClient} />
  </StrictMode>,
);
