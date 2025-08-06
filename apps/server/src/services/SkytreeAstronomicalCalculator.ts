import {
  Location as LocationType,
  SunPosition,
  MoonPosition,
} from "@skytree-photo-planner/types";
import { SkytreeEvent } from "@skytree-photo-planner/types";
import { getComponentLogger, timeUtils, handleCalculationError } from "@skytree-photo-planner/utils";
import { CoordinateCalculator } from "./astronomical/CoordinateCalculator";
import { CelestialPositionCalculator } from "./astronomical/CelestialPositionCalculator";
import { SkytreeAlignmentCalculator } from "./astronomical/SkytreeAlignmentCalculator";
import { SeasonCalculator } from "./astronomical/SeasonCalculator";
import type { ISystemSettingsService } from "./interfaces/ISystemSettingsService";

// スカイツリー用のインターフェース
export interface SkytreeAstronomicalCalculator {
  calculateDiamondSkytree(date: Date, locations: LocationType[]): Promise<SkytreeEvent[]>;
  calculatePearlSkytree(date: Date, locations: LocationType[]): Promise<SkytreeEvent[]>;
  calculateMonthlyEvents(
    year: number,
    month: number,
    locations: LocationType[],
  ): Promise<SkytreeEvent[]>;
  calculateLocationYearlyEvents(
    location: LocationType,
    year: number,
  ): Promise<SkytreeEvent[]>;
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
  calculateAzimuthToSkytree(fromLocation: LocationType): number;
  calculateElevationToSkytree(fromLocation: LocationType): number;
  isVisible(
    fromLocation: LocationType,
    targetAzimuth: number,
    celestialBody?: "sun" | "moon",
  ): boolean;
  isDiamondSkytreeSeason(date: Date, location: LocationType): boolean;
  getSunMaxElevation(date: Date, location: LocationType): number;
  getDiamondSkytreeSeasonMessage(date: Date, location: LocationType): string | null;
  isVisibleMoonPhase(date: Date): boolean;
}

/**
 * スカイツリー版天体計算サービス
 * ダイヤモンドスカイツリー・パールスカイツリーの計算を実行
 */
export class SkytreeAstronomicalCalculatorImpl implements SkytreeAstronomicalCalculator {
  private logger = getComponentLogger("SkytreeAstronomicalCalculator");
  private coordinateCalc = new CoordinateCalculator();
  private celestialCalc = new CelestialPositionCalculator();
  private skytreeAlignmentCalc: SkytreeAlignmentCalculator;
  private seasonCalc = new SeasonCalculator();
  private settingsService: ISystemSettingsService;

  constructor(settingsService: ISystemSettingsService) {
    this.settingsService = settingsService;
    this.skytreeAlignmentCalc = new SkytreeAlignmentCalculator(this.settingsService);
  }

  async calculateDiamondSkytree(date: Date, locations: LocationType[]): Promise<SkytreeEvent[]> {
    this.logger.info("ダイヤモンドスカイツリー計算開始", { 
      date: date.toISOString(), 
      locationCount: locations.length 
    });

    // 並列処理でパフォーマンス向上
    const locationPromises = locations.map(async (location) => {
      try {
        this.logger.debug("地点計算開始", { locationId: location.id, locationName: location.name });
        const locationEvents = await this.skytreeAlignmentCalc.findDiamondSkytree(date, location);
        this.logger.debug("地点計算完了", { 
          locationId: location.id, 
          eventCount: locationEvents.length 
        });
        return { success: true, events: locationEvents, location };
      } catch (error) {
        const structuredError = handleCalculationError(
          error,
          'DiamondSkytreeCalculation',
          {
            locationId: location.id,
            locationName: location.name,
            date: timeUtils.formatDateString(date),
            coordinates: { latitude: location.latitude, longitude: location.longitude },
          }
        );
        
        return { 
          success: false, 
          events: [], 
          location, 
          error: structuredError 
        };
      }
    });

    const results = await Promise.all(locationPromises);
    
    // 成功した計算結果のみを集約
    const events: SkytreeEvent[] = [];
    let errorCount = 0;
    const errorDetails: Array<{ locationId: number; correlationId?: string }> = [];
    
    for (const result of results) {
      if (result.success) {
        events.push(...result.events);
      } else {
        errorCount++;
        errorDetails.push({
          locationId: result.location.id,
          correlationId: result.error?.correlationId,
        });
      }
    }

    // エラー統計をログ出力
    if (errorCount > 0) {
      this.logger.warn("ダイヤモンドスカイツリー計算で一部エラー", {
        totalLocations: locations.length,
        errorCount,
        successCount: locations.length - errorCount,
        date: timeUtils.formatDateString(date),
        errorDetails,
      });
    }

    return events;
  }

  async calculatePearlSkytree(date: Date, locations: LocationType[]): Promise<SkytreeEvent[]> {
    this.logger.info("パールスカイツリー計算開始", { 
      date: date.toISOString(), 
      locationCount: locations.length 
    });
    
    // 並列処理でパフォーマンス向上
    const locationPromises = locations.map(async (location) => {
      try {
        const locationEvents = await this.skytreeAlignmentCalc.findPearlSkytree(date, location);
        return { success: true, events: locationEvents, location };
      } catch (error) {
        const structuredError = handleCalculationError(
          error,
          'PearlSkytreeCalculation',
          {
            locationId: location.id,
            locationName: location.name,
            date: timeUtils.formatDateString(date),
            coordinates: { latitude: location.latitude, longitude: location.longitude },
          }
        );
        
        return { 
          success: false, 
          events: [], 
          location, 
          error: structuredError 
        };
      }
    });

    const results = await Promise.all(locationPromises);
    
    // 成功した計算結果のみを集約
    const events: SkytreeEvent[] = [];
    let errorCount = 0;
    const errorDetails: Array<{ locationId: number; correlationId?: string }> = [];
    
    for (const result of results) {
      if (result.success) {
        events.push(...result.events);
      } else {
        errorCount++;
        errorDetails.push({
          locationId: result.location.id,
          correlationId: result.error?.correlationId,
        });
      }
    }

    // エラー統計をログ出力
    if (errorCount > 0) {
      this.logger.warn("パールスカイツリー計算で一部エラー", {
        totalLocations: locations.length,
        errorCount,
        successCount: locations.length - errorCount,
        date: timeUtils.formatDateString(date),
        errorDetails,
      });
    }

    this.logger.info("パールスカイツリー計算完了", {
      date: date.toISOString(),
      locationCount: locations.length,
      eventCount: events.length,
      errorCount
    });

    return events;
  }

  async calculateMonthlyEvents(
    year: number,
    month: number,
    locations: LocationType[],
  ): Promise<SkytreeEvent[]> {
    const events: SkytreeEvent[] = [];
    const daysInMonth = new Date(year, month, 0).getDate();

    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(year, month - 1, day);
      
      // ダイヤモンドスカイツリー
      const diamondEvents = await this.calculateDiamondSkytree(date, locations);
      events.push(...diamondEvents);

      // パールスカイツリー
      const pearlEvents = await this.calculatePearlSkytree(date, locations);
      events.push(...pearlEvents);
    }

    return events;
  }

  async calculateLocationYearlyEvents(
    location: LocationType,
    year: number,
  ): Promise<SkytreeEvent[]> {
    const events: SkytreeEvent[] = [];

    for (let month = 1; month <= 12; month++) {
      const monthlyEvents = await this.calculateMonthlyEvents(year, month, [location]);
      events.push(...monthlyEvents);
    }

    return events;
  }

  getSunPosition(
    date: Date,
    latitude: number,
    longitude: number,
  ): SunPosition | null {
    return this.celestialCalc.calculateSunPosition(date, {
      latitude,
      longitude,
      elevation: 0,
    } as LocationType);
  }

  getMoonPosition(
    date: Date,
    latitude: number,
    longitude: number,
  ): MoonPosition | null {
    return this.celestialCalc.calculateMoonPosition(date, {
      latitude,
      longitude,
      elevation: 0,
    } as LocationType);
  }

  calculateAzimuthToSkytree(fromLocation: LocationType): number {
    return this.coordinateCalc.calculateAzimuthToSkytree(fromLocation);
  }

  calculateElevationToSkytree(fromLocation: LocationType): number {
    return this.coordinateCalc.calculateElevationToSkytreeSummit(fromLocation);
  }

  isVisible(
    fromLocation: LocationType,
    targetAzimuth: number,
    _celestialBody?: "sun" | "moon",
  ): boolean {
    // 基本的な可視性チェック（地平線より上）
    return targetAzimuth >= 0;
  }

  isDiamondSkytreeSeason(date: Date, location: LocationType): boolean {
    return this.seasonCalc.isDiamondSkytreeSeason(date, location);
  }

  getSunMaxElevation(date: Date, location: LocationType): number {
    // 正午の太陽高度を計算
    const noon = new Date(date);
    noon.setHours(12, 0, 0, 0);
    
    const sunPos = this.getSunPosition(noon, location.latitude, location.longitude);
    return sunPos?.elevation || 0;
  }

  getDiamondSkytreeSeasonMessage(_date: Date, location: LocationType): string | null {
    return this.seasonCalc.getSeasonMessage(_date, location);
  }

  isVisibleMoonPhase(_date: Date): boolean {
    return this.celestialCalc.isVisibleMoonPhase(0.1); // 最小照度
  }
}