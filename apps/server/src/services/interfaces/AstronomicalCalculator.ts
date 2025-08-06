import {
  Location,
  SunPosition,
  MoonPosition,
} from "@skytree-photo-planner/types";
import { SkytreeEvent } from "@skytree-photo-planner/types";

/**
 * 天体計算インターフェース
 * ダイヤモンドスカイツリー・パールスカイツリーの計算を抽象化
 */
export interface AstronomicalCalculator {
  /**
   * ダイヤモンドスカイツリーイベントを計算
   */
  calculateDiamondSkytree(date: Date, locations: Location[]): Promise<SkytreeEvent[]>;

  /**
   * パールスカイツリーイベントを計算
   */
  calculatePearlSkytree(date: Date, locations: Location[]): Promise<SkytreeEvent[]>;

  /**
   * 月間イベントを計算
   */
  calculateMonthlyEvents(
    year: number,
    month: number,
    locations: Location[],
  ): Promise<SkytreeEvent[]>;

  /**
   * 特定地点の年間イベントを計算
   */
  calculateLocationYearlyEvents(
    location: Location,
    year: number,
  ): Promise<SkytreeEvent[]>;

  /**
   * 太陽の位置を取得
   */
  getSunPosition(
    date: Date,
    latitude: number,
    longitude: number,
  ): SunPosition | null;

  /**
   * 月の位置を取得
   */
  getMoonPosition(
    date: Date,
    latitude: number,
    longitude: number,
  ): MoonPosition | null;

  /**
   * 撮影地点からスカイツリーへの方位角を計算
   */
  calculateAzimuthToSkytree(fromLocation: Location): number;

  /**
   * 撮影地点からスカイツリー頂部への仰角を計算
   */
  calculateElevationToSkytree(fromLocation: Location): number;

  /**
   * 天体が可視範囲にあるかチェック
   */
  isVisible(
    fromLocation: Location,
    targetAzimuth: number,
    celestialBody?: "sun" | "moon",
  ): boolean;

  /**
   * ダイヤモンドスカイツリーの観測期間かチェック
   */
  isDiamondSkytreeSeason(date: Date, location: Location): boolean;

  /**
   * 太陽の最大仰角を取得
   */
  getSunMaxElevation(date: Date, location: Location): number;

  /**
   * ダイヤモンドスカイツリーの観測期間メッセージを取得
   */
  getDiamondSkytreeSeasonMessage(date: Date, location: Location): string | null;

  /**
   * 月相が観測に適しているかチェック
   */
  isVisibleMoonPhase(date: Date): boolean;
}

/**
 * 天体計算の依存関係インターフェース
 */
export interface AstronomicalCalculatorDependencies {
  coordinateCalculator: CoordinateCalculator;
  celestialPositionCalculator: CelestialPositionCalculator;
  skytreeAlignmentCalculator: SkytreeAlignmentCalculator;
  seasonCalculator: SeasonCalculator;
}

/**
 * 座標計算インターフェース
 */
export interface CoordinateCalculator {
  calculateAzimuth(
    lat1: number,
    lng1: number,
    lat2: number,
    lng2: number,
  ): number;
  calculateDistance(
    lat1: number,
    lng1: number,
    lat2: number,
    lng2: number,
  ): number;
  calculateBearing(
    lat1: number,
    lng1: number,
    lat2: number,
    lng2: number,
  ): number;
}

/**
 * 天体位置計算インターフェース
 */
export interface CelestialPositionCalculator {
  getSunPosition(
    date: Date,
    latitude: number,
    longitude: number,
  ): SunPosition | null;
  getMoonPosition(
    date: Date,
    latitude: number,
    longitude: number,
  ): MoonPosition | null;
  calculateSunTimes(
    date: Date,
    latitude: number,
    longitude: number,
  ): {
    sunrise: Date | null;
    sunset: Date | null;
    solarNoon: Date | null;
  };
}

/**
 * スカイツリーアライメント計算インターフェース
 */
export interface SkytreeAlignmentCalculator {
  calculateElevationToSkytree(fromLocation: Location): number;
  isAlignedWithSkytree(
    date: Date,
    location: Location,
    celestialBody: "sun" | "moon",
  ): boolean;
  calculateOptimalViewingTime(
    date: Date,
    location: Location,
    eventType: "diamond" | "pearl",
  ): Date | null;
}

/**
 * 季節計算インターフェース
 */
export interface SeasonCalculator {
  isDiamondSkytreeSeason(date: Date, location: Location): boolean;
  getPearlSkytreeVisibility(date: Date): number; // 0-1
  getSeasonMessage(date: Date, location: Location): string | null;
}
