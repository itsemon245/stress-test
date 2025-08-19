import { defineConfig } from "vite";
import laravel from "laravel-vite-plugin";
import react from "@vitejs/plugin-react";
import MillionLint from "@million/lint";
import path from "path";
import { watch } from "vite-plugin-watch";
import Icons from "unplugin-icons/vite";

export default defineConfig({
  plugins: [
    laravel({
      input: "resources/js/app.jsx",
      refresh: true,
    }),
    react(),
    Icons({
      prefix: "",
      compiler: "jsx",
      jsx: "react",
    }),
    // Auto-generation plugins (same as original)
    watch({
      pattern: [path.resolve(__dirname, "routes/**/*.php")],
      command: "php artisan ziggy:generate --types",
    }),
    watch({
      pattern: [path.resolve(__dirname, "app/Models/**/*.php")],
      command: "php artisan model:typer",
    }),
    watch({
      pattern: [
        path.resolve(__dirname, "app/Data/**/*.php"),
        path.resolve(__dirname, "app/Enums/**/*.php"),
      ],
      command: "php artisan typescript:transform",
    }),
  ],
  resolve: {
    extensions: [".tsx", ".ts", ".jsx", ".js"],
    alias: {
      "@": path.resolve(__dirname, "resources/js"),
    },
  },
  build: {
    // CRITICAL: CDN configuration for production builds
    // This tells Vite to generate URLs pointing to CDN instead of local paths
    base: process.env.CDN_BASE_URL || "https://cdn.artistly.ai/",

    // CRITICAL: Output optimization for CDN deployment
    minify: "terser", // Enable minification for smaller CDN files
    sourcemap: false, // Disable sourcemaps for CDN (smaller uploads)

    rollupOptions: {
      output: {
        // CRITICAL: Asset naming for CDN cache busting
        // Includes content hash for proper cache invalidation
        entryFileNames: "assets/[name]-[hash].js",
        chunkFileNames: "assets/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash].[ext]",
      },
    },

    // CRITICAL: Optimize for CDN delivery
    // Higher chunk size = Fewer files but larger downloads
    // Lower chunk size = More files but smaller individual downloads
    chunkSizeWarningLimit: 1000, // 1MB chunks for better CDN caching

    // Output directory - will be uploaded to CDN
    outDir: "public/build",
    emptyOutDir: true,
  },

  // CRITICAL: Development server optimization
  server: {
    host: "0.0.0.0",
    port: 5173,
    // Use local assets during development
    base: "/",
  },
});
