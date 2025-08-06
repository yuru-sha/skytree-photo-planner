import { SkytreeEvent, CalendarStats, Location } from "@skytree-photo-planner/types";
import { getComponentLogger, timeUtils } from "@skytree-photo-planner/utils";
import { CalendarService } from "./interfaces/CalendarService";
import { CalendarRepository } from "../repositories/interfaces/CalendarRepository";
import { SkytreeAstronomicalCalculator } from "./SkytreeAstronomicalCalculator";
import { LocationRepository } from "../repositories/interfaces/LocationRepository";
import { CoordinateCalculator } from "./astronomical/CoordinateCalculator";

const logger = getComponentLogger("calendar-service");

export class CalendarServiceImpl implements CalendarService {
  private coordinateCalc = new CoordinateCalculator();

  constructor(
    private calendarRepository: CalendarRepository,
    private astronomicalCalculator: SkytreeAstronomicalCalculator,
    private locationRepository: LocationRepository
  ) {}

  async getMonthlyCalendar(
    year: number,
    month: number,
  ): Promise<{
    year: number;
    month: number;
    events: Array<{
      date: string;
      type: string;
      events: SkytreeEvent[];
    }>;
  }> {
    const startTime = Date.now();

    try {
      logger.info("月間カレンダーデータ取得開始", { year, month });

      const events = await this.calendarRepository.getMonthlyEvents(
        year,
        month,
      );

      // カレンダーの日付範囲を動的に計算
      const monthStartDate = new Date(year, month - 1, 1);
      const monthEndDate = new Date(year, month, 0);

      // カレンダーの開始日（月初の週の日曜日）
      const calendarStartDate = new Date(monthStartDate);
      calendarStartDate.setDate(
        calendarStartDate.getDate() - calendarStartDate.getDay(),
      );

      // カレンダーの終了日（月末が含まれる週の土曜日）
      const calendarEndDate = new Date(monthEndDate);
      calendarEndDate.setDate(
        calendarEndDate.getDate() + (6 - calendarEndDate.getDay()),
      );

      // 日付ごとにイベントをグループ化
      const eventsByDate = new Map<string, SkytreeEvent[]>();
      events.forEach((event) => {
        const dateStr = timeUtils.formatDateString(new Date(event.time));
        if (!eventsByDate.has(dateStr)) {
          eventsByDate.set(dateStr, []);
        }
        eventsByDate.get(dateStr)!.push(event);
      });

      // 42 日分すべての日付に対してレスポンスを作成
      const responseEvents = [];
      const currentDate = new Date(calendarStartDate);

      while (currentDate <= calendarEndDate) {
        const dateStr = timeUtils.formatDateString(currentDate);
        const dayEvents = eventsByDate.get(dateStr) || [];

        responseEvents.push({
          date: dateStr,
          type:
            dayEvents.length > 0
              ? this.determineEventType(dayEvents)
              : "diamond",
          events: dayEvents.sort(
            (a, b) => new Date(a.time).getTime() - new Date(b.time).getTime(),
          ),
        });

        currentDate.setDate(currentDate.getDate() + 1);
      }

      const processingTime = Date.now() - startTime;
      logger.info("月間カレンダーデータ取得完了", {
        year,
        month,
        eventDays: responseEvents.length,
        totalEvents: events.length,
        processingTime,
      });

      return {
        year,
        month,
        events: responseEvents, // 既にソート済み（日付順）
      };
    } catch (error) {
      logger.error("月間カレンダーデータ取得エラー", { year, month, error });
      throw error;
    }
  }

  async getDayEvents(date: string): Promise<{ events: SkytreeEvent[] }> {
    try {
      
      logger.info("日別イベント取得開始（リアルタイム計算）", { date });
      
      // まずキャッシュされたイベントを確認
      let events = await this.calendarRepository.getDayEvents(date);
      
      
      
      logger.info("キャッシュチェック結果", { 
        date, 
        cachedEventCount: events.length,
        eventsType: typeof events,
        isArray: Array.isArray(events)
      });
      
      // キャッシュにデータがない場合はリアルタイム計算
      if (events.length === 0) {
        
        logger.info("キャッシュされたイベントが見つからない、リアルタイム計算実行", { date });
        
        const targetDate = new Date(date);
        
        
        // キャッシュにない場合: スカイツリー周辺の撮影可能場所を動的検索
        
        logger.info("キャッシュされたイベントがない、スカイツリー周辺を動的検索", { date });
        
        // スカイツリー周辺の候補地点を動的生成
        const locations = this.generateSkytreeSurroundingLocations();
        
        
        // 候補地点の詳細情報をデバッグ出力
        

        // ダイヤモンドスカイツリーとパールスカイツリーを計算
        
        
        
        const diamondSkytreeEvents = await this.astronomicalCalculator.calculateDiamondSkytree(targetDate, locations);
        
        
        
        const pearlSkytreeEvents = await this.astronomicalCalculator.calculatePearlSkytree(targetDate, locations);
        
        
        // 同じ地点のイベントをマージ
        events = this.mergeEventsByLocation([...diamondSkytreeEvents, ...pearlSkytreeEvents]);
        
        
        
        logger.info("リアルタイム計算完了", {
          date,
          diamondEventCount: diamondSkytreeEvents.length,
          pearlEventCount: pearlSkytreeEvents.length,
          totalEventCount: events.length,
        });
      } else {
        
        logger.info("キャッシュされたイベントを使用", {
          date,
          eventCount: events.length,
        });
      }
      
      // 時刻順でソート
      const sortedEvents = events.sort(
        (a, b) => new Date(a.time).getTime() - new Date(b.time).getTime(),
      );
      
      
      logger.info("日別イベント取得完了", {
        date,
        eventCount: sortedEvents.length,
      });
      
      return { events: sortedEvents };
    } catch (error) {
      
      logger.error("日別イベント取得エラー", { date, error });
      throw error;
    }
  }

  async getUpcomingEvents(limit: number = 50): Promise<SkytreeEvent[]> {
    try {
      logger.info("今後のイベント取得開始", { limit });

      const events = await this.calendarRepository.getUpcomingEvents(limit);

      logger.info("今後のイベント取得完了", {
        eventCount: events.length,
        limit,
      });

      return events;
    } catch (error) {
      logger.error("今後のイベント取得エラー", { limit, error });
      throw error;
    }
  }

  async getLocationYearlyEvents(
    locationId: number,
    year: number,
  ): Promise<SkytreeEvent[]> {
    try {
      logger.info("地点別年間イベント取得開始", { locationId, year });

      const events = await this.calendarRepository.getLocationYearlyEvents(
        locationId,
        year,
      );

      logger.info("地点別年間イベント取得完了", {
        locationId,
        year,
        eventCount: events.length,
      });

      return events;
    } catch (error) {
      logger.error("地点別年間イベント取得エラー", { locationId, year, error });
      throw error;
    }
  }

  async getCalendarStats(year: number): Promise<CalendarStats> {
    try {
      logger.info("カレンダー統計情報取得開始", { year });

      const stats = await this.calendarRepository.getCalendarStats(year);

      logger.info("カレンダー統計情報取得完了", {
        year,
        stats: {
          totalEvents: stats.totalEvents,
          diamondEvents: stats.diamondEvents,
          pearlEvents: stats.pearlEvents,
          activeLocations: stats.activeLocations,
        },
      });

      return stats;
    } catch (error) {
      logger.error("カレンダー統計情報取得エラー", { year, error });
      throw error;
    }
  }


  private determineEventType(events: SkytreeEvent[]): string {
    const hasDepth = events.some((event) => event.type === "diamond");
    const hasPearl = events.some((event) => event.type === "pearl");

    if (hasDepth && hasPearl) {
      return "mixed";
    } else if (hasDepth) {
      return "diamond";
    } else if (hasPearl) {
      return "pearl";
    }

    return "unknown";
  }

  /**
   * スカイツリー周辺の候補撮影地点を動的生成
   * 天体位置（太陽・月）から撮影地点を逆算して生成
   */
  private generateSkytreeSurroundingLocations(): Location[] {
    // スカイツリーの座標
    const SKYTREE_LAT = 35.7100627;
    const SKYTREE_LON = 139.8107004;
    const SKYTREE_HEIGHT = 634; // m
    const OBSERVER_HEIGHT = 5; // m
    
    // 天体位置から撮影地点を逆算するため、現在時刻の太陽・月位置をサンプル計算
    const now = new Date();
    
    const candidates: Array<{
      name: string;
      lat: number;
      lon: number;
      targetElevation: number;
      eventType: "diamond" | "pearl";
      prefecture: string;
    }> = [];
    
    // サンプル計算用の時刻範囲（現在時刻から24時間）
    const startTime = new Date(now);
    startTime.setHours(0, 0, 0, 0);
    const endTime = new Date(now);
    endTime.setHours(23, 59, 59, 999);
    
    // 1時間間隔で天体位置をサンプリング
    for (let time = new Date(startTime); time <= endTime; time.setHours(time.getHours() + 1)) {
      // 太陽位置から撮影地点を計算
      try {
        const sunPosition = this.astronomicalCalculator.getSunPosition(
          time, 
          SKYTREE_LAT, 
          SKYTREE_LON
        );
        
        if (sunPosition && sunPosition.elevation > 0) {
          const shootingLocation = this.calculateShootingLocationFromCelestialPosition(
            SKYTREE_LAT, SKYTREE_LON, SKYTREE_HEIGHT,
            sunPosition.azimuth, sunPosition.elevation, OBSERVER_HEIGHT
          );
          
          if (shootingLocation) {
            candidates.push({
              name: `太陽地点（${time.getHours()}時・仰角${sunPosition.elevation.toFixed(0)}°）`,
              lat: shootingLocation.lat,
              lon: shootingLocation.lon,
              targetElevation: sunPosition.elevation,
              eventType: "diamond",
              prefecture: "東京都"
            });
          }
        }
      } catch (error) {
        // 太陽位置計算エラーは無視
        logger.debug("太陽位置計算エラー", { time: time.toISOString(), error });
      }
      
      // 月位置から撮影地点を計算
      try {
        const moonPosition = this.astronomicalCalculator.getMoonPosition(
          time, 
          SKYTREE_LAT, 
          SKYTREE_LON
        );
        
        if (moonPosition && moonPosition.elevation > 0) {
          const shootingLocation = this.calculateShootingLocationFromCelestialPosition(
            SKYTREE_LAT, SKYTREE_LON, SKYTREE_HEIGHT,
            moonPosition.azimuth, moonPosition.elevation, OBSERVER_HEIGHT
          );
          
          if (shootingLocation) {
            candidates.push({
              name: `月地点（${time.getHours()}時・仰角${moonPosition.elevation.toFixed(0)}°）`,
              lat: shootingLocation.lat,
              lon: shootingLocation.lon,
              targetElevation: moonPosition.elevation,
              eventType: "pearl",
              prefecture: "東京都"
            });
          }
        }
      } catch (error) {
        // 月位置計算エラーは無視
        logger.debug("月位置計算エラー", { time: time.toISOString(), error });
      }
    }
    
    logger.debug("天体位置ベース地点生成統計", {
      totalCandidates: candidates.length,
      sunCandidates: candidates.filter(c => c.eventType === "diamond").length,
      moonCandidates: candidates.filter(c => c.eventType === "pearl").length,
      timeRange: `${startTime.toISOString()} - ${endTime.toISOString()}`
    });

    return candidates.map((candidate, index) => {
      // スカイツリーまでの距離、方位角、仰角を計算
      const distance = this.calculateDistance(candidate.lat, candidate.lon, SKYTREE_LAT, SKYTREE_LON);
      const azimuthToSkytree = this.calculateAzimuthToSkytree(candidate.lat, candidate.lon, SKYTREE_LAT, SKYTREE_LON);
      const elevationToSkytree = this.calculateElevationToSkytree(distance, OBSERVER_HEIGHT, SKYTREE_HEIGHT);
      
      logger.debug("天体ベース地点生成", {
        name: candidate.name,
        eventType: candidate.eventType,
        coordinates: `${candidate.lat.toFixed(6)}, ${candidate.lon.toFixed(6)}`,
        distance: `${(distance / 1000).toFixed(1)}km`,
        azimuthToSkytree: `${azimuthToSkytree.toFixed(1)}°`,
        elevationToSkytree: `${elevationToSkytree.toFixed(1)}°`,
        targetElevation: `${candidate.targetElevation.toFixed(1)}°`
      });
      
      return {
        id: -(index + 1), // 負の値で動的生成地点を識別
        name: candidate.name,
        prefecture: candidate.prefecture,
        accessInfo: null,
        latitude: candidate.lat,
        longitude: candidate.lon,
        elevation: OBSERVER_HEIGHT,
        distanceToSkytree: distance,
        azimuthToSkytree: azimuthToSkytree,
        elevationToSkytree: elevationToSkytree,
        description: `スカイツリーから${(distance / 1000).toFixed(1)}kmの天体位置ベース撮影候補地点（${candidate.eventType === "diamond" ? "太陽" : "月"}・目標仰角${candidate.targetElevation.toFixed(1)}°）`,
        measurementNotes: null,
        parkingInfo: null,
        status: 'active' as const,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
    });
  }

  /**
   * 天体位置（方位角・仰角）から撮影地点を逆算
   */
  private calculateShootingLocationFromCelestialPosition(
    skytreeLat: number,
    skytreeLon: number, 
    skytreeHeight: number,
    celestialAzimuth: number,
    celestialElevation: number,
    observerHeight: number
  ): { lat: number; lon: number } | null {
    try {
      // スカイツリーの高さから観測者の高さを引いた高度差
      const heightDiff = skytreeHeight - observerHeight;
      
      // 天体の仰角から撮影地点とスカイツリー間の水平距離を計算
      const elevationRad = celestialElevation * Math.PI / 180;
      const horizontalDistance = heightDiff / Math.tan(elevationRad);
      
      // 天体の方位角から撮影地点の方向を計算（天体と逆方向）
      const shootingAzimuth = (celestialAzimuth + 180) % 360;
      const azimuthRad = shootingAzimuth * Math.PI / 180;
      
      // 撮影地点の座標を計算
      const deltaLat = (horizontalDistance * Math.cos(azimuthRad)) / 111000; // 1度≈111km
      const deltaLon = (horizontalDistance * Math.sin(azimuthRad)) / (111000 * Math.cos(skytreeLat * Math.PI / 180));
      
      const shootingLat = skytreeLat + deltaLat;
      const shootingLon = skytreeLon + deltaLon;
      
      // 現実的な範囲チェック（100km以内）
      if (horizontalDistance <= 100000) {
        return {
          lat: shootingLat,
          lon: shootingLon
        };
      }
      
      return null;
    } catch (error) {
      return null;
    }
  }

  /**
   * 方位角を計算（度単位）
   */
  private calculateAzimuthToSkytree(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const dLon = (lon2 - lon1) * Math.PI / 180; // 経度差の計算を修正
    const lat1Rad = lat1 * Math.PI / 180;
    const lat2Rad = lat2 * Math.PI / 180;
    
    const y = Math.sin(dLon) * Math.cos(lat2Rad);
    const x = Math.cos(lat1Rad) * Math.sin(lat2Rad) - Math.sin(lat1Rad) * Math.cos(lat2Rad) * Math.cos(dLon);
    
    const bearing = Math.atan2(y, x) * 180 / Math.PI;
    return (bearing + 360) % 360; // 0-360度に正規化
  }

  /**
   * 2 点間の距離を計算（メートル単位）
   */
  private calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371000; // 地球の半径（メートル）
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  }

  /**
   * スカイツリーへの仰角を計算（度単位）
   */
  private calculateElevationToSkytree(distance: number, observerHeight: number, skytreeHeight: number): number {
    const heightDiff = skytreeHeight - observerHeight;
    const elevationRadians = Math.atan2(heightDiff, distance);
    return elevationRadians * 180 / Math.PI;
  }

  /**
   * 同じ地点のイベントをマージ（ダイヤモンドとパールを同じ地点にまとめる）
   */
  private mergeEventsByLocation(events: SkytreeEvent[]): SkytreeEvent[] {
    const locationMap = new Map<string, SkytreeEvent[]>();
    
    // 地点ごとにイベントをグループ化
    for (const event of events) {
      const locationKey = `${event.location.latitude.toFixed(6)},${event.location.longitude.toFixed(6)}`;
      
      if (!locationMap.has(locationKey)) {
        locationMap.set(locationKey, []);
      }
      locationMap.get(locationKey)!.push(event);
    }
    
    const mergedEvents: SkytreeEvent[] = [];
    
    // 各地点のイベントを処理
    for (const [locationKey, locationEvents] of locationMap.entries()) {
      if (locationEvents.length === 1) {
        // 単一イベントの場合はそのまま追加
        mergedEvents.push(locationEvents[0]);
      } else {
        // 複数イベント（ダイヤモンド + パール）の場合
        const diamondEvents = locationEvents.filter(e => e.type === 'diamond');
        const pearlEvents = locationEvents.filter(e => e.type === 'pearl');
        
        logger.debug("同じ地点で複数イベント発見", {
          locationKey,
          locationName: locationEvents[0].location.name,
          diamondCount: diamondEvents.length,
          pearlCount: pearlEvents.length,
          totalEvents: locationEvents.length
        });
        
        // 各タイプ × subTypeの組み合わせで最も精度の良いイベントを選択
        const eventGroups = new Map<string, SkytreeEvent[]>();
        
        for (const event of locationEvents) {
          const groupKey = `${event.type}-${event.subType}`;
          if (!eventGroups.has(groupKey)) {
            eventGroups.set(groupKey, []);
          }
          eventGroups.get(groupKey)!.push(event);
        }
        
        // 各グループで最も精度の良いイベントを選択
        for (const groupEvents of eventGroups.values()) {
          const bestEvent = groupEvents.reduce((best, current) => 
            current.qualityScore > best.qualityScore ? current : best
          );
          mergedEvents.push(bestEvent);
        }
      }
    }
    
    logger.debug("イベントマージ完了", {
      originalEvents: events.length,
      mergedEvents: mergedEvents.length,
      uniqueLocations: locationMap.size
    });
    
    return mergedEvents;
  }

}
