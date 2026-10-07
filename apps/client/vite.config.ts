import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { readFileSync } from "fs";

// package.json を読み込む
const packageJson = JSON.parse(
  readFileSync(path.resolve(__dirname, "./package.json"), "utf-8")
);

export default defineConfig({
  root: __dirname,
  publicDir: "public",
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@skytree-photo-planner/types": path.resolve(
        __dirname,
        "../../packages/types/src",
      ),
      "@skytree-photo-planner/utils": path.resolve(
        __dirname,
        "../../packages/utils/src",
      ),
      "@skytree-photo-planner/ui": path.resolve(__dirname, "../../packages/ui/src"),
    },
  },
  server: {
    port: 3000,
    proxy: {
      "/api": {
        target: "http://localhost:3001",
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: "dist",
    sourcemap: true,
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            {
              name: "react-vendor",
              test: /node_modules\/(react|react-dom)\//,
            },
            {
              name: "router-vendor",
              test: /node_modules\/react-router-dom\//,
            },
            {
              name: "map-vendor",
              test: /node_modules\/(leaflet|react-leaflet)\//,
            },
            {
              name: "ui-vendor",
              test: /node_modules\/(@headlessui\/react|lucide-react)\//,
            },
            {
              name: "internal-vendor",
              test: /packages\/(types|ui|utils)\//,
            },
            {
              name: "admin",
              test: /src\/(pages\/AdminPage|components\/admin\/(AdminLayout|Dashboard|LocationManager|QueueManager|SystemSettingsManager))\.tsx$/,
            },
          ],
        },
        chunkFileNames: 'assets/[name]-[hash].js',
        entryFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]'
      }
    },
    // Performance Budget - warn for chunks over 150KB (より厳格)
    chunkSizeWarningLimit: 150,
    // Enable advanced optimizations
    target: 'esnext',
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true, // Remove console.logs in production
        drop_debugger: true,
        pure_funcs: ['console.info', 'console.debug', 'console.warn'] // より多くのログを削除
      },
      mangle: {
        safari10: true // Safari 10+ サポート
      }
    },
    // CSS 最適化
    cssCodeSplit: true,
    // ツリーシェイキング強化
    assetsInlineLimit: 4096, // 4KB 以下のアセットをインライン化
  },
  define: {
    "import.meta.env.APP_VERSION": JSON.stringify(packageJson.version),
    "import.meta.env.APP_NAME": JSON.stringify(packageJson.name),
  },
});
