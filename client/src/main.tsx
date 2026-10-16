import { createRoot } from "react-dom/client";
import "./index.css";
import App from "@app-entry";
import { capturePageAttribution } from "./lib/pageAttribution";

capturePageAttribution();

createRoot(document.getElementById("root")!).render(<App />);
