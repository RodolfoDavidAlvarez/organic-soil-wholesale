import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [
    react(),
    runtimeErrorOverlay(),
    ...(process.env.NODE_ENV !== "production" && process.env.REPL_ID !== undefined
      ? [await import("@replit/vite-plugin-cartographer").then((m) => m.cartographer())]
      : []),
  ],
  server: {
    host: true, // This allows external connections
    port: 3000, // Match server port
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "client", "src"),
      "@app-entry": path.resolve(__dirname, "client", "src", "AppEntry.tsx"),
      "@shared": path.resolve(__dirname, "shared"),
      "@assets": path.resolve(__dirname, "attached_assets"),
    },
  },
  root: path.resolve(__dirname, "client"),
  base: "./",
  optimizeDeps: {
    include: [
      "@radix-ui/react-select",
      "@radix-ui/react-tooltip",
      "@radix-ui/react-dropdown-menu",
      "@radix-ui/react-dialog",
      "react",
      "react-dom",
      "wouter",
    ],
  },
  build: {
    outDir: path.resolve(__dirname, "dist"),
    emptyOutDir: true,
    assetsDir: "assets",
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ["react", "react-dom", "wouter"],
          ui: ["@radix-ui/react-hover-card", "@radix-ui/react-select", "@radix-ui/react-tabs"],
        },
      },
    },
  },
});
