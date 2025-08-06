# お気に入り機能仕様書

**バージョン 0.3.0** - モノレポ構成・高性能版

## 概要

ダイヤモンドスカイツリー・パールスカイツリーカレンダーのお気に入り機能は、ユーザーが関心のある撮影地点やイベントを保存・管理できる機能です。クライアントサイドの LocalStorage を使用してデータを永続化し、サーバーに依存しない設計になっています。

## 機能詳細

### 基本機能

#### 1. お気に入り地点管理
- **追加**: 撮影地点詳細ページからお気に入りに追加
- **削除**: 個別削除・一括削除対応
- **表示**: 都道府県別グループ表示
- **統計**: 総登録地点数・都道府県数の表示

#### 2. お気に入りイベント管理
- **自動追加**: お気に入り地点で発生するイベントを自動検出・追加
- **手動追加**: 個別イベントの手動お気に入り登録
- **時系列管理**: 過去・今後のイベントを分類表示
- **クリックナビゲーション**: お気に入りイベントクリックでカレンダー詳細へジャンプ

#### 3. データポータビリティ
- **エクスポート**: JSON 形式でお気に入りデータをダウンロード
- **インポート**: JSON ファイルからお気に入りデータを復元
- **バックアップ**: 手動バックアップ機能

#### 4. 一括操作
- **選択管理**: チェックボックスによる複数選択
- **一括削除**: 選択したアイテムの一括削除
- **全選択/全解除**: ワンクリックでの選択状態切り替え

## 技術仕様

### データ構造

#### FavoriteLocation 型
```typescript
interface FavoriteLocation {
  locationId: number;
  name: string;
  prefecture: string;
  addedAt: string; // ISO 文字列
}
```

#### FavoriteEvent 型
```typescript
interface FavoriteEvent {
  id: string; // 一意識別子
  locationId: number;
  locationName: string;
  type: 'diamond' | 'pearl';
  subType: 'sunrise' | 'sunset' | 'rising' | 'setting';
  time: string; // ISO 文字列
  addedAt: string; // ISO 文字列
}
```

#### Favorites 型
```typescript
interface Favorites {
  locations: FavoriteLocation[];
  events: FavoriteEvent[];
  version: string; // データバージョン
  lastUpdated: string; // ISO 文字列
}
```

### LocalStorage 管理

#### キー名
- `skytree-photo-planner-favorites`: メインデータストレージ

#### データ永続化
- JSON.stringify/JSON.parse によるシリアライゼーション
- データ整合性チェック（不正データの自動修復）
- バージョン管理機能

### React Hook 統合

#### useFavorites Hook
```typescript
interface UseFavoritesReturn {
  // 状態
  favoriteLocations: FavoriteLocation[];
  upcomingFavoriteEvents: FavoriteEvent[];
  pastFavoriteEvents: FavoriteEvent[];
  stats: FavoriteStats;
  
  // アクション
  addLocationToFavorites: (location: Location) => void;
  removeLocationFromFavorites: (locationId: number) => void;
  addEventToFavorites: (event: SkytreeEvent) => void;
  removeEventFromFavorites: (eventId: string) => void;
  
  // ユーティリティ
  isLocationFavorited: (locationId: number) => boolean;
  isEventFavorited: (eventId: string) => boolean;
  refreshFavorites: () => void;
  
  // データ管理
  exportFavorites: () => string;
  importFavorites: (jsonData: string) => void;
  clearAllFavorites: () => void;
}
```

#### FavoriteStats 型
```typescript
interface FavoriteStats {
  totalLocations: number;
  totalEvents: number;
  upcomingEvents: number;
  pastEvents: number;
  prefectures: number;
}
```

## UI/UX 仕様

### ホームページ統合

#### サイドバー表示
- お気に入り統計（地点数・今後のイベント数）
- 今後のお気に入りイベント一覧（最大 3 件）
- 「他 X 件のお気に入り」リンク

#### ナビゲーション機能
- お気に入りイベントクリック → カレンダーの該当日にジャンプ
- 自動月切り替え・詳細表示・スムーズスクロール

### お気に入り専用ページ

#### タブ構成
1. **今後のイベント**: 未来のお気に入りイベント一覧
2. **過去のイベント**: 過去のお気に入りイベント一覧  
3. **お気に入り地点**: 登録済み撮影地点一覧

#### 機能ボタン
- **一括削除**: 選択したアイテムの削除
- **エクスポート**: JSON ダウンロード
- **インポート**: JSON アップロード
- **全削除**: 全データクリア（確認ダイアログ付き）

#### イベント表示形式
```
🌅 12/25 06:45 - ダイヤモンドスカイツリー at 田貫湖
🌙 01/15 18:30 - パールスカイツリー at 山中湖
```

#### 地点表示形式
```
📍 田貫湖 (静岡県) - 2024/12/20 に追加
📍 山中湖 (山梨県) - 2024/12/18 に追加
```

## ファイル構成

### サービス層
- `src/client/services/favoritesService.ts`
  - LocalStorage との直接やり取り
  - データバリデーション・修復機能
  - CRUD 操作の実装

### Hook 層
- `src/client/hooks/useFavorites.ts`
  - React コンポーネント向けの state 管理
  - favoritesService のラッパー機能
  - 統計情報の計算

### コンポーネント層
- `src/client/pages/FavoritesPage.tsx`
  - お気に入り専用ページのメインコンポーネント
  - タブ機能・一括操作 UI
  - インポート/エクスポート機能

### スタイル
- `src/client/pages/FavoritesPage.module.css`
  - CSS Modules によるスコープ付きスタイル
  - レスポンシブデザイン対応
  - アクセシビリティ配慮

## セキュリティ・パフォーマンス

### セキュリティ考慮事項
- LocalStorage のサイズ制限対応（通常 5-10MB）
- XSS 対策（データバリデーション）
- JSON インジェクション対策

### パフォーマンス最適化
- 遅延読み込み（必要時のみ LocalStorage 読み取り）
- メモ化（React.useMemo, useCallback 使用）
- 差分更新（全体再描画の回避）

### エラーハンドリング
- LocalStorage 書き込み失敗の検知
- 不正 JSON の自動修復
- データ破損時の安全な初期化

## 今後の拡張予定

### Phase 2 機能
- **タグ機能**: お気に入りアイテムのカテゴリ分類
- **メモ機能**: 個別アイテムへのユーザーメモ添付
- **共有機能**: お気に入りデータの URL 共有

### Phase 3 機能
- **クラウド同期**: オプショナルなサーバー同期機能
- **通知機能**: お気に入りイベント前の通知
- **統計ダッシュボード**: 詳細な利用統計表示

## 関連ドキュメント

- [API 仕様書](./api-specification.md)
- [フロントエンド設計書](./frontend-architecture.md)
- [デプロイメントガイド](./deployment-guide.md)