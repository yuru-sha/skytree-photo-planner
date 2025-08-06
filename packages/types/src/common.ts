/**
 * プロジェクト全体で共通使用される基本型定義
 * 循環依存を避けるため、他のファイルからインポートされる基本型のみを含む
 */

/**
 * 基本的な Location 型（循環依存回避用）
 */
export interface BaseLocation {
  id: number;
  name: string;
  latitude: number;
  longitude: number;
  elevation: number;
  prefecture: string;
  description?: string | null;
  accessInfo?: string | null;
  notes?: string | null;
  parkingInfo?: string | null;
  azimuthToSkytree: number;
  elevationToSkytree: number;
  distanceToSkytree: number;
  status: "active" | "restricted";
  createdAt: Date;
  updatedAt: Date;
}

/**
 * 基本的な SkytreeEvent 型（循環依存回避用）
 */
export interface BaseSkytreeEvent {
  id: string;
  type: "diamond" | "pearl";
  subType: "sunrise" | "sunset" | "rising" | "setting";
  time: Date;
  azimuth: number;
  elevation?: number;
  qualityScore?: number;
  accuracy?: "perfect" | "excellent" | "good" | "fair";
  moonPhase?: number;
  moonIllumination?: number;
}

/**
 * 完全な SkytreeEvent 型（Location 参照を含む）
 */
export interface SkytreeEvent extends BaseSkytreeEvent {
  location: BaseLocation;
}

/**
 * 天体計算の結果精度
 */
export type CalculationAccuracy = "perfect" | "excellent" | "good" | "fair";

/**
 * イベントタイプ
 */
export type EventType = "diamond" | "pearl";

/**
 * イベントサブタイプ
 */
export type EventSubType = "sunrise" | "sunset" | "rising" | "setting";


/**
 * 東京スカイツリーの座標定数
 * 世界測地系による正確な座標
 * ダイヤモンドスカイツリー・パールスカイツリーの視覚的な基準点として使用
 */
export const SKYTREE_COORDINATES = {
  latitude: 35.7100069, // 世界測地系による正確な緯度
  longitude: 139.8108103, // 世界測地系による正確な経度
  elevation: 638, // スカイツリー頂部の海抜標高（634m + 地盤標高 4m = 638m）
} as const;

/**
 * JST 関連定数
 */
export const JST_TIMEZONE = "Asia/Tokyo";
export const JST_OFFSET = 9; // UTC+9


/**
 * エラー型
 */
export enum ErrorType {
  VALIDATION_ERROR = "VALIDATION_ERROR",
  AUTHENTICATION_ERROR = "AUTHENTICATION_ERROR",
  AUTHORIZATION_ERROR = "AUTHORIZATION_ERROR",
  DATABASE_ERROR = "DATABASE_ERROR",
  CALCULATION_ERROR = "CALCULATION_ERROR",
  EXTERNAL_API_ERROR = "EXTERNAL_API_ERROR",
  RATE_LIMIT_ERROR = "RATE_LIMIT_ERROR",
}

/**
 * API エラー
 */
export interface ApiError {
  type: ErrorType;
  message: string;
  details?: Record<string, unknown>;
  timestamp: Date;
}
