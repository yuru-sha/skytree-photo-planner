# フロントエンド専用 Dockerfile（モノレポ対応）
FROM node:18-slim AS builder

# 必要なパッケージをインストール
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# 作業ディレクトリを設定
WORKDIR /app

# モノレポの package.json をコピー
COPY package*.json ./

# workspaces 設定をコピー
COPY apps/client/package.json ./apps/client/
COPY packages/types/package.json ./packages/types/
COPY packages/utils/package.json ./packages/utils/
COPY packages/ui/package.json ./packages/ui/

# 依存関係をインストール（アーキテクチャ固有のバイナリを強制インストール）
RUN npm cache clean --force && \
    rm -rf node_modules package-lock.json && \
    npm install --no-audit --no-fund && \
    npm install @rollup/rollup-linux-x64-gnu @rollup/rollup-linux-arm64-gnu @esbuild/linux-x64 @esbuild/linux-arm64 --save-optional --no-audit --force

# ソースコードをコピー
COPY . .

# Prisma クライアントを生成（型定義のため）
RUN npx prisma generate

# 共有パッケージをビルド
RUN npm run build:packages

# フロントエンドをビルド（アーキテクチャエラー対策付き）
RUN npm run build:client || \
    (echo "=== BUILD FAILED - Trying binary fix ===" && \
     npm install @rollup/rollup-linux-x64-gnu @rollup/rollup-linux-arm64-gnu @esbuild/linux-x64 @esbuild/linux-arm64 --save-optional --force && \
     npm run build:client || \
     (echo "=== FINAL BUILD FAILED ===" && ls -la apps/client/ && ls -la packages/ && exit 1))

# 静的ファイル配信用
FROM nginx:alpine AS production

# Nginx の設定をコピー
COPY docker/frontend/nginx.conf /etc/nginx/nginx.conf
COPY docker/frontend/default.conf /etc/nginx/conf.d/default.conf

# ビルド済み静的ファイルをコピー
COPY --from=builder /app/apps/client/dist /usr/share/nginx/html

# ヘルスチェック
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://localhost/health || exit 1

# ポートを公開
EXPOSE 80

# Nginx を起動
CMD ["nginx", "-g", "daemon off;"]