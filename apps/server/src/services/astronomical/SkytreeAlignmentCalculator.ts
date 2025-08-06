import { getComponentLogger } from "@skytree-photo-planner/utils";
import { timeUtils } from "@skytree-photo-planner/utils";
import * as Astronomy from "astronomy-engine";
import type {
  Location,
  MoonPosition,
} from "@skytree-photo-planner/types";
import type { SkytreeEvent } from "@skytree-photo-planner/types";
import type { ISystemSettingsService } from "../interfaces/ISystemSettingsService";
import { CoordinateCalculator } from "./CoordinateCalculator";
import { CelestialPositionCalculator } from "./CelestialPositionCalculator";
import { SeasonCalculator } from "./SeasonCalculator";

/**
 * スカイツリーと天体の整列計算を担当するクラス
 * ダイヤモンドスカイツリー・パールスカイツリーの計算を実行
 */
export class SkytreeAlignmentCalculator {
  private logger = getComponentLogger("SkytreeAlignmentCalculator");
  private coordinateCalc = new CoordinateCalculator();
  private celestialCalc = new CelestialPositionCalculator();
  private seasonCalc = new SeasonCalculator();
  private settingsService: ISystemSettingsService;

  constructor(settingsService: ISystemSettingsService) {
    this.settingsService = settingsService;
  }

  /**
   * ダイヤモンドスカイツリーイベントを検索
   * 日の出から日の入りまでの全時間帯で仰角一致をチェック
   */
  async findDiamondSkytree(
    date: Date,
    location: Location,
    precisionSettings?: { searchInterval?: number; toleranceLevel?: "high" | "medium" | "low" }
  ): Promise<SkytreeEvent[]> {
    return this.findSkytreeAlignment(date, location, "diamond", precisionSettings);
  }

  /**
   * パールスカイツリーイベントを検索
   * 月の出と月の入りを個別に検索して、それぞれの結果を返す
   */
  async findPearlSkytree(
    date: Date,
    location: Location,
    precisionSettings?: { searchInterval?: number; toleranceLevel?: "high" | "medium" | "low" }
  ): Promise<SkytreeEvent[]> {
    return this.findSkytreeAlignment(date, location, "pearl", precisionSettings);
  }

  /**
   * スカイツリーアライメント（ダイヤモンド・パール）の共通検索ロジック
   */
  private async findSkytreeAlignment(
    date: Date,
    location: Location,
    eventType: "diamond" | "pearl",
    precisionSettings?: { searchInterval?: number; toleranceLevel?: "high" | "medium" | "low" }
  ): Promise<SkytreeEvent[]> {
    const events: SkytreeEvent[] = [];

    // イベントタイプに応じて検索フェーズを決定
    const phases = eventType === "diamond" 
      ? ["sunrise", "sunset"] as const
      : ["moonrise", "moonset"] as const;

    // 各フェーズを検索
    const [riseEvents, setEvents] = await Promise.all([
      this.searchCelestialAlignment(date, location, phases[0], eventType, precisionSettings),
      this.searchCelestialAlignment(date, location, phases[1], eventType, precisionSettings)
    ]);

    events.push(...riseEvents, ...setEvents);

    // 詳細ログ（パールの場合のみ）
    if (eventType === "pearl") {
      this.logger.debug("パールスカイツリー検索結果詳細", {
        date: timeUtils.formatDateString(date),
        locationId: location.id,
        locationName: location.name,
        moonriseEvents: riseEvents.length,
        moonsetEvents: setEvents.length,
        totalEvents: events.length,
        moonriseDetails: riseEvents.map(e => ({
          time: this.astroTimeToDate(e.time).toISOString(),
          subType: e.subType,
          elevation: e.elevation
        })),
        moonsetDetails: setEvents.map(e => ({
          time: this.astroTimeToDate(e.time).toISOString(),
          subType: e.subType,
          elevation: e.elevation
        }))
      });
    }

    // 共通ログ
    this.logger.debug(`${eventType === "diamond" ? "ダイヤモンド" : "パール"}スカイツリー検索完了`, {
      date: timeUtils.formatDateString(date),
      locationId: location.id,
      locationName: location.name,
      riseEvents: riseEvents.length,
      setEvents: setEvents.length,
      totalEvents: events.length
    });

    return events;
  }

  /**
   * 天体とスカイツリーの整列を検索
   */
  private async searchCelestialAlignment(
    date: Date,
    location: Location,
    eventPhase: "sunrise" | "sunset" | "moonrise" | "moonset" | "sun_all_day" | "moon_all_day",
    eventType: "diamond" | "pearl",
    precisionSettings?: { searchInterval?: number; toleranceLevel?: "high" | "medium" | "low" }
  ): Promise<SkytreeEvent[]> {
    const events: SkytreeEvent[] = [];
    const skytreeAzimuth = this.coordinateCalc.calculateAzimuthToSkytree(location);
    const elevationAngleToSkytreeSummit = this.coordinateCalc.calculateElevationToSkytreeSummit(location);

    // 検索時間範囲を設定
    const { startTime, endTime } = this.getSearchTimeRange(
      date,
      eventPhase,
      location,
    );

    // 精度設定に基づく間隔で検索（軽量化：300 秒=5 分間隔）
    const searchInterval = precisionSettings?.searchInterval ??
      await this.settingsService.getNumberSetting("search_interval", 60);

    // 許容範囲を精度レベルに応じて設定
    const tolerances = this.getTolerancesByLevel(precisionSettings?.toleranceLevel ?? "medium");

    this.logger.debug(`${eventType === "diamond" ? "太陽" : "月"}の検索開始`, {
      locationId: location.id,
      locationName: location.name,
      eventType,
      eventPhase,
      skytreeAzimuth: skytreeAzimuth.toFixed(3),
      elevationAngleToSkytreeSummit: elevationAngleToSkytreeSummit.toFixed(3),
      elevationToSkytree: location.elevationToSkytree?.toFixed(3) || "未設定",
      searchRange: {
        start: this.astroTimeToDate(startTime).toISOString(),
        end: this.astroTimeToDate(endTime).toISOString(),
        durationHours: ((this.astroTimeToDate(endTime).getTime() - this.astroTimeToDate(startTime).getTime()) / (1000 * 60 * 60)).toFixed(2)
      },
      searchInterval: `${searchInterval}秒`,
      tolerances
    });

    this.logger.debug("天体整列検索開始", {
      locationId: location.id,
      locationName: location.name,
      eventType,
      eventPhase,
      skytreeAzimuth,
      elevationAngleToSkytreeSummit,
      elevationToSkytree: location.elevationToSkytree,
      searchRange: {
        start: this.astroTimeToDate(startTime).toISOString(),
        end: this.astroTimeToDate(endTime).toISOString(),
        durationHours: (this.astroTimeToDate(endTime).getTime() - this.astroTimeToDate(startTime).getTime()) / (1000 * 60 * 60)
      }
    });

    // 複数の候補を保持できるように配列に変更
    const candidates: Array<{
      time: Date;
      azimuthDiff: number;
      elevationDiff: number;
      sunOrMoonPosition: { azimuth: number; elevation: number };
      moonPhase?: number;
      moonIllumination?: number;
      totalScore: number;
    }> = [];

    let searchCount = 0;
    let validPositionCount = 0;
    let candidateCount = 0;

    for (
      let time = new Date(startTime);
      time <= endTime;
      time.setSeconds(time.getSeconds() + searchInterval)
    ) {
      searchCount++;

      const sunOrMoonPosition = eventType === "diamond"
        ? this.celestialCalc.calculateSunPosition(time, location)
        : this.celestialCalc.calculateMoonPosition(time, location);

      if (!sunOrMoonPosition || !this.celestialCalc.isVisible(sunOrMoonPosition.elevation)) {
        continue;
      }

      validPositionCount++;

      const azimuthDiff = this.coordinateCalc.getAzimuthDifference(
        sunOrMoonPosition.azimuth,
        skytreeAzimuth,
      );

      // スカイツリーの仰角範囲をチェック（太陽: 0-35 度、月: 0-65 度）
      const maxSunOrMoonElevation = eventType === "diamond" ? 35 : 65;
      const minSunOrMoonElevation = 0;

      // 天体の仰角がスカイツリーの見える範囲内かチェック
      const isWithinElevationRange = sunOrMoonPosition.elevation >= minSunOrMoonElevation && sunOrMoonPosition.elevation <= maxSunOrMoonElevation;

      // 仰角差は範囲外の場合のみ計算（範囲内なら 0 とする）
      let elevationDiff = 0;
      if (!isWithinElevationRange) {
        if (sunOrMoonPosition.elevation < minSunOrMoonElevation) {
          elevationDiff = minSunOrMoonElevation - sunOrMoonPosition.elevation;
        } else if (sunOrMoonPosition.elevation > maxSunOrMoonElevation) {
          elevationDiff = sunOrMoonPosition.elevation - maxSunOrMoonElevation;
        }
      }

      // デバッグ用：最初の数回の計算結果をログ出力
      if (searchCount <= 5 || (searchCount % 100 === 0)) {
        this.logger.debug(`${eventType === "diamond" ? "太陽" : "月"}位置計算 (${searchCount}回目)`, {
          time: this.astroTimeToDate(time).toISOString(),
          sunOrMoonPosition: sunOrMoonPosition ? {
            azimuth: sunOrMoonPosition.azimuth.toFixed(3),
            elevation: sunOrMoonPosition.elevation.toFixed(3)
          } : null,
          skytreeTarget: {
            azimuth: skytreeAzimuth.toFixed(3),
            elevationAngleToSkytreeSummit: elevationAngleToSkytreeSummit.toFixed(3),
            sunOrMoonElevationRange: `${minSunOrMoonElevation}-${maxSunOrMoonElevation}度`
          },
          differences: sunOrMoonPosition ? {
            azimuth: azimuthDiff.toFixed(3),
            elevation: elevationDiff.toFixed(3)
          } : null,
          tolerances,
          withinTolerance: sunOrMoonPosition ? {
            azimuth: azimuthDiff <= tolerances.azimuthTolerance,
            elevation: elevationDiff <= tolerances.elevationTolerance,
            elevationRange: isWithinElevationRange
          } : null,
          visible: sunOrMoonPosition ? this.celestialCalc.isVisible(sunOrMoonPosition.elevation) : false
        });

        this.logger.debug("天体位置計算詳細", {
          searchCount,
          time: this.astroTimeToDate(time).toISOString(),
          celestialBody: eventType === "diamond" ? "太陽" : "月",
          sunOrMoonPosition: {
            azimuth: sunOrMoonPosition.azimuth,
            elevation: sunOrMoonPosition.elevation
          },
          skytreeTarget: {
            azimuth: skytreeAzimuth,
            elevationAngleToSkytreeSummit: elevationAngleToSkytreeSummit,
            sunOrMoonElevationRange: `${minSunOrMoonElevation}-${maxSunOrMoonElevation}度`
          },
          differences: {
            azimuth: azimuthDiff,
            elevation: elevationDiff
          },
          tolerances,
          withinTolerance: {
            azimuth: azimuthDiff <= tolerances.azimuthTolerance,
            elevation: elevationDiff <= tolerances.elevationTolerance,
            elevationRange: isWithinElevationRange
          }
        });
      }

      // 許容範囲内かチェック（方位角・高度の両方を考慮）
      if (
        azimuthDiff <= tolerances.azimuthTolerance &&
        elevationDiff <= tolerances.elevationTolerance
      ) {
        candidateCount++;

        this.logger.debug(`${eventType === "diamond" ? "太陽" : "月"}候補発見！`, {
          candidateNumber: candidateCount,
          time: this.astroTimeToDate(time).toISOString(),
          azimuthDiff,
          elevationDiff
        });

        // 条件を満たすすべての候補を配列に追加
        const totalScore = azimuthDiff + elevationDiff * 2; // 高度差を重視

        candidates.push({
          time: new Date(time),
          azimuthDiff,
          elevationDiff,
          sunOrMoonPosition,
          totalScore,
          moonPhase:
            "phase" in sunOrMoonPosition
              ? (sunOrMoonPosition as MoonPosition).phase
              : undefined,
          moonIllumination:
            "illumination" in sunOrMoonPosition
              ? (sunOrMoonPosition as MoonPosition).illumination
              : undefined,
        });

        this.logger.debug(`${eventType === "diamond" ? "太陽" : "月"}候補追加！`, {
          candidateNumber: candidateCount,
          time: this.astroTimeToDate(time).toISOString(),
          totalScore,
          azimuthDiff,
          elevationDiff
        });

        this.logger.debug("候補追加", {
          locationId: location.id,
          eventType,
          time: this.astroTimeToDate(time).toISOString(),
          totalScore,
          azimuthDiff,
          elevationDiff
        });
      }
    }

    this.logger.debug(`${eventType === "diamond" ? "太陽" : "月"}検索完了`, {
      locationId: location.id,
      locationName: location.name,
      searchStatistics: {
        totalSearchPoints: searchCount,
        validPositions: validPositionCount,
        candidatesFound: candidateCount,
        validPositionRate: validPositionCount > 0 ? ((validPositionCount / searchCount) * 100).toFixed(1) + "%" : "0%",
        candidateRate: validPositionCount > 0 ? ((candidateCount / validPositionCount) * 100).toFixed(1) + "%" : "0%"
      },
      searchInterval: `${searchInterval}秒`,
      tolerances,
      resultSummary: candidateCount > 0 ? `${candidateCount}個の候補から最適解を選択` : "条件に合う候補が見つかりませんでした"
    });

    this.logger.debug("天体整列検索完了", {
      locationId: location.id,
      locationName: location.name,
      eventType,
      searchStatistics: {
        totalSearchPoints: searchCount,
        validPositions: validPositionCount,
        candidatesFound: candidateCount
      },
      searchInterval,
      tolerances
    });

    // 候補を高度レンジ × 昇る/沈むでグループ化して、各レンジで最も精度の良いものを選択
    if (candidates.length > 0) {
      const elevationRanges = await this.groupCandidatesByElevationRange(candidates, eventType, location);

      for (const [rangeKey, rangeCandidates] of elevationRanges.entries()) {
        // 各高度レンジ内で最も精度の良い候補を選択
        rangeCandidates.sort((a, b) => a.totalScore - b.totalScore);
        const bestCandidate = rangeCandidates[0];

        this.logger.debug(`高度レンジ ${rangeKey} の最適候補`, {
          time: this.astroTimeToDate(bestCandidate.time).toISOString(),
          sunOrMoonElevation: bestCandidate.sunOrMoonPosition.elevation.toFixed(3),
          totalScore: bestCandidate.totalScore,
          azimuthDiff: bestCandidate.azimuthDiff,
          elevationDiff: bestCandidate.elevationDiff,
          candidatesInRange: rangeCandidates.length
        });

        // パールスカイツリーの場合は月相チェック
        if (
          eventType === "pearl" &&
          bestCandidate.moonIllumination !== undefined
        ) {
          if (
            !this.celestialCalc.isVisibleMoonPhase(bestCandidate.moonIllumination)
          ) {
            continue; // 月が暗すぎる場合はこのレンジをスキップ
          }
        }

        // 実際の天体の昇降時刻に基づいて subType を判定
        let subType: "sunrise" | "sunset" | "rising" | "setting";

        if (eventType === "diamond") {
          // 太陽の場合
          subType = await this.determineSunSubType(bestCandidate.time, location);
        } else {
          // 月の場合
          subType = await this.determineMoonSubType(bestCandidate.time, location);
        }

        // イベント詳細をデバッグ出力
        this.logger.debug("イベント作成詳細", {
          locationId: location.id,
          locationName: location.name,
          eventType, // diamond, pearl
          celestialBody: eventType === "diamond" ? "太陽" : "月",
          elevationRange: rangeKey,
          finalSubType: subType, // sunrise, sunset, rising, setting
          time: bestCandidate.time,
          sunOrMoonAzimuth: bestCandidate.sunOrMoonPosition.azimuth,
          sunOrMoonElevation: bestCandidate.sunOrMoonPosition.elevation,
          elevationAngleToSkytreeSummit: elevationAngleToSkytreeSummit,
          azimuthDiff: bestCandidate.azimuthDiff,
          elevationDiff: bestCandidate.elevationDiff,
          totalScore: bestCandidate.totalScore
        });

        events.push({
          id: `${location.id}-${timeUtils.formatDateString(date)}-${eventType}-${this.astroTimeToDate(bestCandidate.time).getTime()}-${rangeKey}`,
          type: eventType,
          subType,
          time: bestCandidate.time,
          location: location,
          azimuth: bestCandidate.sunOrMoonPosition.azimuth,
          elevation: elevationAngleToSkytreeSummit,  // スカイツリーへの仰角を使用
          accuracy: await this.getOverallAccuracy(
            bestCandidate.azimuthDiff,
            bestCandidate.elevationDiff,
          ),
          qualityScore: await this.calculateQualityScore(
            bestCandidate.azimuthDiff,
            bestCandidate.sunOrMoonPosition.elevation,
          ),
          moonPhase: bestCandidate.moonPhase,
          moonIllumination: bestCandidate.moonIllumination,
        });
      }
    }

    return events;
  }

  /**
   * 太陽の実際の昇降時刻に基づいて subType を判定
   */
  private async determineSunSubType(
      eventTime: Date,
      location: Location,
    ): Promise<"sunrise" | "sunset"> {
    try {
      // シンプルにスカイツリーの方向で判定
      // スカイツリーより東側（< 180度）なら昇る、西側（>= 180度）なら沈む
      const skytreeAzimuth = this.coordinateCalc.calculateAzimuthToSkytree(location);
      
      this.logger.debug("太陽の昇る/沈む判定", {
        locationId: location.id,
        eventTime: this.astroTimeToDate(eventTime).toISOString(),
        skytreeAzimuth,
        method: "simple_direction_based"
      });

      if (skytreeAzimuth < 180) {
        return "sunrise"; // 東側 → 昇る
      } else {
        return "sunset"; // 西側 → 沈む
      }

    } catch (error) {
      this.logger.warn("Failed to determine sun subType, using fallback", {
        error: error as Error,
        eventTime: this.astroTimeToDate(eventTime).toISOString(),
        locationId: location.id
      });

      // フォールバック: 時刻による簡易判定
      const hour = eventTime.getHours();
      return hour < 12 ? "sunrise" : "sunset";
    }
  }

  /**
   * 月の実際の昇降時刻に基づいて subType を判定
   */
  private async determineMoonSubType(
    eventTime: Date,
    location: Location,
  ): Promise<"rising" | "setting"> {
    try {
      // シンプルにスカイツリーの方向で判定
      // スカイツリーより東側（< 180度）なら昇る、西側（>= 180度）なら沈む
      const skytreeAzimuth = this.coordinateCalc.calculateAzimuthToSkytree(location);
      
      this.logger.debug("月の昇る/沈む判定", {
        locationId: location.id,
        eventTime: this.astroTimeToDate(eventTime).toISOString(),
        skytreeAzimuth,
        method: "simple_direction_based"
      });

      if (skytreeAzimuth < 180) {
        return "rising"; // 東側 → 昇る
      } else {
        return "setting"; // 西側 → 沈む
      }

    } catch (error) {
      this.logger.warn("Failed to determine moon subType, using fallback", {
        error: error as Error,
        eventTime: this.astroTimeToDate(eventTime).toISOString(),
        locationId: location.id
      });

      // フォールバック: 月の方位角による判定
      const moonPosition = this.celestialCalc.calculateMoonPosition(eventTime, location);
      if (moonPosition && moonPosition.azimuth < 180) {
        return "rising"; // 東側
      } else {
        return "setting"; // 西側
      }
    }
  }

  /**
   * 検索時間範囲を取得（実際の日の出・日の入り時刻に基づく動的範囲）
   */
  private getSearchTimeRange(
    date: Date,
    eventPhase: string,
    location: Location,
  ): { startTime: Date; endTime: Date } {
    const baseDate = new Date(date);

    switch (eventPhase) {
      case "sunrise":
        return this.getSunriseSearchRange(date, location);
      case "sunset":
        return this.getSunsetSearchRange(date, location);
      case "sun_all_day": {
        // 日の出から日の入りまでの全時間帯（実際の時刻に基づく）
        const sunriseRange = this.getSunriseSearchRange(date, location);
        const sunsetRange = this.getSunsetSearchRange(date, location);
        return {
          startTime: sunriseRange.startTime,
          endTime: sunsetRange.endTime,
        };
      }
      case "moon_all_day":
        // 月の出から月の入りまでの全時間帯（24 時間）
        return {
          startTime: baseDate,
          endTime: new Date(baseDate.getTime() + 24 * 60 * 60 * 1000),
        };
      case "moonrise":
        return this.getMoonriseSearchRange(date, location);
      case "moonset":
        return this.getMoonsetSearchRange(date, location);
      default:
        return {
          startTime: baseDate,
          endTime: new Date(baseDate.getTime() + 24 * 60 * 60 * 1000),
        };
    }
  }

  /**
   * 日の出の検索時間範囲を取得（実際の日の出時刻の前後 1 時間）
   */
  private getSunriseSearchRange(
    date: Date,
    _location: Location,
  ): { startTime: Date; endTime: Date } {
    // ダイヤモンドスカイツリーは太陽がスカイツリー方向に来る現象
    // 日の出時刻とは無関係に 1 日中発生する可能性があるため、全日検索する
    const baseDate = new Date(date);
    return {
      startTime: new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate(), 0, 0, 0), // 0 時から
      endTime: new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate(), 23, 59, 59),   // 23 時 59 分まで
    };
  }

  /**
   * 日の入りの検索時間範囲を取得（実際の日の入り時刻の前後 1 時間）
   */
  private getSunsetSearchRange(
    date: Date,
    _location: Location,
  ): { startTime: Date; endTime: Date } {
    // ダイヤモンドスカイツリーは太陽がスカイツリー方向に来る現象
    // 日の入り時刻とは無関係に 1 日中発生する可能性があるため、全日検索する
    const baseDate = new Date(date);
    return {
      startTime: new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate(), 0, 0, 0), // 0 時から
      endTime: new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate(), 23, 59, 59),   // 23 時 59 分まで
    };
  }

  /**
   * 月の出の検索時間範囲を取得（実際の月の出時刻の前後 6 時間）
   */
  private getMoonriseSearchRange(
    date: Date,
    location: Location,
  ): { startTime: Date; endTime: Date } {
    try {
      const observer = new (Astronomy as typeof import('astronomy-engine')).Observer(
        location.latitude,
        location.longitude,
        location.elevation
      );

      const dateOnly = new Date(date.getFullYear(), date.getMonth(), date.getDate());
      const utcDateOnly = new Date(dateOnly.getTime() - 9 * 60 * 60 * 1000); // JST→UTC

      const moonrise = (Astronomy as typeof import('astronomy-engine')).SearchRiseSet(
        (Astronomy as typeof import('astronomy-engine')).Body.Moon,
        observer,
        1, // direction: 1 = rising
        utcDateOnly,
        1, // days to search
      );

      if (moonrise && !isNaN(this.astroTimeToDate(moonrise.date || moonrise).getTime())) {
        const moonriseTime = moonrise.date || moonrise;
        const moonriseJST = new Date(this.astroTimeToDate(moonriseTime).getTime() + 9 * 60 * 60 * 1000); // UTC→JST
        
        return {
          startTime: new Date(moonriseJST.getTime() - 6 * 60 * 60 * 1000), // 6 時間前
          endTime: new Date(moonriseJST.getTime() + 6 * 60 * 60 * 1000),   // 6 時間後
        };
      }
    } catch (error) {
      this.logger.warn("月の出時刻の取得に失敗、フォールバック時間を使用", {
        error: error as Error,
        date: date.toISOString(),
        locationId: location.id
      });
    }

    // フォールバック: 0:00-12:00
    const baseDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    return {
      startTime: baseDate,
      endTime: new Date(baseDate.getTime() + 12 * 60 * 60 * 1000),
    };
  }

  /**
   * 月の入りの検索時間範囲を取得（実際の月の入り時刻の前後 6 時間）
   */
  private getMoonsetSearchRange(
    date: Date,
    location: Location,
  ): { startTime: Date; endTime: Date } {
    try {
      const observer = new (Astronomy as typeof import('astronomy-engine')).Observer(
        location.latitude,
        location.longitude,
        location.elevation
      );

      const dateOnly = new Date(date.getFullYear(), date.getMonth(), date.getDate());
      const utcDateOnly = new Date(dateOnly.getTime() - 9 * 60 * 60 * 1000); // JST→UTC

      const moonset = (Astronomy as typeof import('astronomy-engine')).SearchRiseSet(
        (Astronomy as typeof import('astronomy-engine')).Body.Moon,
        observer,
        -1, // direction: -1 = setting
        utcDateOnly,
        1, // days to search
      );

      if (moonset && !isNaN(this.astroTimeToDate(moonset.date || moonset).getTime())) {
        const moonsetTime = moonset.date || moonset;
        const moonsetJST = new Date(this.astroTimeToDate(moonsetTime).getTime() + 9 * 60 * 60 * 1000); // UTC→JST
        
        return {
          startTime: new Date(moonsetJST.getTime() - 6 * 60 * 60 * 1000), // 6 時間前
          endTime: new Date(moonsetJST.getTime() + 6 * 60 * 60 * 1000),   // 6 時間後
        };
      }
    } catch (error) {
      this.logger.warn("月の入り時刻の取得に失敗、フォールバック時間を使用", {
        error: error as Error,
        date: date.toISOString(),
        locationId: location.id
      });
    }

    // フォールバック: 12:00-24:00
    const baseDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    return {
      startTime: new Date(baseDate.getTime() + 12 * 60 * 60 * 1000),
      endTime: new Date(baseDate.getTime() + 24 * 60 * 60 * 1000),
    };
  }

  /**
   * 精度レベルを取得（DB 設定値対応）
   */
  private async getAccuracyLevel(
    azimuthDiff: number,
  ): Promise<"perfect" | "excellent" | "good" | "fair"> {
    // システム設定から精度閾値を取得
    const perfectThreshold = await this.settingsService.getNumberSetting(
      "accuracy_perfect_threshold",
      0.1,
    );
    const excellentThreshold = await this.settingsService.getNumberSetting(
      "accuracy_excellent_threshold",
      0.25,
    );
    const goodThreshold = await this.settingsService.getNumberSetting(
      "accuracy_good_threshold",
      0.4,
    );
    const fairThreshold = await this.settingsService.getNumberSetting(
      "accuracy_fair_threshold",
      0.6,
    );

    if (azimuthDiff <= perfectThreshold) return "perfect";
    if (azimuthDiff <= excellentThreshold) return "excellent";
    if (azimuthDiff <= goodThreshold) return "good";
    if (azimuthDiff <= fairThreshold) return "fair";
    return "fair"; // 許容範囲を超える（実際には除外される）
  }

  /**
   * 仰角の精度レベルを取得（DB 設定値対応）
   */
  private async getElevationAccuracyLevel(
    elevationDiff: number,
  ): Promise<"perfect" | "excellent" | "good" | "fair"> {
    // システム設定から精度閾値を取得（仰角用）
    const perfectThreshold = await this.settingsService.getNumberSetting(
      "elevation_accuracy_perfect_threshold",
      0.1,
    );
    const excellentThreshold = await this.settingsService.getNumberSetting(
      "elevation_accuracy_excellent_threshold",
      0.25,
    );
    const goodThreshold = await this.settingsService.getNumberSetting(
      "elevation_accuracy_good_threshold",
      0.4,
    );
    const fairThreshold = await this.settingsService.getNumberSetting(
      "elevation_accuracy_fair_threshold",
      0.6,
    );

    if (elevationDiff <= perfectThreshold) return "perfect";
    if (elevationDiff <= excellentThreshold) return "excellent";
    if (elevationDiff <= goodThreshold) return "good";
    if (elevationDiff <= fairThreshold) return "fair";
    return "fair"; // 許容範囲を超える（実際には除外される）
  }

  /**
   * 方位角と仰角の総合的な精度レベルを取得（DB 設定値対応）
   */
  private async getOverallAccuracy(
    azimuthDiff: number,
    elevationDiff: number,
  ): Promise<"perfect" | "excellent" | "good" | "fair"> {
    const azimuthAccuracy = await this.getAccuracyLevel(azimuthDiff);
    const elevationAccuracy =
      await this.getElevationAccuracyLevel(elevationDiff);

    // 両方の精度のうち、より低い方を総合精度とする
    const accuracyOrder = ["perfect", "excellent", "good", "fair"];
    const azimuthIndex = accuracyOrder.indexOf(azimuthAccuracy);
    const elevationIndex = accuracyOrder.indexOf(elevationAccuracy);

    return accuracyOrder[Math.max(azimuthIndex, elevationIndex)] as
      | "perfect"
      | "excellent"
      | "good"
      | "fair";
  }


  /**
   * 月の出パールスカイツリーが観測可能かチェック
   * スカイツリーの東側エリア（方位角 0-180 度）では月の出は見えない
   */
  private canObserveMoonrise(skytreeAzimuth: number): boolean {
    // スカイツリーが東側（0-180 度）にある場合は月の出は観測不可
    // 月は東から昇るため、スカイツリーが東側にあると月の出時にスカイツリーの向こう側から昇る
    return skytreeAzimuth >= 180;
  }

  /**
   * イベントタイプから subType を取得
   */
  private getSubType(
    eventType: string,
  ): "sunrise" | "sunset" | "rising" | "setting" {
    switch (eventType) {
      case "diamond_sunrise":
        return "sunrise";
      case "diamond_sunset":
        return "sunset";
      case "pearl_moonrise":
        return "rising";
      case "pearl_moonset":
        return "setting";
      default:
        return "sunrise";
    }
  }

  private async calculateQualityScore(
    azimuthDiff: number,
    elevation: number,
  ): Promise<number> {
    // 方位角精度スコア（0-50 点）
    const azimuthTolerance = await this.settingsService.getNumberSetting(
      "azimuth_tolerance",
      1.5,
    );
    const azimuthScore = Math.max(
      0,
      50 - (azimuthDiff / azimuthTolerance) * 50,
    );

    // 高度スコア（0-30 点）：高度 1 度以上で満点
    const elevationScore = Math.min(30, Math.max(0, elevation + 2) * 15);

    // 可視性スコア（0-20 点）：高度が高いほど高スコア
    const visibilityScore = Math.min(20, Math.max(0, elevation) * 2);

    return Math.round(azimuthScore + elevationScore + visibilityScore);
  }



  /**
   * 候補を高度レンジ × 昇る/沈むでグループ化
   */
  private async groupCandidatesByElevationRange(
    candidates: Array<{
      time: Date;
      azimuthDiff: number;
      elevationDiff: number;
      sunOrMoonPosition: { azimuth: number; elevation: number };
      moonPhase?: number;
      moonIllumination?: number;
      totalScore: number;
    }>,
    eventType: "diamond" | "pearl",
    location: Location
  ): Promise<Map<string, typeof candidates>> {
    const ranges = new Map<string, typeof candidates>();
    
    // 高度レンジを定義（太陽: 0-35 度、月: 0-65 度）
    const maxElevation = eventType === "diamond" ? 35 : 65;
    const rangeSize = 5; // 5 度刻み
    
    for (const candidate of candidates) {
      const elevation = candidate.sunOrMoonPosition.elevation;
      
      // 高度レンジを計算（0-4, 5-9, 10-14, 15-19, ...）
      const rangeStart = Math.floor(elevation / rangeSize) * rangeSize;
      const rangeEnd = Math.min(rangeStart + rangeSize - 1, maxElevation);
      
      // 昇る/沈むを判定（天体の高度変化で判定）
      let riseSetType: "rising" | "setting";
      if (eventType === "diamond") {
        riseSetType = await this.determineSunSubType(candidate.time, location) === "sunrise" ? "rising" : "setting";
      } else {
        // 月の場合は高度変化で判定
        riseSetType = await this.determineMoonRiseSetByElevationChange(candidate.time, location);
      }
      
      const rangeKey = `${rangeStart}-${rangeEnd}度-${riseSetType === "rising" ? "昇る" : "沈む"}`;
      
      if (!ranges.has(rangeKey)) {
        ranges.set(rangeKey, []);
      }
      ranges.get(rangeKey)!.push(candidate);
    }
    
    return ranges;
  }

  /**
   * 月の高度変化に基づいて昇る/沈むを判定
   */
  private async determineMoonRiseSetByElevationChange(
    eventTime: Date,
    location: Location,
  ): Promise<"rising" | "setting"> {
    try {
      // 10 分前と 10 分後の月の高度を計算
      const timeBefore = new Date(eventTime.getTime() - 10 * 60 * 1000);
      const timeAfter = new Date(eventTime.getTime() + 10 * 60 * 1000);
      
      const moonBefore = this.celestialCalc.calculateMoonPosition(timeBefore, location);
      const moonAfter = this.celestialCalc.calculateMoonPosition(timeAfter, location);
      
      if (moonBefore && moonAfter) {
        // 高度が上昇している場合は"rising"、下降している場合は"setting"
        return moonAfter.elevation > moonBefore.elevation ? "rising" : "setting";
      }
      
      // フォールバック: 方位角による判定
      const moonPosition = this.celestialCalc.calculateMoonPosition(eventTime, location);
      if (moonPosition && moonPosition.azimuth < 180) {
        return "rising"; // 東側
      } else {
        return "setting"; // 西側
      }
    } catch (error) {
      this.logger.warn("Failed to determine moon rise/set by elevation change", {
        error: error as Error,
        eventTime: this.astroTimeToDate(eventTime).toISOString(),
        locationId: location.id
      });
      
      // フォールバック: 方位角による判定
      const moonPosition = this.celestialCalc.calculateMoonPosition(eventTime, location);
      if (moonPosition && moonPosition.azimuth < 180) {
        return "rising"; // 東側
      } else {
        return "setting"; // 西側
      }
    }
  }

  /**
   * 精度レベルに応じた許容範囲を取得（スカイツリーの天辺に乗る精度）
   */
  private getTolerancesByLevel(level: "high" | "medium" | "low"): {
    azimuthTolerance: number;
    elevationTolerance: number;
  } {
    switch (level) {
      case "high":
        return {
          azimuthTolerance: 1.0, // 高精度：方位角 ±1.0 度（緩和）
          elevationTolerance: 0.5, // 高精度：仰角 ±0.5 度（緩和）
        };
      case "medium":
        return {
          azimuthTolerance: 2.0, // 中精度：方位角 ±2.0 度（緩和）
          elevationTolerance: 1.0, // 中精度：仰角 ±1.0 度（緩和）
        };
      case "low":
        return {
          azimuthTolerance: 3.0, // 低精度：方位角 ±3.0 度（緩和）
          elevationTolerance: 2.0, // 低精度：仰角 ±2.0 度（緩和）
        };
      default:
        return {
          azimuthTolerance: 2.0,
          elevationTolerance: 1.0,
        };
    }
  }

  /**
   * AstroTime 型を Date 型に変換
   */
  private astroTimeToDate(astroTime: any): Date {
    if (astroTime instanceof Date) {
      return astroTime;
    }
    // AstroTime オブジェクトの場合、date プロパティまたは ut プロパティを使用
    if (astroTime && typeof astroTime === 'object') {
      if (astroTime.date instanceof Date) {
        return astroTime.date;
      }
      if (typeof astroTime.ut === 'number') {
        // Universal Time (UT) から Date オブジェクトを作成
        // UT は 1900 年 1 月 1 日からの日数
        const baseDate = new Date(1900, 0, 1);
        return new Date(baseDate.getTime() + astroTime.ut * 24 * 60 * 60 * 1000);
      }
    }
    // フォールバック: 現在時刻を返す
    return new Date();
  }
}