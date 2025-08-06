import * as Astronomy from "astronomy-engine";
import { SunPosition, MoonPosition } from "@skytree-photo-planner/types";
import { getComponentLogger } from "@skytree-photo-planner/utils";

/**
 * 天体位置計算を担当するクラス
 * 太陽・月の位置計算を集約
 */
export class CelestialPositionCalculator {
  private logger = getComponentLogger("CelestialPositionCalculator");

  /**
   * 指定した時刻・地点での太陽位置を計算
   */
  calculateSunPosition(
    date: Date,
    location: { latitude: number; longitude: number },
  ): SunPosition | null {
    try {
      const observer = new Astronomy.Observer(
        location.latitude,
        location.longitude,
        0,
      );
      const equator = Astronomy.Equator(
        Astronomy.Body.Sun,
        date,
        observer,
        true,
        true,
      );
      const horizon = Astronomy.Horizon(
        date,
        observer,
        equator.ra,
        equator.dec,
        "normal",
      );

      return {
        azimuth: horizon.azimuth,
        elevation: horizon.altitude,
        distance: equator.dist,
      };
    } catch (error) {
      this.logger.error("太陽位置計算エラー", error, {
        date: date.toISOString(),
        location,
      });
      return null;
    }
  }

  /**
   * 指定した時刻・地点での月位置を計算
   */
  calculateMoonPosition(
    date: Date,
    location: { latitude: number; longitude: number },
  ): MoonPosition | null {
    try {
      const observer = new Astronomy.Observer(
        location.latitude,
        location.longitude,
        0,
      );
      const equator = Astronomy.Equator(
        Astronomy.Body.Moon,
        date,
        observer,
        true,
        true,
      );
      const horizon = Astronomy.Horizon(
        date,
        observer,
        equator.ra,
        equator.dec,
        "normal",
      );

      // 月相計算
      const phaseInfo = Astronomy.MoonPhase(date);
      const illumination = this.calculateMoonIllumination(phaseInfo);

      return {
        azimuth: horizon.azimuth,
        elevation: horizon.altitude,
        distance: equator.dist,
        phase: phaseInfo,
        illumination,
      };
    } catch (error) {
      this.logger.error("月位置計算エラー", error, {
        date: date.toISOString(),
        location,
      });
      return null;
    }
  }

  /**
   * 太陽の最高高度を計算
   */
  calculateSunMaxElevation(
    date: Date,
    location: { latitude: number; longitude: number },
  ): number {
    try {
      const observer = new Astronomy.Observer(
        location.latitude,
        location.longitude,
        0,
      );

      // 太陽の南中時刻を検索
      const transit = Astronomy.SearchHourAngle(
        Astronomy.Body.Sun,
        observer,
        0,
        date,
      );
      if (!transit) return -90;

      const sunPosition = this.calculateSunPosition(
        transit.time.date,
        location,
      );
      return sunPosition?.elevation || -90;
    } catch (error) {
      this.logger.error("太陽最高高度計算エラー", error);
      return -90;
    }
  }

  /**
   * 月の照度率を計算（0-1 の範囲）
   */
  private calculateMoonIllumination(phase: number): number {
    // Astronomy Engine の MoonPhase は 0-360 度の範囲
    // 新月 (0 度) で照度 0、満月 (180 度) で照度 1
    let normalizedPhase = phase % 360;
    if (normalizedPhase < 0) normalizedPhase += 360;

    // 0-180 度は照度増加、180-360 度は照度減少
    if (normalizedPhase <= 180) {
      return normalizedPhase / 180;
    } else {
      return (360 - normalizedPhase) / 180;
    }
  }

  /**
   * 月相が撮影に適しているかを判定
   */
  isVisibleMoonPhase(
    illumination: number,
    minIllumination: number = 0.1,
  ): boolean {
    return illumination >= minIllumination;
  }

  /**
   * 太陽の南中時刻を計算
   */
  calculateSolarNoon(
    date: Date,
    location: { latitude: number; longitude: number },
  ): Date | null {
    try {
      const observer = new Astronomy.Observer(
        location.latitude,
        location.longitude,
        0,
      );

      // 指定日の 0:00 UTC から検索開始（より広い時間範囲で検索）
      const startTime = new Date(date);
      startTime.setUTCHours(0, 0, 0, 0);

      // Astronomy Engine の南中時刻計算
      const transit = Astronomy.SearchHourAngle(
        Astronomy.Body.Sun,
        observer,
        0, // 南中は時角 0
        startTime,
        2, // 2 日以内に検索（より広い検索範囲）
      );

      if (transit) {
        this.logger.debug("太陽南中時刻計算成功", {
          date: date.toISOString(),
          transitTime: transit.time.date.toISOString(),
          location: `${location.latitude},${location.longitude}`,
        });
        return transit.time.date;
      }

      this.logger.warn("太陽南中時刻が見つかりません", {
        date: date.toISOString(),
        location: `${location.latitude},${location.longitude}`,
        reason: "2 日以内に南中時刻が存在しない",
      });
      return null;
    } catch (error) {
      this.logger.error("太陽南中時刻計算エラー", error, {
        date: date.toISOString(),
        location,
      });
      return null;
    }
  }

  /**
   * 月の南中時刻を計算
   */
  calculateLunarTransit(
    date: Date,
    location: { latitude: number; longitude: number },
  ): Date | null {
    try {
      const observer = new Astronomy.Observer(
        location.latitude,
        location.longitude,
        0,
      );

      // 指定日の 0:00 UTC から検索開始
      const startTime = new Date(date);
      startTime.setUTCHours(0, 0, 0, 0);

      // Astronomy Engine の南中時刻計算
      const transit = Astronomy.SearchHourAngle(
        Astronomy.Body.Moon,
        observer,
        0, // 南中は時角 0
        startTime,
        2, // 2 日以内に検索（月の軌道周期を考慮）
      );

      if (transit) {
        this.logger.debug("月南中時刻計算成功", {
          date: date.toISOString(),
          transitTime: transit.time.date.toISOString(),
          location: `${location.latitude},${location.longitude}`,
        });
        return transit.time.date;
      }

      this.logger.warn("月南中時刻が見つかりません", {
        date: date.toISOString(),
        location: `${location.latitude},${location.longitude}`,
        reason: "2 日以内に南中時刻が存在しない",
      });
      return null;
    } catch (error) {
      this.logger.error("月南中時刻計算エラー", error, {
        date: date.toISOString(),
        location,
      });
      return null;
    }
  }

  /**
   * 天体の可視性を判定（高度による）
   */
  isVisible(altitude: number, minAltitude: number = -6): boolean {
    return altitude > minAltitude; // 太陽・月の低仰角も対象にするため-6度まで拡張
  }
}
