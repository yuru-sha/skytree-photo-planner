# Scripts Directory

このディレクトリには、ダイヤモンドスカイツリー・パールスカイツリーカレンダーアプリケーションの運用・開発に必要な最小限のスクリプトが整理されています。

## ディレクトリ構造

### `admin/`
管理者アカウント関連のスクリプト
- `create-admin.js` - 管理者アカウント作成
- `reset-admin.js` - 管理者アカウントリセット

### `config/`
設定ファイルとデプロイメント設定
- `docker-dev.sh` - 開発環境用 Docker 設定
- `docker-prod.sh` - 本番環境用 Docker 設定
- `logrotate.conf` - ログローテーション設定

### `architecture/`
システムアーキテクチャ関連
- `validate.js` - アーキテクチャ検証

### `db/`
データベース関連
- `seed-background-jobs.js` - バックグラウンドジョブシード


## 使用方法

### 基本コマンド
```bash
# 管理者アカウント作成
node scripts/admin/create-admin.js

# 管理者アカウントリセット
node scripts/admin/reset-admin.js

# バックグラウンドジョブシード
node scripts/db/seed-background-jobs.js
```

### 開発環境セットアップ
```bash
# Docker 開発環境
bash scripts/config/docker-dev.sh

# アーキテクチャ検証
node scripts/architecture/validate.js
```

## 注意事項

1. **環境変数**: 本番環境では適切な環境変数設定が必要
2. **データベース**: PostgreSQL + Redis が起動している必要があります
3. **権限**: 管理者スクリプトは適切な権限で実行してください
4. **ログ**: 全スクリプトは Pino ロガーを使用した構造化ログを出力します

## 削除されたスクリプト

v0.1.0 での整理により、以下のカテゴリのスクリプトが削除されました：
- デバッグスクリプト（debug/）
- テストスクリプト（testing/）
- パフォーマンス分析スクリプト（performance/）
- データ生成スクリプト（data-generation/）
- ユーティリティスクリプト（utilities/）

これらの機能は必要に応じて本体アプリケーションに統合されています。