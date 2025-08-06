# ドキュメント

**バージョン 0.1.0** - 初版・プロトタイプ（コードベース整理強化版）

ダイヤモンドスカイツリー・パールスカイツリーカレンダープロジェクトの技術文書集です。

## v0.1.0 初版の特徴

### コード品質・型安全性の大幅強化
- **型安全性向上**: 59 個以上の `any` 型を適切な TypeScript 定義に修正
- **デッドコード除去**: 未使用ファイル・コメント・デバッグコードの完全クリーンアップ  
- **ログシステム統一**: `console.log` から構造化ログ（Pino）への完全移行
- **ESLint エラー解消**: 全構文エラーを修正（警告のみ残存）
- **ビルド検証**: 機能影響なしでのビルド成功確認

### プロトタイプとしての完成度
v0.1.0 は初版リリースとして、基本機能の実装と高い技術品質を両立したプロトタイプです。

## 文書一覧

### 📋 [API リファレンス](./api.md)
RESTful API の詳細仕様とエンドポイント情報

### 🛠️ [インストールガイド](./installation.md)
Docker 環境・ローカル環境での詳細セットアップ手順

### 🏗️ [アーキテクチャ設計](./architecture.md)
システム構成・技術選択・設計思想の解説

### 🌟 [天体計算システム](./astronomical-calculations.md)
Astronomy Engine を使った高精度計算の詳細と最新改善

### 🏢 [スカイツリー頂仰角計算](./skytree-elevation-calculation.md)
地球曲率・大気屈折を考慮した高精度仰角計算システム

### 💎 [ダイヤモンドスカイツリー・パールスカイツリーの定義と検出](./diamond-pearl-skytree-conditions.md)
物理的定義、観測条件、高精度検出アルゴリズムの包括的解説

### 📱 [UI/UX 改善履歴](./ui-improvements.md)
カレンダー表示とインターフェースの視認性向上

### 🔧 [開発ツール](./development-tools.md)
デバッグスクリプトと開発支援ツール群

### 🔍 [トラブルシューティング](./troubleshooting.md)
よくある問題と解決方法・診断ツール

### 🐛 [デバッグガイド](./debug.md)
開発時のデバッグ手順とヘルスチェック方法

### ⚡ [パフォーマンス分析](./performance-analysis.md)
詳細なパフォーマンス分析結果と改善提案

### 🌙 [Astronomy Engine 分析](./astronomy-engine-analysis.md)
時刻処理の詳細分析と修正箇所の特定

### 🚀 [キューシステムガイド](./queue-system.md)
BullMQ ベースの非同期バッチ処理システム

### 📏 [お気に入り機能](./favorites-feature.md)
撮影地点とイベントのお気に入り管理機能

### 📡 [API 仕様書](./api-specification.md)
詳細な API エンドポイント仕様とレスポンス形式

## プロジェクト概要

ダイヤモンドスカイツリー・パールスカイツリーカレンダーは、ダイヤモンドスカイツリーとパールスカイツリーの撮影に最適な日時と場所を表示する Web アプリケーションです。NASA JPL 準拠の Astronomy Engine による高精度な天体計算に基づいて、写真愛好家が効率的に撮影計画を立てられる情報を提供します。

## 技術スタック（モノレポ構成）

### アーキテクチャ - v0.1.0 初版の特徴
- **モノレポ構成**: npm workspaces による効率的なパッケージ管理
- **型安全な開発**: TypeScript strict mode でフロント・バック・共有パッケージ全体
- **品質重視**: 厳密な型安全性・構造化ログ・ ESLint 準拠

### フロントエンド (@skytree-photo-planner/client)
- React 18 + TypeScript (strict mode)
- Tailwind CSS v3.4.17 + CSS Modules
- Leaflet (地図表示・ルート描画)
- Vite (高速ビルドツール)

### バックエンド (@skytree-photo-planner/server)
- Node.js + Express + TypeScript (strict mode)
- PostgreSQL 15 + Prisma ORM (データベース)
- Redis + BullMQ (キャッシュ・非同期キューシステム)
- Astronomy Engine (高精度天体計算)
- Pino (構造化ログ・ 5-10 倍パフォーマンス向上)
- JWT + bcrypt (認証)

### 共有パッケージ
- **@skytree-photo-planner/types**: 共通型定義・インターフェース
- **@skytree-photo-planner/utils**: 時刻処理、ログ、フォーマッター
- **@skytree-photo-planner/ui**: 再利用可能 React コンポーネント
- **@skytree-photo-planner/shared**: 共通ビジネスロジック

### セキュリティ・インフラ
- Helmet + Rate limiting + CSRF/XSS 対策
- Docker & Docker Compose + nginx
- 包括的デバッグスクリプト群

## 開発者向けクイックスタート（モノレポ）

```bash
# リポジトリクローン
git clone <repository-url>
cd skytree-photo-planner

# Docker 環境で起動（推奨）
docker-compose up -d --build

# または npm workspaces で開発
npm install
npm run dev  # フロントエンド + バックエンド + ワーカー同時起動

# v0.1.0 品質チェック（タスク完了時必須）
npm run typecheck  # TypeScript 型チェック
npm run lint:fix   # ESLint 自動修正
npm run build     # プロダクションビルド確認

# アクセス
# フロントエンド: http://localhost
# バックエンド API: http://localhost/api
# 管理者ログイン: admin / admin123
```

## 主要機能

- 📅 月間カレンダーでのダイヤモンドスカイツリー・パールスカイツリー表示
- 🏔️ 全国の撮影地点情報とアクセス方法
- ⏰ JST 時刻での正確な発生時刻計算
- 🗺️ Leaflet マップでの撮影地点表示
- 📊 撮影推奨度とベストタイミング提案
- 🔐 管理者による撮影地点管理

## 貢献ガイド（v0.1.0 品質基準）

1. **イシューの確認**: 既存のイシューまたは新規作成
2. **ブランチの作成**: `feature/your-feature-name`
3. **開発**: TDD 推奨、厳密な型安全性維持
4. **品質チェック**: 必須実行
   - `npm run typecheck` - TypeScript 型チェック
   - `npm run lint:fix` - ESLint 自動修正
   - `npm run build` - ビルド確認
5. **テスト**: `npm test` でテスト実行
6. **プルリクエスト**: 詳細な説明とテストケース

### v0.1.0 開発原則
- `console.log` 禁止 → 構造化ログ（Pino）使用
- `any` 型禁止 → 適切な TypeScript 型定義
- デッドコード撲滅 → 使用されていないコード即削除

## ライセンス

MIT License - 詳細は [LICENSE](../LICENSE) ファイルを参照