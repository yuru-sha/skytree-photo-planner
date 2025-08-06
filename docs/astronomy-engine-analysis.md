# Astronomy Engine 時刻処理の詳細分析結果

**バージョン 0.3.0** - モノレポ構成・高性能版

## 重要な発見

### 1. SearchRiseSet の戻り値について
- **SearchRiseSet は UTC 時刻で結果を返す**
- `moonrise.date.toISOString()` → "2025-01-20T14:05:16.458Z" (UTC)
- `moonrise.date.getHours()` → 23 (JST = UTC + 9 時間)

### 2. 現在のコードの問題点

#### 問題 1: 入力時刻の解釈
```typescript
// 現在のコード（AstronomicalCalculatorAstronomyEngine.ts 220 行目）
const moonrise = Astronomy.SearchRiseSet(Astronomy.Body.Moon, observer, 1, date, 1);
```

- `date` は `new Date(year, month - 1, day)` で作成されている
- これはローカル時刻として解釈されるが、実際には UTC 時刻として扱われている
- つまり、JST 0:00 のつもりが UTC 0:00 として処理されている

#### 問題 2: 戻り値の時刻解釈
```typescript
// 225 行目
const risingEvent = await this.checkMoonAlignment(moonrise.date, location, skytreeAzimuth, skytreeElevation, 'rising');
```

- `moonrise.date` は UTC 時刻
- しかし `checkMoonAlignment` 内で `Astronomy.Equator()` に渡される時刻が混乱している

### 3. 時刻処理の流れ

#### 正しい流れ（修正が必要）
```
入力: JST 日付 → UTC 変換 → SearchRiseSet → UTC 結果 → JST 変換（表示用）
```

#### 現在の問題のある流れ
```
入力: JST 日付 → SearchRiseSet → UTC 結果 → そのまま使用（時刻ずれ）
```

## 修正が必要な箇所

### 1. calculatePearlSkytree メソッド (199-254 行目)
```typescript
// 修正前
const moonrise = Astronomy.SearchRiseSet(Astronomy.Body.Moon, observer, 1, date, 1);

// 修正後（UTC 時刻として明示的に変換）
const utcDate = timeUtils.jstToUtc(date);
const moonrise = Astronomy.SearchRiseSet(Astronomy.Body.Moon, observer, 1, utcDate, 1);
```

### 2. checkMoonAlignment メソッド (409-437 行目)
```typescript
// moonrise.date は既に UTC 時刻なので、そのまま使用可能
// ただし、結果の時刻を JST で返す場合は変換が必要
```

### 3. 太陽位置計算 (442-453 行目)
```typescript
// 修正前
const equatorial = Astronomy.Equator(Astronomy.Body.Sun, time, observer, true, true);

// 修正後（時刻の意味を明確化）
// time が既に UTC の場合はそのまま、JST の場合は変換
const utcTime = time; // SearchRiseSet からの戻り値なので既に UTC
const equatorial = Astronomy.Equator(Astronomy.Body.Sun, utcTime, observer, true, true);
```

## 検証結果のまとめ

1. **Astronomy Engine は常に UTC 時刻で動作する**
2. **SearchRiseSet の戻り値は UTC 時刻**
3. **JavaScript の Date.getHours() はローカル時刻（JST）を返す**
4. **現在のコードは 9 時間のずれが発生する可能性がある**

## 推奨修正方針

1. SearchRiseSet に渡す日付を明示的に UTC に変換
2. 戻り値の時刻を JST として扱う場合は適切に変換
3. timeUtils の jstToUtc / utcToJst を活用
4. コメントで時刻の意味（UTC/JST）を明記

## 重要度: 高
この問題により、パールスカイツリーの時刻が最大 9 時間ずれる可能性があります。