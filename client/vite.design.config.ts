import { defineConfig, mergeConfig } from "vite";
import base from "./vite.config";

// Local design preview: public reads work; commerce/form writes stay disabled.
export default mergeConfig(base, defineConfig({
  plugins: [{
    name: "local-design-preview",
    transformIndexHtml(html) {
      return html
        .replace(/<script>\s*window\.dataLayer[\s\S]*?<\/script>/, "")
        .replace(/<noscript>[\s\S]*?googletagmanager[\s\S]*?<\/noscript>/g, "")
        .replace('<meta name="robots" content="index, follow" />', '<meta name="robots" content="noindex,nofollow" />');
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url?.startsWith("/api/") && !["GET", "HEAD"].includes(req.method || "GET")) {
          res.statusCode = 409;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ error: "This local design preview does not submit orders or forms." }));
          return;
        }
        next();
      });
    },
  }],
  server: {
    host: "127.0.0.1", port: 5188, strictPort: true,
    proxy: { "/api": { target: "https://www.organicsoilwholesale.com", changeOrigin: true } },
    fs: { allow: [new URL("..", import.meta.url).pathname, "/Users/rodolfoalvarez/Documents/Soil Seed and Water"] },
  },
}));
