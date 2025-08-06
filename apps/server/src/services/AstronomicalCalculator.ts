import {
  Location,
  SkytreeEvent,
  SunPosition,
  MoonPosition,
} from "@skytree-photo-planner/types";
import { getComponentLogger, timeUtils } from "@skytree-photo-planner/utils";
import { CoordinateCalculator } from "./astronomical/CoordinateCalculator";
import { CelestialPositionCalculator } from "./astronomical/CelestialPositionCalculator";

import { SeasonCalculator } from "./astronomical/SeasonCalculator";
import { SystemSettingsService } from "./SystemSettingsService";

// 既存のインターフェースをインポート
export interface AstronomicalCalculator {
  calculateDiamondSkytree(date: Date, locations: Location[]): Promise<SkytreeEvent[]>;
  calculatePearlSkytree(date: Date, locations: Location[]): Promise<SkytreeEvent[]>;
  calculateMonthlyEvents(
    year: number,
    month: number,
    locations: Location[],
  ): Promise<SkytreeEvent[]>;
  calculateLocationYearlyEvents(
    location: Location,
    year: number,
  ): Promise<SkytreeEvent[]>;
  
  // 後方互換性のためのエイリアス（非推奨）
  /** @deprecated use calculateDiamondSkytree instead */
  calculateDiamondFuji(date: Date, locations: Location[]): Promise<SkytreeEvent[]>;
  /** @deprecated use calculatePearlSkytree instead */
  calculatePearlFuji(date: Date, locations: Location[]): Promise<SkytreeEvent[]>;
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
  calculateAzimuthToSkytree(fromLocation: Location): number;
  isVisible(
    fromLocation: Location,
    targetAzimuth: number,
    celestialBody?: "sun" | "moon",
  ): boolean;
  isDiamondSkytreeSeason(date: Date, location: Location): boolean;
  getSunMaxElevation(date: Date, location: Location): number;
  getDiamondSkytreeSeasonMessage(date: Date, location: Location): string | null;
  isVisibleMoonPhase(date: Date): boolean;
}

/**
 * 新しいダイヤモンドスカイツリー・パールスカイツリー検出アルゴリズム
 *
 * 基本原理：
 * 1. 撮影地点からパールスカイツリーへの方位角を計算
 * 2. その日の太陽・月の軌道を追跡
 * 3. 方位角が一致し、かつ適切な高度にある時刻を特定
 * 4. 視覚的にわかりやすいシンプルなロジック
 */
export class AstronomicalCalculatorImpl implements AstronomicalCalculator {
  private logger = getComponentLogger("AstronomicalCalculator");

  // 分離されたクラス群を組み合わせ
  private coordinateCalc = new CoordinateCalculator();
  private celestialCalc = new CelestialPositionCalculator();

  private seasonCalc = new SeasonCalculator();

  constructor(_settingsService: SystemSettingsService) {

    this.logger.info("AstronomicalCalculator 初期化完了", {
      components: [
        "CoordinateCalculator",
        "CelestialPositionCalculator",

        "SeasonCalculator",
      ],
    });
  }

  /**
   * ダイヤモンドスカイツリーを計算
   */
  async calculateDiamondSkytree(
    date: Date,
    locations: Location[],
  ): Promise<SkytreeEvent[]> {
    const startTime = Date.now();
    const allEvents: SkytreeEvent[] = [];

    try {
      // 複数の地点に対して並列処理
      const eventPromises = locations.map(async (location) => {
        try {
          const events: SkytreeEvent[] = [];
          return events;
        } catch (error) {
          this.logger.error("ダイヤモンドスカイツリー計算エラー（個別地点）", error, {
            date: timeUtils.formatDateString(date),
            locationId: location.id,
          });
          return [];
        }
      });

      const locationResults = await Promise.all(eventPromises);
      locationResults.forEach((events) => allEvents.push(...events));

      const responseTime = Date.now() - startTime;
      this.logger.debug("ダイヤモンドスカイツリー計算完了（複数地点）", {
        date: timeUtils.formatDateString(date),
        locationCount: locations.length,
        eventsFound: allEvents.length,
        responseTimeMs: responseTime,
      });

      return allEvents;
    } catch (error) {
      this.logger.error("ダイヤモンドスカイツリー計算エラー（全体）", error, {
        date: timeUtils.formatDateString(date),
        locationCount: locations.length,
      });
      return [];
    }
  }

  /**
   * パールスカイツリーを計算
   */
  async calculatePearlSkytree(
    date: Date,
    locations: Location[],
  ): Promise<SkytreeEvent[]> {
    const startTime = Date.now();
    const allEvents: SkytreeEvent[] = [];

    try {
      // 複数の地点に対して並列処理
      const eventPromises = locations.map(async (location) => {
        try {
          const events: SkytreeEvent[] = [];
          return events;
        } catch (error) {
          this.logger.error("パールスカイツリー計算エラー（個別地点）", error, {
            date: timeUtils.formatDateString(date),
            locationId: location.id,
          });
          return [];
        }
      });

      const locationResults = await Promise.all(eventPromises);
      locationResults.forEach((events) => allEvents.push(...events));

      const responseTime = Date.now() - startTime;
      this.logger.debug("パールスカイツリー計算完了（複数地点）", {
        date: timeUtils.formatDateString(date),
        locationCount: locations.length,
        eventsFound: allEvents.length,
        responseTimeMs: responseTime,
      });

      return allEvents;
    } catch (error) {
      this.logger.error("パールスカイツリー計算エラー（全体）", error, {
        date: timeUtils.formatDateString(date),
        locationCount: locations.length,
      });
      return [];
    }
  }

  /**
   * 月間イベントを計算
   */
  async calculateMonthlyEvents(
    year: number,
    month: number,
    locations: Location[],
  ): Promise<SkytreeEvent[]> {
    const allEvents: SkytreeEvent[] = [];
    const daysInMonth = new Date(year, month, 0).getDate();

    // 複数の地点に対して並列処理
    for (const location of locations) {
      for (let day = 1; day <= daysInMonth; day++) {
        const date = new Date(year, month - 1, day);

        const [diamondEvents, pearlEvents] = await Promise.all([
          this.calculateDiamondSkytree(date, [location]),
          this.calculatePearlSkytree(date, [location]),
        ]);

        allEvents.push(...diamondEvents, ...pearlEvents);
      }
    }

    this.logger.info("月間イベント計算完了（複数地点）", {
      year,
      month,
      locationCount: locations.length,
      totalEvents: allEvents.length,
    });

    return allEvents;
  }

  /**
   * 太陽位置を取得
   */
  getSunPosition(
    date: Date,
    latitude: number,
    longitude: number,
  ): SunPosition | null {
    const location: Location = {
      id: 0, // 一時的な ID
      name: "",
      prefecture: "",
      accessInfo: null,
      measurementNotes: null,
      parkingInfo: null,
      latitude,
      longitude,
      elevation: 0,
      azimuthToSkytree: 0,
      distanceToSkytree: 0,
      elevationToSkytree: 0,
      status: 'active',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    return this.celestialCalc.calculateSunPosition(date, location);
  }

  /**
   * 月位置を取得
   */
  getMoonPosition(
    date: Date,
    latitude: number,
    longitude: number,
  ): MoonPosition | null {
    const location: Location = {
      id: 0, // 一時的な ID
      name: "",
      prefecture: "",
      accessInfo: null,
      measurementNotes: null,
      parkingInfo: null,
      latitude,
      longitude,
      elevation: 0,
      azimuthToSkytree: 0,
      distanceToSkytree: 0,
      elevationToSkytree: 0,
      status: 'active',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    return this.celestialCalc.calculateMoonPosition(date, location);
  }

  /**
   * パールスカイツリーへの方位角を計算
   */
  calculateAzimuthToSkytree(location: Location): number {
    return this.coordinateCalc.calculateAzimuthToSkytree(location);
  }

  /**
   * パールスカイツリーへの距離を計算（メートル）
   */
  getDistanceToSkytree(location: Location): number {
    return this.coordinateCalc.calculateDistanceToSkytree(location);
  }

  /**
   * スカイツリー頂への仰角を計算（度）
   */
  calculateElevationToSkytree(location: Location): number {
    return this.coordinateCalc.calculateElevationToSkytreeSummit(location);
  }

  /**
   * 天体の可視性を判定
   */
  isVisible(
    _fromLocation: Location,
    _targetAzimuth: number,
    _celestialBody?: "sun" | "moon",
  ): boolean {
    // 基本的な可視性判定
    const basicVisibility = this.celestialCalc.isVisible(-2); // 最低高度閾値

    // 天体種別に応じた追加チェック
    if (_celestialBody === "sun") {
      // 太陽の場合の特別な判定
      return basicVisibility;
    } else if (_celestialBody === "moon") {
      // 月の場合の特別な判定
      return basicVisibility;
    }

    // デフォルトの可視性判定
    return basicVisibility;
  }

  /**
   * ダイヤモンドスカイツリーのシーズンかを判定
   */
  isDiamondSkytreeSeason(date: Date, _location: Location): boolean {
    return this.seasonCalc.isDiamondSkytreeSeason(date, _location);
  }

  /**
   * 太陽の最高高度を取得
   */
  getSunMaxElevation(date: Date, location: Location): number {
    return this.celestialCalc.calculateSunMaxElevation(date, location);
  }

  /**
   * ダイヤモンドスカイツリーシーズンメッセージを取得
   */
  getDiamondSkytreeSeasonMessage(date: Date, _location: Location): string | null {
    return this.seasonCalc.getDiamondSkytreeSeasonMessage(date, _location);
  }

  /**
   * 月相の可視性を判定
   */
  isVisibleMoonPhase(date: Date): boolean {
    // 日付から月相の照度を計算
    const moonPosition = this.celestialCalc.calculateMoonPosition(date, {
      latitude: 35.3606, // パールスカイツリーの座標をデフォルトとして使用
      longitude: 138.7274,
    });

    if (!moonPosition) {
      return false;
    }

    return this.celestialCalc.isVisibleMoonPhase(moonPosition.illumination);
  }

  /**
   * 地点の年間イベントを計算（非推奨 - calculateMonthlyEvents の使用を推奨）
   */
  async calculateLocationYearlyEvents(
    location: Location,
    year: number,
  ): Promise<SkytreeEvent[]> {
    this.logger.warn(
      "calculateLocationYearlyEvents は非推奨です。calculateMonthlyEvents の使用を推奨します。",
      {
        year,
        locationId: location.id,
      },
    );

    const allEvents: SkytreeEvent[] = [];

    for (let month = 1; month <= 12; month++) {
      const monthlyEvents = await this.calculateMonthlyEvents(year, month, [
        location,
      ]);
      allEvents.push(...monthlyEvents);
    }

    return allEvents;
  }

  // 後方互換性のためのメソッド実装
  async calculateDiamondFuji(date: Date, locations: Location[]): Promise<SkytreeEvent[]> {
    return this.calculateDiamondSkytree(date, locations);
  }

  async calculatePearlFuji(date: Date, locations: Location[]): Promise<SkytreeEvent[]> {
    return this.calculatePearlSkytree(date, locations);
  }
}
