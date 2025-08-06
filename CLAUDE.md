# CLAUDE.md

This file provides essential guidance for Claude Code (claude.ai/code) when working with this repository.

## プロジェクト概要

**スカイツリー撮影プランナー（v0.1.0）** - スカイツリーと月・太陽を組み合わせた写真撮影のための最適なタイミングと撮影場所を提案する Web アプリケーション

### 🆕 v0.1.0 主要改善（コードベース整理）
- **型安全性向上**: 主要ファイルで 59 個の any 型を適切な型に修正
- **デッドコード削除**: 使用されていない古いファイル・コメント・デバッグコードを削除
- **ログシステム統一**: console.log を構造化ログシステムに完全置換
- **ESLint エラー解消**: 全ての構文エラーを修正（警告のみ残存）
- **品質保証**: ビルド・動作確認完了、主要機能への影響なし

### ダイヤモンド・パールスカイツリーの定義
- **ダイヤモンドスカイツリー**: 撮影地から見てスカイツリーと太陽の方位角・仰角が一致する現象
- **パールスカイツリー**: 撮影地から見てスカイツリーと月の方位角・仰角が一致する現象

## クイックスタート

```bash
# 開発環境起動（フロントエンド + バックエンド + ワーカー）
npm run dev

# 個別起動
npm run dev:client    # Vite フロントエンド
npm run dev:server    # Express バックエンド
npm run dev:worker    # BullMQ ワーカー

# 型チェック（タスク完了時必須）
npm run typecheck

# テスト実行
npm test

# リント実行
npm run lint
npm run lint:fix      # 自動修正
```

## 重要な実装ガイドライン

### 必須使用システム

1. **ログシステム（必須・ console.log 禁止）**
   ```typescript
   // サーバーサイド・共有コード
   import { getLogger } from '@/shared/utils/logger';
   const logger = getLogger('category');
   
   // クライアントサイド
   import { mapLogger, apiLogger, uiLogger, calculationLogger } from '@/client/utils/logger';
   
   // 使用例
   logger.debug('メッセージ', { データオブジェクト });
   logger.info('情報', { コンテキスト });
   logger.warn('警告', error as Error, { 追加情報 });
   logger.error('エラー', error as Error, { デバッグ情報 });
   
   // ❌ 絶対に使用禁止（ただし tests/ ディレクトリ以下は例外）
   // console.log, console.warn, console.error, console.info, console.debug
   ```

2. **高精度天体計算（優先使用）**
   ```typescript
   import { getPreciseSunPosition, getPreciseMoonPosition } from '@/shared/core/astronomy/precise';
   ```

3. **型安全性**
   ```typescript
   import { isApiSuccessResponse } from '@/shared/utils/type-guards';
   import { apiClient } from '@/shared/utils/api';
   ```

4. **地図コンポーネント**
   ```typescript
   import { SkytreeShootingMap } from '@/client/components/map';
   import { useLeafletMap, useMapMarkers } from '@/client/hooks';
   ```

### 精度レベル選択指針
- **仰角 15 度以上**: 基本計算
- **仰角 5-15 度**: 標高データ考慮推奨
- **仰角 5 度以下**: 全補正必須

## アーキテクチャ概要

### システム構成（3 層アーキテクチャ）

1. **プレゼンテーション層**
   - Vite + React + TypeScript (フロントエンド)
   - Tailwind CSS + CSS Modules (スタイリング)
   - Leaflet (地図表示)

2. **ビジネスロジック層**
   - Express.js + TypeScript (API サーバー)
   - 自前天体計算エンジン (月・太陽位置計算)
   - 高精度測地計算 (地球曲率・大気差補正)

3. **データアクセス層**
   - Redis (キャッシュ・セッション)
   - BullMQ (ジョブキュー・ワーカー)
   - 国土地理院 API (標高データ)

### 主要ディレクトリ構造
```
src/
├── client/           # フロントエンド
│   ├── components/   # React コンポーネント
│   │   ├── map/      # 地図コンポーネント
│   │   ├── admin/    # 管理画面
│   │   ├── features/ # 機能別コンポーネント
│   │   └── ui/       # UI 基底コンポーネント
│   ├── hooks/        # カスタムフック
│   └── services/     # API クライアント
├── server/           # バックエンド
│   ├── routes/       # API エンドポイント
│   ├── services/     # ビジネスロジック
│   └── middleware/   # ミドルウェア
└── shared/           # 共有コード
    ├── types/        # TypeScript 型定義
    ├── utils/        # 共通ユーティリティ
    └── core/         # コアロジック
        ├── astronomy/# 天体計算
        └── geometry/ # 幾何計算
```

## 開発原則
1. **型安全性を最優先** - TypeScript 厳密設定、型ガード活用
2. **ログ基盤必須使用** - console.*は絶対禁止（tests/ディレクトリ以下は例外）、構造化ログ徹底
3. **テスト駆動開発** - 実装前にテスト作成
4. **段階的実装** - フェーズ別確実進歩
5. **ドキュメント同期** - コード変更時の同期更新

## タスク完了時の必須チェック

すべてのタスク完了前に以下を実行：

```bash
# 型チェック（必須）
npm run typecheck

# リント・自動修正
npm run lint:fix

# テスト実行
npm test

# 完全品質チェック
npm run build    # プロダクションビルド確認
```

## よく使用するコマンド

### ビルド関連
```bash
npm run build            # 全体ビルド
npm run build:client     # フロントエンドのみ
npm run build:server     # バックエンドのみ
npm start                # 本番サーバー起動
```

### 開発ツール
```bash
npm run create-admin            # 管理者作成
npm run check-circular          # 循環依存チェック
npm run validate-architecture   # アーキテクチャ検証
npm run performance-check       # パフォーマンス分析
```

## 包括的ドキュメント

### 📋 プロジェクト管理
- 📊 **[プロジェクト実装状況](./docs/project-status.md)** - 現在の進捗とロードマップ
- 📄 **[ドキュメント概要](./docs/README.md)** - 全ドキュメントの構成と概要

### 🏗️ アーキテクチャ・技術
- 🏗️ **[システムアーキテクチャ](./docs/architecture.md)** - 技術選択とシステム設計詳細
- 📖 **[API 仕様書](./docs/api-specification.md)** - RESTful API 詳細仕様

### 💻 開発・実装
- 📋 **[開発ガイドライン](./docs/development-guide.md)** - コーディング規約、TDD、開発原則
- ⚙️ **[環境・実装ガイド](./docs/setup-guide.md)** - 環境構築から実装方法まで

### 🤖 AI 活用・協業
- 🤖 **[Claude 活用ガイド](./docs/ai-assistance/claude-agent-guide.md)** - AI 開発エージェント活用法
- 💎 **[Gemini 活用ガイド](./docs/ai-assistance/gemini-usage.md)** - 三位一体開発原則

### 📚 参考資料
- 📸 **[撮影現場の知見](./docs/shooting-reality.md)** - 実際の撮影例と実用的知見

## サブエージェント活用

複雑なタスクには積極的にサブエージェントを活用してください。詳細は [Claude 活用ガイド](./docs/ai-assistance/claude-agent-guide.md) を参照。

### 効果的なプロンプト例
```
[対象モジュール]の包括的な[タスクタイプ]が必要です。
まず、すべての関連ファイルを分析して[分析観点]を理解し、
次に体系的に[実装内容]を行ってください。
```