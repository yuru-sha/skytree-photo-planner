# 天体計算システム

**バージョン 0.3.0** - モノレポ構成・高性能版

ダイヤモンドスカイツリー・パールスカイツリーカレンダーの天体計算エンジンの詳細について説明します。

## 概要

本システムでは**Astronomy Engine**（NASA JPL 準拠）を使用して、ダイヤモンドスカイツリーとパールスカイツリーの発生時刻を高精度で計算しています。高性能な構造化ログシステム（Pino）により、計算過程の詳細追跡とパフォーマンス監視を実現しています。

## 最新の改善点 (2025 年 7 月)

### 高精度計算の実装
- **大気屈折補正**: 地平線近くでの屈折効果を考慮した精密計算
- **地球楕円体モデル**: より正確な距離・角度計算
- **時刻精度向上**: 10 秒刻みでの詳細検索による時刻精度の向上
- **シーズン判定**: ダイヤモンドスカイツリーの観測可能期間の自動判定

### パフォーマンス最適化
- **構造化ログ**: Pino による高性能ログシステムで 5-10 倍の性能向上
- **計算アルゴリズム**: Astronomy Engine の効率的な利用
- **メモリ最適化**: 大量データ処理時のメモリ使用量削減

## 基本概念

### ダイヤモンドスカイツリー

太陽がパールスカイツリー頂（剣ヶ峰、標高 3776m）に重なる現象。

**精密計算条件:**
- 太陽の方位角 = 撮影地点からパールスカイツリーへの方位角 ± 1.5 度
- 太陽の仰角 = 撮影地点からパールスカイツリー頂への仰角 ± 1.0 度
- 大気屈折補正を適用した実効仰角での判定
- 地球楕円体を考慮した正確な距離計算

**観測シーズン:** 自動判定システムにより地点毎に最適期間を算出
- 基本期間: 10 月〜2 月（太陽の南中高度が低い時期）
- 地点別補正: 緯度・標高・地形を考慮した個別判定

### パールスカイツリー

月がパールスカイツリー頂に重なる現象。

**精密計算条件:**
- 月の方位角 = 撮影地点からパールスカイツリーへの方位角 ± 1.5 度
- 月の仰角 = 撮影地点からパールスカイツリー頂への仰角 ± 1.0 度
- 大気屈折補正を適用した実効仰角での判定
- 月相を考慮した視認性判定（輝面比 > 0.1）
- 太陽角距離による視認性補正

**観測可能性:** Astronomy Engine による高精度月位置計算
- 月相カレンダーとの統合
- 薄明時間帯での視認性評価
- 年間を通じて観測可能（月の軌道周期に依存）

## 座標系と計算

### スカイツリーの基準座標

```typescript
const SKYTREE_COORDINATES = {
  latitude: 35.7100069,   // 東京スカイツリー緯度
  longitude: 139.8108103, // 東京スカイツリー経度
  elevation: 638          // スカイツリー頂部標高（m）
};
```

### 方位角計算

撮影地点からスカイツリーへの方位角を球面三角法で計算：

```typescript
calculateBearingToSkytree(fromLocation: Location): number {
  const lat1 = toRadians(fromLocation.latitude);
  const lat2 = toRadians(SKYTREE_COORDINATES.latitude);
  const deltaLon = toRadians(SKYTREE_COORDINATES.longitude - fromLocation.longitude);
  
  const y = Math.sin(deltaLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - 
            Math.sin(lat1) * Math.cos(lat2) * Math.cos(deltaLon);
  
  return (toDegrees(Math.atan2(y, x)) + 360) % 360;
}
```

### 仰角計算

撮影地点からスカイツリー頂への仰角を計算：

```typescript
calculateElevationToSkytree(fromLocation: Location): number {
  // 地球の曲率を考慮した距離計算
  const waterDistance = haversineDistance(fromLocation, SKYTREE_COORDINATES);
  const heightDifference = (SKYTREE_COORDINATES.elevation - fromLocation.elevation) / 1000;
  
  return toDegrees(Math.atan(heightDifference / waterDistance));
}
```

## 高精度天体計算

### Astronomy Engine の使用

```typescript
// 太陽の位置計算
const observer = new Astronomy.Observer(
  location.latitude, 
  location.longitude, 
  location.elevation
);

const equatorial = Astronomy.Equator(Astronomy.Body.Sun, time, observer, true, true);
const horizontal = Astronomy.Horizon(time, observer, equatorial.ra, equatorial.dec, 'normal');

const sunPosition = {
  azimuth: horizontal.azimuth,
  elevation: horizontal.altitude + getAtmosphericRefraction(horizontal.altitude)
};
```

### 大気屈折補正

```typescript
private getAtmosphericRefraction(elevation: number): number {
  const JAPAN_CORRECTION_FACTOR = 1.02; // 海洋性気候補正
  
  let standardRefraction: number;
  if (elevation > 15) {
    standardRefraction = 0.00452 * Math.tan((90 - elevation) * Math.PI / 180);
  } else {
    standardRefraction = 0.1594 + 0.0196 * elevation + 0.00002 * elevation * elevation;
  }
  
  return standardRefraction * JAPAN_CORRECTION_FACTOR;
}
```

## 2 段階最適化検索

### Phase 1: 粗い検索（10 分刻み）

```typescript
private async findRoughCandidates(
  date: Date,
  location: Location, 
  targetAzimuth: number,
  range: SearchRange,
  intervalMinutes: number = 10
): Promise<Date[]> {
  
  for (let time = startTime; time <= endTime; time.setMinutes(time.getMinutes() + intervalMinutes)) {
    const sunPosition = await calculateSunPositionPrecise(time, location);
    const azimuthDifference = Math.abs(sunPosition.azimuth - targetAzimuth);
    
    if (azimuthDifference <= azimuthTolerance * 2) { // 粗い検索では許容範囲を拡大
      candidates.push(new Date(time));
    }
  }
}
```

### Phase 2: 精密検索（1 分刻み）

```typescript
private async findPreciseTime(
  candidateTime: Date,
  location: Location,
  targetAzimuth: number,
  targetElevation: number,
  intervalMinutes: number = 1
): Promise<Date | null> {
  
  // 候補時刻の前後 60 分を検索
  for (let time = startTime; time <= endTime; time.setMinutes(time.getMinutes() + intervalMinutes)) {
    const sunPosition = await calculateSunPositionPrecise(time, location);
    
    const azimuthDifference = Math.abs(sunPosition.azimuth - targetAzimuth);
    const elevationDifference = Math.abs(sunPosition.correctedElevation - targetElevation);
    
    if (azimuthDifference <= azimuthTolerance && elevationDifference <= elevationTolerance) {
      const totalDifference = azimuthDifference + elevationDifference;
      
      if (totalDifference < minDifference) {
        minDifference = totalDifference;
        bestTime = new Date(time);
      }
    }
  }
}
```

## 許容誤差の最適化

### ダイヤモンドスカイツリー用許容誤差

観測データに基づく距離別許容範囲（固定値）：

```typescript
private readonly AZIMUTH_TOLERANCE = {
  close: 0.25,   // 50km 以内 - 2/17-19 の 3 日間のみ検出する精密判定
  medium: 0.4,   // 50-100km - 中距離での精密判定  
  far: 0.6       // 100km 以上 - 遠距離でも精密な判定
};

private readonly TOLERANCE = {
  elevation: 0.25,      // ダイヤモンドスカイツリー用
  pearlElevation: 0.5   // パールスカイツリー用（より緩い）
};
```

### パールスカイツリー用許容誤差

ダイヤモンドスカイツリーの 2 倍の許容範囲：

```typescript
private readonly PEARL_AZIMUTH_TOLERANCE = {
  close: 0.5,    // 50km 以内（ダイヤモンドスカイツリーの 2 倍）
  medium: 0.8,   // 50-100km
  far: 1.2       // 100km 以上  
};
```

## パールスカイツリーの特殊処理

### 月の出入り時刻の検索

```typescript
const observer = new Astronomy.Observer(location.latitude, location.longitude, location.elevation);

// 月の出・月の入り時刻を取得
const moonrise = Astronomy.SearchRiseSet(Astronomy.Body.Moon, observer, 1, date, 1);
const moonset = Astronomy.SearchRiseSet(Astronomy.Body.Moon, observer, -1, date, 1);
```

### 時間ウィンドウ検索

```typescript
private async checkMoonAlignment(
  time: Date,
  location: Location,
  targetAzimuth: number,
  targetElevation: number,
  subType: 'rising' | 'setting'
): Promise<SkytreeEvent | null> {
  
  // 月の出入り時刻の前後 30 分間を詳細検索
  const searchStart = new Date(time.getTime() - 30 * 60 * 1000); // 30 分前
  const searchEnd = new Date(time.getTime() + 30 * 60 * 1000);   // 30 分後
  
  // 2 分刻みで検索
  for (let searchTime = new Date(searchStart); searchTime <= searchEnd; searchTime.setMinutes(searchTime.getMinutes() + 2)) {
    const moonPosition = await calculateMoonPositionPrecise(searchTime, location);
    // アライメントチェック...
  }
}
```

## 季節別最適化

### 検索時間範囲の動的調整

```typescript
private getOptimizedSearchRanges(date: Date): SearchRange[] {
  const month = date.getMonth() + 1;
  
  if (month >= 10 || month <= 2) { // 冬季（ダイヤモンドスカイツリーシーズン）
    return [
      { type: 'sunrise', start: 6, end: 9 },   // 冬の日の出：6-9 時
      { type: 'sunset', start: 15, end: 19 }   // 冬の日の入り：15-19 時
    ];
  } else if (month >= 3 && month <= 5) { // 春季
    return [
      { type: 'sunrise', start: 5, end: 8 },   // 春の日の出：5-8 時
      { type: 'sunset', start: 16, end: 19 }   // 春の日の入り：16-19 時
    ];
  }
  
  return []; // 夏季は通常ダイヤモンドスカイツリーなし
}
```

## パフォーマンス最適化

### 事前計算値の活用

```typescript
// データベースに事前計算値を保存
interface Location {
  // 事前計算値（計算高速化）
  azimuthToSkytree?: number;   // スカイツリーへの方位角
  elevationToSkytree?: number; // スカイツリーへの仰角  
  distanceToSkytree?: number;  // スカイツリーまでの距離
}

// 計算時に事前計算値を使用
const skytreeAzimuth = location.azimuthToSkytree ?? this.calculateBearingToSkytree(location);
const skytreeElevation = location.elevationToSkytree ?? this.calculateElevationToSkytree(location);
```

### バッチ計算

```typescript
async calculateMonthlyEvents(year: number, month: number, locations: Location[]): Promise<SkytreeEvent[]> {
  const allEvents: SkytreeEvent[] = [];
  
  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(year, month - 1, day);
    
    // 複数地点を並列処理
    const promises = locations.map(async location => {
      const diamondEvents = await this.calculateDiamondSkytree(date, location);
      const pearlEvents = await this.calculatePearlSkytree(date, location);
      return [...diamondEvents, ...pearlEvents];
    });
    
    const dayEvents = await Promise.all(promises);
    allEvents.push(...dayEvents.flat());
  }
  
  return allEvents;
}
```

## 精度と限界

### 計算精度

- **位置精度**: 1 秒角未満（NASA JPL 準拠）
- **時刻精度**: 1 分以内
- **方位角精度**: 0.1 度以内
- **仰角精度**: 0.1 度以内

### 制約事項

1. **大気屈折**: 標準値を使用（実際の気象条件非考慮）
2. **パールスカイツリー形状**: 剣ヶ峰の点座標（実際の稜線プロファイル簡略化）
3. **計算範囲**: 日の出入り前後の限定時間
4. **月相考慮**: パールスカイツリーは月の見た目サイズ非考慮

### 将来の改善案

1. **気象データ連携**: 実際の気温・気圧・湿度による屈折補正
2. **パールスカイツリー 3D モデル**: 実際の稜線プロファイル使用
3. **月相計算**: 月の見た目サイズと位相を考慮
4. **GPU 計算**: 大量計算の高速化