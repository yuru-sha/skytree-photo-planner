import { SKYTREE_COORDINATES } from "@skytree-photo-planner/types";
import { getComponentLogger } from "@skytree-photo-planner/utils";

// Fallback coordinates in case import fails
const FALLBACK_SKYTREE_COORDINATES = {
  latitude: 35.7100069,
  longitude: 139.8108103,
  elevation: 638,
} as const;


/**
 * 座標・方位角・距離計算を担当するクラス
 * 地理的計算と幾何学的計算を集約
 */
export class CoordinateCalculator {
  private static readonly EARTH_RADIUS = 6371000; // メートル
  private logger = getComponentLogger("CoordinateCalculator");

  /**
   * 度からラジアンに変換
   */
  toRadians(degrees: number): number {
    return degrees * (Math.PI / 180);
  }

  /**
   * ラジアンから度に変換
   */
  toDegrees(radians: number): number {
    return radians * (180 / Math.PI);
  }

  /**
   * 撮影地点からスカイツリーへの方位角を計算
   */
  calculateAzimuthToSkytree(location: {
    latitude: number;
    longitude: number;
  }): number {
    const coords = SKYTREE_COORDINATES || FALLBACK_SKYTREE_COORDINATES;
    const lat1 = this.toRadians(location.latitude);
    const lon1 = this.toRadians(location.longitude);
    const lat2 = this.toRadians(coords.latitude);
    const lon2 = this.toRadians(coords.longitude);

    const deltaLon = lon2 - lon1;
    const y = Math.sin(deltaLon) * Math.cos(lat2);
    const x =
      Math.cos(lat1) * Math.sin(lat2) -
      Math.sin(lat1) * Math.cos(lat2) * Math.cos(deltaLon);

    const azimuth = this.toDegrees(Math.atan2(y, x));
    return (azimuth + 360) % 360;
  }







  /**
   * 撮影地点からスカイツリーへの距離を計算（ハバーサイン公式）
   */
  calculateDistanceToSkytree(location: {
    latitude: number;
    longitude: number;
  }): number {
    const coords = SKYTREE_COORDINATES || FALLBACK_SKYTREE_COORDINATES;
    const lat1 = this.toRadians(location.latitude);
    const lon1 = this.toRadians(location.longitude);
    const lat2 = this.toRadians(coords.latitude);
    const lon2 = this.toRadians(coords.longitude);

    const deltaLat = lat2 - lat1;
    const deltaLon = lon2 - lon1;

    const a =
      Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
      Math.cos(lat1) *
        Math.cos(lat2) *
        Math.sin(deltaLon / 2) *
        Math.sin(deltaLon / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return CoordinateCalculator.EARTH_RADIUS * c;
  }

  /**
   * スカイツリー頂部への仰角を計算（地球曲率と大気屈折を考慮）
   */
  calculateElevationToSkytreeSummit(location: {
    latitude: number;
    longitude: number;
    elevation: number;
  }): number {
    const distance = this.calculateDistanceToSkytree(location);

    // 観測者実効高度（アイレベル 1.7m を考慮）
    const coords = SKYTREE_COORDINATES || FALLBACK_SKYTREE_COORDINATES;
    const observerEffectiveHeight = location.elevation + 1.7;
    // スカイツリーの高さは 634m（頂部までの構造物の高さ）
    const skytreeHeight = 634; // 構造物の実際の高さを使用
    const heightDifference = skytreeHeight - observerEffectiveHeight;

    // 地球曲率による見かけの高度低下
    const curvatureDrop =
      Math.pow(distance, 2) / (2 * CoordinateCalculator.EARTH_RADIUS);

    // 大気屈折による見かけの高度上昇（曲率の 13% を相殺）
    const refractionLift = 0.13 * curvatureDrop;

    // 正味の見かけ低下
    const netApparentDrop = curvatureDrop - refractionLift;

    // 見かけの垂直距離
    const apparentVerticalDistance = heightDifference - netApparentDrop;

    // 最終仰角計算
    const elevationRadians = Math.atan2(apparentVerticalDistance, distance);
    const elevationDegrees = this.toDegrees(elevationRadians);

    this.logger.debug("スカイツリー頂部仰角計算", {
      inputLocation: {
        latitude: location.latitude,
        longitude: location.longitude,
        elevation: location.elevation,
      },
      skytreeCoords: coords,
      skytreeActualHeight: skytreeHeight,
      distance: Math.round(distance),
      observerEffectiveHeight,
      heightDifference,
      curvatureDrop: Math.round(curvatureDrop * 1000) / 1000,
      refractionLift: Math.round(refractionLift * 1000) / 1000,
      netApparentDrop: Math.round(netApparentDrop * 1000) / 1000,
      apparentVerticalDistance,
      elevationRadians,
      finalElevation: elevationDegrees,
      // 計算検証
      isDistanceValid: isFinite(distance) && distance > 0,
      isHeightDiffValid: isFinite(heightDifference),
      isElevationValid: isFinite(elevationDegrees),
    });

    // 無効な値の場合はエラーをスロー
    if (!isFinite(elevationDegrees) || isNaN(elevationDegrees)) {
      const errorMsg = `仰角計算で無効な値: ${elevationDegrees}`;
      this.logger.error(errorMsg, new Error(errorMsg), {
        distance,
        heightDifference,
        apparentVerticalDistance,
        elevationRadians,
      });
      throw new Error(errorMsg);
    }

    return elevationDegrees;
  }

  /**
   * 方位角の差を計算（最短角度）
   */
  getAzimuthDifference(azimuth1: number, azimuth2: number): number {
    const diff = Math.abs(azimuth1 - azimuth2);
    return Math.min(diff, 360 - diff);
  }
}
