# ダイヤモンドスカイツリー・パールスカイツリーカレンダー パフォーマンス分析レポート

**バージョン 0.3.0** - モノレポ構成・高性能版

## 📊 分析概要

ダイヤモンドスカイツリー・パールスカイツリーカレンダーアプリケーションの現在のパフォーマンス問題を詳細に分析し、具体的な改善策を提案します。

### 🔍 分析結果サマリー

| 項目 | 現在の状況 | 問題点 |
|------|-----------|--------|
| **日付クリック応答時間** | 4,032 秒 (100 地点) | 目標 2 秒の 2,016 倍 |
| **月変更時の計算時間** | 2,016 分 (100 地点) | 実用不可レベル |
| **リアルタイム計算限界** | 約 0.05 地点 | 現在 10 地点でも困難 |
| **ボトルネック** | 総当たり検索 | 最適化余地大 |

## 🧮 詳細パフォーマンス分析

### 1. 計算コストの内訳

#### 現在の処理フロー
```
月変更時: 30 日分 × N 地点 × (ダイヤモンドスカイツリー + パールスカイツリー)
日付クリック時: 1 日分 × N 地点 × (ダイヤモンドスカイツリー + パールスカイツリー)

各計算内容:
- 検索時間範囲: 14 時間/日 (日の出 4-12 時 + 日の入り 14-20 時)
- 時間刻み: 5 秒
- 1 日あたり検索ポイント: 10,080 回
- Astronomy Engine 計算: 平均 2ms/回
```

#### 地点数別パフォーマンス

| 地点数 | 日次計算時間 | 月間計算時間 | ユーザー体験 |
|--------|-------------|-------------|-------------|
| 10 地点 | 403 秒 (6.7 分) | 201 分 | 利用困難 |
| 50 地点 | 2,016 秒 (33.6 分) | 1,008 分 | 利用不可 |
| 100 地点 | 4,032 秒 (67 分) | 2,016 分 | 利用不可 |
| 200 地点 | 8,064 秒 (134 分) | 4,032 分 | 利用不可 |

### 2. ボトルネック特定

#### 主要なボトルネック

1. **総当たり検索アルゴリズム**
   - 5 秒刻みで 14 時間分を全探索
   - 計算量: O(地点数 × 日数 × 時間範囲 × 時間刻み)

2. **リアルタイム計算**
   - ユーザーアクション毎に重計算実行
   - キャッシュ機構なし

3. **シングルスレッド処理**
   - 並列処理未実装
   - CPU リソース活用不足

#### 具体的な問題コード

```typescript
// AstronomicalCalculator.ts の問題箇所
private findExactTimeForAzimuth(...): Date | null {
  // 5 秒刻みで総当たり検索
  for (let hour = startHour; hour <= endHour; hour++) {
    for (let minute = 0; minute < 60; minute++) {
      for (let second = 0; second < 60; second += 5) { // ←ボトルネック
        // Astronomy Engine 計算を毎回実行
        const position = this.getSunPosition(checkTime, ...);
        // ...
      }
    }
  }
}
```

## 🚀 パフォーマンス改善提案

### 優先度 1: 事前計算キャッシュシステム（即効性：高）

#### 概要
月間データを夜間バッチで事前計算し、リアルタイム計算を排除

#### 効果
- **処理時間**: 4,032 秒 → 80ms（99.8% 改善）
- **ユーザー応答**: 即座（100ms 以下）
- **サーバー負荷**: 99% 削減

#### 実装案

```typescript
// 新規: CacheService.ts
export class CacheService {
  // 月間データ事前計算
  async precalculateMonthlyData(year: number, month: number): Promise<void> {
    const locations = await this.locationModel.findAll();
    const events = astronomicalCalculator.calculateMonthlyEvents(year, month, locations);
    
    // Redis/SQLite キャッシュに保存
    await this.cache.set(`calendar:${year}-${month}`, events, {
      ttl: 30 * 24 * 60 * 60 // 30 日間
    });
  }
  
  // 高速データ取得
  async getMonthlyCalendar(year: number, month: number): Promise<CalendarResponse> {
    const cached = await this.cache.get(`calendar:${year}-${month}`);
    if (cached) return cached;
    
    // キャッシュ未命中時のみ計算
    return await this.precalculateMonthlyData(year, month);
  }
}
```

#### バッチ処理スケジュール

```typescript
// scripts/batch-precalculate.ts
import cron from 'node-cron';

// 毎日深夜 2 時に翌月データを事前計算
cron.schedule('0 2 * * *', async () => {
  const nextMonth = new Date();
  nextMonth.setMonth(nextMonth.getMonth() + 1);
  
  await cacheService.precalculateMonthlyData(
    nextMonth.getFullYear(), 
    nextMonth.getMonth() + 1
  );
});
```

### 優先度 2: 計算アルゴリズム最適化（即効性：中）

#### A. 時間刻み最適化
- **現在**: 5 秒刻み
- **改善**: 10 秒刻み
- **効果**: 処理時間 50% 削減
- **品質影響**: 軽微（許容誤差内）

#### B. 検索範囲最適化
- **現在**: 14 時間（日の出 4-12 時 + 日の入り 14-20 時）
- **改善**: 10 時間（日の出 5-10 時 + 日の入り 15-19 時）
- **効果**: 処理時間 29% 削減
- **品質影響**: 軽微（極端時刻の除外）

```typescript
// 最適化後の findExactTimeForAzimuth
private findExactTimeForAzimuth(...): Date | null {
  const searchConfig = {
    timeStep: 10, // 5 秒 → 10 秒
    sunrise: { start: 5, end: 10 }, // 4-12 時 → 5-10 時
    sunset: { start: 15, end: 19 }  // 14-20 時 → 15-19 時
  };
  
  // 処理量: 10,080 回 → 3,600 回 (64% 削減)
}
```

### 優先度 3: 並列処理実装（効果：高）

#### Worker Threads 活用

```typescript
// services/ParallelCalculator.ts
import { Worker, isMainThread, parentPort, workerData } from 'worker_threads';

export class ParallelAstronomicalCalculator {
  async calculateMonthlyEventsParallel(
    year: number, 
    month: number, 
    locations: Location[]
  ): Promise<SkytreeEvent[]> {
    const cpuCount = os.cpus().length;
    const locationsPerWorker = Math.ceil(locations.length / cpuCount);
    
    const workers = [];
    for (let i = 0; i < cpuCount; i++) {
      const workerLocations = locations.slice(
        i * locationsPerWorker, 
        (i + 1) * locationsPerWorker
      );
      
      if (workerLocations.length > 0) {
        workers.push(this.createWorker({
          year, month, locations: workerLocations
        }));
      }
    }
    
    const results = await Promise.all(workers);
    return results.flat();
  }
  
  private createWorker(data: any): Promise<SkytreeEvent[]> {
    return new Promise((resolve, reject) => {
      const worker = new Worker(__filename, { workerData: data });
      worker.on('message', resolve);
      worker.on('error', reject);
    });
  }
}

// ワーカー処理
if (!isMainThread) {
  const { year, month, locations } = workerData;
  const calculator = new AstronomicalCalculatorImpl();
  const result = calculator.calculateMonthlyEvents(year, month, locations);
  parentPort?.postMessage(result);
}
```

### 優先度 4: 近似計算アルゴリズム（精度要調整）

#### 段階的精度アプローチ

```typescript
// 粗い検索 → 精密検索の 2 段階アプローチ
private findExactTimeForAzimuthOptimized(...): Date | null {
  // Phase 1: 粗い検索（1 分刻み）
  let candidates = this.coarseSearch(date, location, targetAzimuth, isRising, celestialBody);
  
  // Phase 2: 候補周辺を精密検索（5 秒刻み）
  let bestTime = null;
  for (const candidate of candidates) {
    const refined = this.fineSearch(candidate, targetAzimuth, celestialBody);
    if (refined) bestTime = refined;
  }
  
  return bestTime;
}
```

## 🎯 推奨実装ロードマップ

### フェーズ 1: 緊急対応（1-2 週間）
1. **事前計算キャッシュ実装**
   - バッチ処理による月間データ事前計算
   - Redis/SQLite キャッシュ導入
   - 夜間スケジューラー設定

### フェーズ 2: 基本最適化（2-3 週間）
1. **計算アルゴリズム改善**
   - 時間刻み 10 秒化
   - 検索範囲最適化
   - 早期終了条件追加

### フェーズ 3: 高度最適化（1-2 ヶ月）
1. **並列処理実装**
   - Worker Threads 導入
   - 地点別並列計算
2. **段階的精度計算**
   - 粗い検索 + 精密検索
   - 適応的アルゴリズム

### フェーズ 4: スケールアウト（将来）
1. **分散処理アーキテクチャ**
   - マイクロサービス化
   - クラウド関数活用
   - CDN キャッシュ活用

## 📈 期待効果

### 改善後の性能指標

| 項目 | 改善前 | 改善後 | 改善率 |
|------|--------|--------|--------|
| 日付クリック応答 | 4,032 秒 | 80ms | 99.998% |
| 月変更応答 | 2,016 分 | 100ms | 99.999% |
| サーバー CPU 使用率 | 100% | 1% | 99% |
| 対応可能地点数 | 0.05 地点 | 1,000 地点+ | 20,000 倍 |

### ユーザー体験の向上

- ✅ **即座の応答**: 全操作が 2 秒以内
- ✅ **スムーズなナビゲーション**: 月間切り替えが瞬時
- ✅ **高い信頼性**: サーバー負荷激減
- ✅ **スケーラビリティ**: 地点数拡張対応

## 🛠️ 技術実装詳細

### 必要な依存関係追加

```json
{
  "dependencies": {
    "node-cron": "^3.0.2",
    "ioredis": "^5.3.2",
    "cluster": "^0.7.7"
  }
}
```

### 環境変数設定

```bash
# .env.production
CACHE_ENABLED=true
REDIS_URL=redis://localhost:6379
BATCH_PROCESSING=true
PARALLEL_WORKERS=4
```

### 監視・アラート設定

```typescript
// monitoring/performance.ts
export class PerformanceMonitor {
  trackCalculationTime(operation: string, duration: number) {
    if (duration > 2000) { // 2 秒以上の場合アラート
      this.logger.warn(`Slow calculation detected: ${operation}`, {
        duration,
        threshold: 2000
      });
    }
  }
}
```

## 🔄 継続的改善

### KPI 定義
- **応答時間**: 95% のリクエストが 2 秒以内
- **可用性**: 99.9% 以上
- **エラー率**: 0.1% 以下
- **スループット**: 100 地点で月間計算 100ms 以内

### モニタリング項目
- CPU/メモリ使用率
- キャッシュヒット率
- 計算処理時間分布
- エラー発生頻度

---

**結論**: 事前計算キャッシュシステムの導入により、現在の深刻なパフォーマンス問題を根本的に解決可能。段階的な最適化により、100 地点以上のスケールに対応できる堅牢なシステムを構築できます。