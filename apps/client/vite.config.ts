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
    // Performance: Optimize bundle splitting
    rollupOptions: {
      output: {
        manualChunks: {
          // Core React libraries (最も安定、キャッシュ効率最大)
          'react-vendor': ['react', 'react-dom'],
          // ルーティング（React とは分離でより効率的キャッシュ）
          'router-vendor': ['react-router-dom'],
          // 地図関連（大容量、遅延ローディング対象）
          'map-vendor': ['leaflet', 'react-leaflet'],
          // UI コンポーネント（頻繁更新される可能性）
          'ui-vendor': ['@headlessui/react', 'lucide-react'],
          // 内部パッケージ（開発時に変更される可能性が高い）
          'internal-vendor': [
            '@skytree-photo-planner/types',
            '@skytree-photo-planner/ui', 
            '@skytree-photo-planner/utils'
          ],
          // 管理画面（遅延ローディング対象）
          'admin': [
            './src/pages/AdminPage.tsx',
            './src/components/admin/AdminLayout.tsx',
            './src/components/admin/Dashboard.tsx',
            './src/components/admin/LocationManager.tsx',
            './src/components/admin/QueueManager.tsx',
            './src/components/admin/SystemSettingsManager.tsx'
          ]
        },
        // Optimize chunk file names
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
