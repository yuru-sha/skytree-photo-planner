import * as Astronomy from "astronomy-engine";
import { SKYTREE_COORDINATES } from "@skytree-photo-planner/types";
import { getComponentLogger } from "@skytree-photo-planner/utils";

const logger = getComponentLogger("elevationPointCalculator");

// スカイツリーの天辺高度（メートル）
const SKYTREE_HEIGHT = 634;

interface ElevationPoint {
  elevation: number; // 天体の高度（度）
  latitude: number;
  longitude: number;
  distance: number; // スカイツリーからの距離（km）
  azimuth: number; // スカイツリーから見た方位角
  time: Date; // 天体がこの高度になる実際の時刻
}

/**
 * 日の出・日の入り時間を取得
 */
function getSunRiseSet(date: Date): { sunrise: Date; sunset: Date } {
  const observer = new Astronomy.Observer(
    SKYTREE_COORDINATES.latitude,
    SKYTREE_COORDINATES.longitude,
    0
  );

  // JST 基準でその日の開始時刻を作成
  const jstDate = new Date(date.toLocaleString("en-US", { timeZone: "Asia/Tokyo" }));
  const startOfDay = new Date(jstDate.getFullYear(), jstDate.getMonth(), jstDate.getDate(), 0, 0, 0);
  const sunrise = Astronomy.SearchRiseSet(Astronomy.Body.Sun, observer, 1, startOfDay, 1);
  
  // 日の出の後から日の入りを検索（下降方向）
  const sunriseTime = sunrise?.date || startOfDay;
  const sunset = Astronomy.SearchRiseSet(Astronomy.Body.Sun, observer, -1, sunriseTime, 1);

  return {
    sunrise: sunrise ? new Date(sunrise.date.getTime()) : new Date(date.getTime() + 6 * 60 * 60 * 1000), // 6 時代替
    sunset: sunset ? new Date(sunset.date.getTime()) : new Date(date.getTime() + 18 * 60 * 60 * 1000)   // 18 時代替
  };
}

/**
 * 月の出・月の入り時間を取得
 */
function getMoonRiseSet(date: Date): { moonrise: Date; moonset: Date } {
  const observer = new Astronomy.Observer(
    SKYTREE_COORDINATES.latitude,
    SKYTREE_COORDINATES.longitude,
    0
  );

  // JST 基準でその日の開始時刻を作成
  const jstDate = new Date(date.toLocaleString("en-US", { timeZone: "Asia/Tokyo" }));
  const startOfDay = new Date(jstDate.getFullYear(), jstDate.getMonth(), jstDate.getDate(), 0, 0, 0);
  const moonrise = Astronomy.SearchRiseSet(Astronomy.Body.Moon, observer, 1, startOfDay, 1);
  
  // 月の出の後から月の入りを検索（下降方向）
  const moonriseTime = moonrise?.date || startOfDay;
  const moonset = Astronomy.SearchRiseSet(Astronomy.Body.Moon, observer, -1, moonriseTime, 1);

  return {
    moonrise: moonrise ? new Date(moonrise.date.getTime()) : new Date(date.getTime() + 12 * 60 * 60 * 1000), // 12 時代替
    moonset: moonset ? new Date(moonset.date.getTime()) : new Date(date.getTime() + 24 * 60 * 60 * 1000)    // 24 時代替
  };
}

/**
 * 指定された日・天体において、スカイツリーの天辺と高度が一致する地点を計算
 * @param date 日付（日の出から日の入り、月の出から月の入りの時間帯で計算）
 * @param celestialBody "sun" または "moon"
 * @param elevations 計算する高度の配列（度）
 * @returns 高度別の地点配列
 */
export function calculateElevationPoints(
  date: Date,
  celestialBody: "sun" | "moon",
  elevations?: number[]
): ElevationPoint[] {
  const results: ElevationPoint[] = [];
  const body = celestialBody === "sun" ? Astronomy.Body.Sun : Astronomy.Body.Moon;

  // 実用的な高度範囲を設定（撮影に適した角度）
  const defaultElevations = celestialBody === "sun" 
    ? Array.from({ length: 7 }, (_, i) => i * 5)  // 太陽: 0〜30 度を 5 度刻み
    : Array.from({ length: 13 }, (_, i) => i * 5); // 月: 0〜60 度を 5 度刻み
  
  let targetElevations = elevations || defaultElevations;

  // 天体の最高高度を計算して高度範囲を制限
  const observer = new Astronomy.Observer(
    SKYTREE_COORDINATES.latitude,
    SKYTREE_COORDINATES.longitude,
    0
  );
  
  let maxElevation = 90; // デフォルト最大値
  try {
    if (celestialBody === "sun") {
      const transit = Astronomy.SearchHourAngle(Astronomy.Body.Sun, observer, 0, date, 1);
      if (transit) {
        const equatorial = Astronomy.Equator(Astronomy.Body.Sun, transit.time, observer, true, true);
        const horizontal = Astronomy.Horizon(transit.time, observer, equatorial.ra, equatorial.dec, "normal");
        maxElevation = Math.floor(horizontal.altitude) - 1; // 最高高度より 1 度低く設定
      }
    } else {
      const transit = Astronomy.SearchHourAngle(Astronomy.Body.Moon, observer, 0, date, 1);
      if (transit) {
        const equatorial = Astronomy.Equator(Astronomy.Body.Moon, transit.time, observer, true, true);
        const horizontal = Astronomy.Horizon(transit.time, observer, equatorial.ra, equatorial.dec, "normal");
        maxElevation = Math.floor(horizontal.altitude) - 1; // 最高高度より 1 度低く設定
      }
    }
  } catch (error) {
    logger.debug("最高高度計算エラー", error);
  }

  // 最高高度を超える高度を除外
  targetElevations = targetElevations.filter(elevation => elevation <= maxElevation);
  
  logger.debug("高度計算範囲", {
    celestialBody,
    maxElevation,
    originalElevations: (elevations || defaultElevations).length,
    filteredElevations: targetElevations.length,
    elevations: targetElevations
  });

  // 天体の出没時間を取得
  let riseTime: Date;
  let setTime: Date;
  
  if (celestialBody === "sun") {
    const sunTimes = getSunRiseSet(date);
    riseTime = sunTimes.sunrise;
    setTime = sunTimes.sunset;
  } else {
    const moonTimes = getMoonRiseSet(date);
    riseTime = moonTimes.moonrise;
    setTime = moonTimes.moonset;
  }

  logger.debug("天体出没時間", {
    date: date.toISOString(),
    body: celestialBody,
    rise: riseTime,
    set: setTime
  });

  // 各高度に対して計算
  for (const targetElevation of targetElevations) {
    // 実用的な高度範囲でフィルタリング
    const maxElevation = celestialBody === "sun" ? 30 : 60;
    if (targetElevation < 0 || targetElevation > maxElevation) continue;
    
    // 出没時間の間で 15 分刻みで天体位置をチェック
    const timeStep = 15 * 60 * 1000; // 15 分（ミリ秒）
    let bestTime: Date | null = null;
    let bestElevationDiff = Infinity;

    for (let time = riseTime.getTime(); time <= setTime.getTime(); time += timeStep) {
      const checkTime = new Date(time);
      
      // スカイツリーの位置での天体位置を計算
      const observer = new Astronomy.Observer(
        SKYTREE_COORDINATES.latitude,
        SKYTREE_COORDINATES.longitude,
        0
      );
      
      const equatorial = Astronomy.Equator(body, checkTime, observer, true, true);
      const horizontal = Astronomy.Horizon(
        checkTime,
        observer,
        equatorial.ra,
        equatorial.dec,
        "normal"
      );

      // 指定高度に近い時間を探す
      const elevationDiff = Math.abs(horizontal.altitude - targetElevation);
      if (elevationDiff < bestElevationDiff) {
        bestElevationDiff = elevationDiff;
        bestTime = checkTime;
      }
    }

    // 最適な時間が見つかった場合、その時点での地点を計算
    if (bestTime && bestElevationDiff < 2.0) { // 2 度以内の誤差で許容
      const observer = new Astronomy.Observer(
        SKYTREE_COORDINATES.latitude,
        SKYTREE_COORDINATES.longitude,
        0
      );
      
      const equatorial = Astronomy.Equator(body, bestTime, observer, true, true);
      const horizontal = Astronomy.Horizon(
        bestTime,
        observer,
        equatorial.ra,
        equatorial.dec,
        "normal"
      );

      const celestialAzimuth = horizontal.azimuth;
      
      // スカイツリーの天辺が指定高度に見える距離を計算
      const elevationRad = (targetElevation * Math.PI) / 180;
      const tanElevation = Math.tan(elevationRad);
      
      // 不正な elevation 値をチェック（0 度は除外、0.1 度以上のみ処理）
      if (!isFinite(targetElevation) || isNaN(targetElevation) || targetElevation < 0.1 || tanElevation <= 0) {
        logger.debug("低すぎる elevation 値をスキップ", {
          targetElevation,
          elevationRad,
          tanElevation,
          celestialBody: celestialBody === "sun" ? "太陽" : "月",
          time: bestTime.toISOString()
        });
        continue; // この elevation をスキップ
      }
      
      const distanceMeters = SKYTREE_HEIGHT / tanElevation;
      const distanceKm = distanceMeters / 1000;
      
      if (distanceKm <= 500 && distanceKm >= 0.1) {
        // 天体の方位角の逆方向に、計算した距離だけ離れた地点を求める
        const oppositeAzimuth = (celestialAzimuth + 180) % 360;
        const point = calculatePointAtDistance(
          SKYTREE_COORDINATES.latitude,
          SKYTREE_COORDINATES.longitude,
          oppositeAzimuth,
          distanceKm
        );

        results.push({
          elevation: targetElevation,
          latitude: point.latitude,
          longitude: point.longitude,
          distance: distanceKm,
          azimuth: oppositeAzimuth,
          time: bestTime // 実際の天体位置計算で得られた時刻
        });
        
        // 昇る/沈むの判定
        try {
          let isRising: boolean;
          
          if (celestialBody === "sun") {
            // 太陽の場合：時刻で判定（より確実）
            // 日の出から南中まで（正午頃）→ 昇る
            // 南中から日の入りまで → 沈む
            const totalDuration = setTime.getTime() - riseTime.getTime();
            const elapsedTime = bestTime.getTime() - riseTime.getTime();
            isRising = elapsedTime < totalDuration / 2;
          } else {
            // 月の場合：より複雑なので、時間範囲での判定を使用
            const totalDuration = setTime.getTime() - riseTime.getTime();
            const elapsedTime = bestTime.getTime() - riseTime.getTime();
            isRising = elapsedTime < totalDuration / 2;
          }
          
          const eventPhase = celestialBody === "sun" 
            ? (isRising ? "sunrise" : "sunset")
            : (isRising ? "moonrise" : "moonset");
          
          logger.debug("高度一致地点発見", {
            celestialBody: celestialBody === "sun" ? "太陽" : "月",
            phase: eventPhase,
            isRising,
            elevation: targetElevation,
            time: bestTime.toISOString(),
            distance: distanceKm,
            celestialAzimuth,
            celestialAltitude: horizontal.altitude,
            elevationDiff: bestElevationDiff,
            riseTime: riseTime.toISOString(),
            setTime: setTime.toISOString(),
            transitTime: "N/A" // AstroTime の変換は複雑なのでスキップ
          });
        } catch (error) {
          logger.warn("南中時刻取得失敗、フォールバック判定使用", error);
          
          // フォールバック：時間範囲での位置判定
          const totalDuration = setTime.getTime() - riseTime.getTime();
          const elapsedTime = bestTime.getTime() - riseTime.getTime();
          const isRising = elapsedTime < totalDuration / 2;
          const fallbackPhase = celestialBody === "sun" 
            ? (isRising ? "sunrise" : "sunset")
            : (isRising ? "moonrise" : "moonset");
          
          logger.debug("高度一致地点発見（フォールバック）", {
            celestialBody: celestialBody === "sun" ? "太陽" : "月",
            phase: fallbackPhase,
            isRising,
            elevation: targetElevation,
            time: bestTime.toISOString(),
            distance: distanceKm,
            celestialAzimuth,
            celestialAltitude: horizontal.altitude,
            elevationDiff: bestElevationDiff
          });
        }
      }
    }
  }

  return results;
}

/**
 * 指定した方位角と距離の地点を計算
 */
function calculatePointAtDistance(
  lat: number,
  lng: number,
  bearing: number,
  distance: number // km
): { latitude: number; longitude: number } {
  const R = 6371; // 地球の半径（km）
  const bearingRad = (bearing * Math.PI) / 180;
  const latRad = (lat * Math.PI) / 180;
  const lngRad = (lng * Math.PI) / 180;

  const newLatRad = Math.asin(
    Math.sin(latRad) * Math.cos(distance / R) +
      Math.cos(latRad) * Math.sin(distance / R) * Math.cos(bearingRad)
  );

  const newLngRad =
    lngRad +
    Math.atan2(
      Math.sin(bearingRad) * Math.sin(distance / R) * Math.cos(latRad),
      Math.cos(distance / R) - Math.sin(latRad) * Math.sin(newLatRad)
    );

  return {
    latitude: (newLatRad * 180) / Math.PI,
    longitude: (newLngRad * 180) / Math.PI
  };
}