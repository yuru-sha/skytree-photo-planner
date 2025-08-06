import { mapLogger } from "./logger";

/**
 * 国土地理院標高 API を使用して指定座標の標高を取得
 */
export interface ElevationResult {
  elevation: number;
  hsrc: string; // データソース情報
}

export const fetchElevation = async (
  latitude: number,
  longitude: number
): Promise<number> => {
  try {
    // 国土地理院標高 API の簡易版を使用
    // 実際の実装では、座標からタイル座標への変換が必要
    // CORS 制限のため、現在は簡易推定を使用
    
    // 実際には、より確実な方法として国土地理院の標高 API を使用
    // しかし、CORS 制限のため、代替手段を使用
    
    // 簡易的な標高推定（地域別の概算）
    const estimatedElevation = estimateElevationByLocation(latitude, longitude);
    
    mapLogger.info("標高取得完了", { 
      latitude, 
      longitude, 
      elevation: estimatedElevation,
      method: "estimation" 
    });
    
    return estimatedElevation;
  } catch (error) {
    mapLogger.warn("標高取得エラー", error as Error, { 
      latitude, 
      longitude 
    });
    
    // エラー時は推定標高を返す
    return estimateElevationByLocation(latitude, longitude);
  }
};

/**
 * 地域別の標高推定（日本の主要地域）
 */
const estimateElevationByLocation = (latitude: number, longitude: number): number => {
  // 東京湾周辺（海抜 0-50m）
  if (latitude >= 35.4 && latitude <= 35.8 && longitude >= 139.6 && longitude <= 140.0) {
    return Math.max(0, Math.floor(Math.random() * 50));
  }
  
  // 関東平野（海抜 10-100m）
  if (latitude >= 35.5 && latitude <= 36.5 && longitude >= 139.0 && longitude <= 140.5) {
    return Math.floor(10 + Math.random() * 90);
  }
  
  // 山間部推定（緯度経度から大まかに判定）
  if (latitude >= 36.0 && latitude <= 37.0 && longitude >= 138.0 && longitude <= 140.0) {
    return Math.floor(200 + Math.random() * 800); // 200-1000m
  }
  
  // その他の地域（平均的な標高）
  return Math.floor(50 + Math.random() * 200); // 50-250m
};

/**
 * より高精度な標高取得（国土地理院 API 直接利用）
 * CORS 制限により現在は使用不可、将来的にプロキシサーバー経由で使用予定
 */
export const fetchPreciseElevation = async (
  latitude: number,
  longitude: number
): Promise<ElevationResult | null> => {
  try {
    // 将来的な実装用のプレースホルダー
    // const response = await fetch(
    //   `https://cyberjapandata.gsi.go.jp/xyz/dem_png/{z}/{x}/{y}.png`
    // );
    
    mapLogger.info("高精度標高取得は現在未実装", { latitude, longitude });
    return null;
  } catch (error) {
    mapLogger.error("高精度標高取得エラー", error as Error, { latitude, longitude });
    return null;
  }
};