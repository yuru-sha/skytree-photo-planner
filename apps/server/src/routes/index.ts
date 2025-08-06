import { Express, Request, Response } from "express";
import { AuthenticatedRequest } from "../middleware/auth";
import path from "path";
import { getComponentLogger } from "@skytree-photo-planner/utils";
import LocationController from "../controllers/LocationController";
import { CalendarController } from "../controllers/CalendarController";
import { AuthController } from "../controllers/AuthController";
import { BackgroundJobController } from "../controllers/BackgroundJobController";
import {
  authenticateAdmin,
  authRateLimit,
  adminApiRateLimit,
} from "../middleware/auth";
import { DIContainer } from "../di/DIContainer";
import { createSystemSettingsRouter } from "./systemSettings";
import { QueueService } from "../services/interfaces/QueueService";
import { LocationRepository } from "../repositories/interfaces/LocationRepository";
import { SkytreeEvent } from "@skytree-photo-planner/types";
import { SkytreeAlignmentCalculator } from "../services/astronomical/SkytreeAlignmentCalculator";

const serverLogger = getComponentLogger("server");

export function setupRoutes(app: Express, container: DIContainer): void {
  // コントローラーのインスタンス化（DI コンテナから取得）
  const locationController = container.resolve(
    "LocationController",
  ) as LocationController;
  const calendarController = container.resolve(
    "CalendarController",
  ) as CalendarController;
  const authController = container.resolve(
    "AuthController",
  ) as AuthController;
  const backgroundJobController = new BackgroundJobController(container);

  // ヘルスチェック
  app.get("/api/health", (req: Request, res: Response) => {
    res.json({
      status: "ok",
      timestamp: new Date().toISOString(),
      version: "0.2.0",
    });
  });

  // キュー統計情報
  app.get("/api/queue/stats", async (req: Request, res: Response) => {
    try {
      const queueService = container.resolve("QueueService") as QueueService;
      const stats = await queueService.getQueueStats();
      res.json(stats);
    } catch (error) {
      serverLogger.error("キュー統計取得エラー", error);
      res.status(500).json({ error: "Failed to get queue stats" });
    }
  });

  // 管理者向けキュー管理 API
  app.get(
    "/api/admin/queue/stats",
    authenticateAdmin,
    async (req: Request, res: Response) => {
      try {
        const queueService = container.resolve("QueueService") as QueueService;
        const stats = await queueService.getQueueStats();
        res.json(stats);
      } catch (error) {
        serverLogger.error("管理者キュー統計取得エラー", error);
        res.status(500).json({ error: "Failed to get queue stats" });
      }
    },
  );

  // 同時実行数の取得
  app.get(
    "/api/admin/queue/concurrency",
    authenticateAdmin,
    async (req: Request, res: Response) => {
      try {
        const queueService = container.resolve("QueueService") as QueueService;
        const currentConcurrency = queueService.getCurrentConcurrency();

        res.json({
          success: true,
          data: {
            concurrency: currentConcurrency,
            maxConcurrency: 10,
            minConcurrency: 1,
          },
        });
      } catch (error) {
        serverLogger.error("同時実行数取得エラー", error);
        res.status(500).json({ error: "Failed to get concurrency" });
      }
    },
  );

  // 同時実行数のリアルタイム変更
  app.put(
    "/api/admin/queue/concurrency",
    authenticateAdmin,
    adminApiRateLimit,
    async (req: Request, res: Response) => {
      try {
        const queueService = container.resolve("QueueService") as QueueService;
        const { concurrency } = req.body;

        if (!concurrency || typeof concurrency !== "number") {
          return res.status(400).json({
            success: false,
            message: "同時実行数は数値で指定してください",
          });
        }

        if (concurrency < 1 || concurrency > 10) {
          return res.status(400).json({
            success: false,
            message: "同時実行数は 1-10 の範囲で指定してください",
          });
        }

        const oldConcurrency = queueService.getCurrentConcurrency();
        const success = await queueService.updateConcurrency(concurrency);

        if (success) {
          serverLogger.info("同時実行数変更成功", {
            oldConcurrency,
            newConcurrency: concurrency,
            requestedBy: (req as AuthenticatedRequest).admin?.username,
          });

          res.json({
            success: true,
            message: "同時実行数を変更しました",
            data: {
              oldConcurrency,
              newConcurrency: concurrency,
            },
          });
        } else {
          res.status(500).json({
            success: false,
            message: "同時実行数の変更に失敗しました",
          });
        }
      } catch (error) {
        serverLogger.error("同時実行数変更エラー", error);
        res.status(500).json({ error: "Failed to update concurrency" });
      }
    },
  );

  // バックグラウンドジョブ管理 API
  app.get(
    "/api/admin/background-jobs",
    authenticateAdmin,
    backgroundJobController.getBackgroundJobs.bind(backgroundJobController),
  );
  app.post(
    "/api/admin/background-jobs/:jobId/toggle",
    authenticateAdmin,
    adminApiRateLimit,
    backgroundJobController.toggleBackgroundJob.bind(backgroundJobController),
  );
  app.post(
    "/api/admin/background-jobs/:jobId/trigger",
    authenticateAdmin,
    adminApiRateLimit,
    backgroundJobController.triggerBackgroundJob.bind(backgroundJobController),
  );

  // 失敗したジョブをクリア
  app.post(
    "/api/admin/queue/clear-failed",
    authenticateAdmin,
    adminApiRateLimit,
    async (req: Request, res: Response) => {
      try {
        const queueService = container.resolve("QueueService") as QueueService;
        const { olderThanDays = 0 } = req.body; // デフォルト 0 で全ての失敗ジョブをクリア

        const cleanedCount = await queueService.cleanFailedJobs();

        serverLogger.info("管理者による失敗ジョブクリア", {
          cleanedCount,
          olderThanDays,
          requestedBy: (req as AuthenticatedRequest).admin?.username,
        });

        res.json({
          success: true,
          message: `${cleanedCount} 個の失敗したジョブをクリアしました`,
          cleanedCount,
        });
      } catch (error) {
        serverLogger.error("失敗ジョブクリアエラー", error);
        res.status(500).json({ error: "Failed to clean failed jobs" });
      }
    },
  );

  // 地点の再計算ジョブを手動で追加
  app.post(
    "/api/admin/queue/recalculate-location",
    authenticateAdmin,
    adminApiRateLimit,
    async (req: Request, res: Response) => {
      try {
        const queueService = container.resolve("QueueService") as QueueService;
        const { locationId, startYear, endYear, priority = "high" } = req.body;

        if (!locationId || !startYear || !endYear) {
          return res
            .status(400)
            .json({ error: "locationId, startYear, endYear are required" });
        }

        const jobId = await queueService.scheduleLocationCalculation(
          locationId,
          startYear,
          endYear,
          priority,
        );

        serverLogger.info("管理者による地点再計算ジョブ追加", {
          locationId,
          startYear,
          endYear,
          priority,
          jobId,
          requestedBy: (req as AuthenticatedRequest).admin?.username,
        });

        res.json({
          success: true,
          message: `地点${locationId}の${startYear}-${endYear}年の再計算ジョブを追加しました`,
          jobId,
        });
      } catch (error) {
        serverLogger.error("地点再計算ジョブ追加エラー", error);
        res
          .status(500)
          .json({ error: "Failed to schedule location calculation" });
      }
    },
  );

  // 撮影地点 API
  app.get(
    "/api/locations",
    locationController.getLocations.bind(locationController),
  );
  app.get(
    "/api/locations/:id",
    locationController.getLocation.bind(locationController),
  );
  app.post(
    "/api/locations",
    locationController.createLocation.bind(locationController),
  );
  app.put(
    "/api/locations/:id",
    locationController.updateLocation.bind(locationController),
  );
  app.delete(
    "/api/locations/:id",
    locationController.deleteLocation.bind(locationController),
  );

  // イベント API
  app.get(
    "/api/calendar/:year/:month",
    calendarController.getMonthlyCalendar.bind(calendarController),
  );
  app.get(
    "/api/events/:date",
    calendarController.getDayEvents.bind(calendarController),
  );
  app.get(
    "/api/events/upcoming",
    calendarController.getUpcomingEvents.bind(calendarController),
  );
  app.get(
    "/api/calendar/location/:locationId/:year",
    calendarController.getLocationYearlyEvents.bind(calendarController),
  );
  app.get(
    "/api/calendar/stats/:year",
    calendarController.getCalendarStats.bind(calendarController),
  );

  // 地図検索 API
  app.post(
    "/api/map-search",
    async (req: Request, res: Response) => {
      try {
        const {
          latitude,
          longitude,
          elevation = 0,
          scene = "all",
          searchMode = "auto",
          startDate,
          endDate,
        } = req.body;

        // バリデーション
        if (!latitude || !longitude || !startDate || !endDate) {
          return res.status(400).json({
            success: false,
            message: "緯度、経度、開始日、終了日は必須です",
          });
        }

        // 日付範囲チェック（検索モードに応じた制限）
        const start = new Date(startDate);
        const end = new Date(endDate);
        const daysDiff = (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24);
        
        // 最大範囲制限（全モード共通: 3 年）
        if (daysDiff > 1095) { // 3 年 = 365 * 3
          return res.status(400).json({
            success: false,
            message: "検索範囲は最大 3 年以内で指定してください",
          });
        }

        // 高精度モードの場合は 3 ヶ月制限
        if (searchMode === "precise" && daysDiff > 90) {
          return res.status(400).json({
            success: false,
            message: "高精度モードの検索範囲は最大 3 ヶ月以内で指定してください",
          });
        }

        // 長期間検索の場合は警告ログ
        if (daysDiff > 365) {
          serverLogger.warn("長期間検索実行", {
            daysDiff,
            searchMode,
            latitude,
            longitude,
            estimatedProcessingTime: `約${Math.ceil(daysDiff / 7)}分`
          });
        }

        // 一時的な仮想地点を作成
        const virtualLocation = {
          id: -999999, // 一意な負の値
          name: "地図検索地点",
          prefecture: "検索地点",
          latitude: parseFloat(latitude),
          longitude: parseFloat(longitude),
          elevation: parseFloat(elevation) || 0,
          distanceToSkytree: null,
          azimuthToSkytree: null,
          elevationToSkytree: null,
          description: "地図検索による一時地点",
          accessInfo: null,
          parkingInfo: null,
          measurementNotes: null,
          status: "active" as const,
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        // スカイツリー計算サービスを取得
        const skytreeAlignmentCalculator = container.resolve("SkytreeAlignmentCalculator") as SkytreeAlignmentCalculator;
        
        const events = [];
        const currentDate = new Date(start);
        const endDateTime = new Date(end);

        // 検索モードに応じた精度設定（検索間隔は全て 1 日単位で統一）
        const searchInterval = 1; // 全モード共通で日単位検索
        let precisionSettings: { searchInterval: number; toleranceLevel: "high" | "medium" | "low" };
        
        switch (searchMode) {
          case "fast":
            precisionSettings = {
              searchInterval: 300, // 5 分間隔（低精度・高速）
              toleranceLevel: "low"
            };
            break;
          case "balanced":
            precisionSettings = {
              searchInterval: 60, // 1 分間隔（中精度・中速）
              toleranceLevel: "medium"
            };
            break;
          case "precise":
            precisionSettings = {
              searchInterval: 10, // 10 秒間隔（高精度・低速）
              toleranceLevel: "high"
            };
            break;
          case "auto":
            // 期間に応じて自動選択（精度のみ調整、検索間隔は 1 日固定）
            if (daysDiff > 730) { // 2 年以上
              precisionSettings = { searchInterval: 300, toleranceLevel: "low" };
            } else if (daysDiff > 180) { // 6 ヶ月以上
              precisionSettings = { searchInterval: 120, toleranceLevel: "medium" };
            } else {
              precisionSettings = { searchInterval: 30, toleranceLevel: "high" };
            }
            break;
          default:
            precisionSettings = { searchInterval: 60, toleranceLevel: "medium" };
        }

        // 日付ループで検索実行
        while (currentDate <= endDateTime) {
          try {
            // 撮影シーンに応じてイベント検索
            if (scene === "all" || scene === "diamond") {
              const diamondEvents = await skytreeAlignmentCalculator.findDiamondSkytree(
                new Date(currentDate),
                virtualLocation,
                precisionSettings
              );
              events.push(...diamondEvents);
            }

            if (scene === "all" || scene === "pearl") {
              const pearlEvents = await skytreeAlignmentCalculator.findPearlSkytree(
                new Date(currentDate),
                virtualLocation,
                precisionSettings
              );
              events.push(...pearlEvents);
            }
          } catch (error) {
            serverLogger.warn("地図検索での日付処理エラー", {
              error: error as Error,
              date: currentDate.toISOString(),
              latitude,
              longitude,
            });
          }

          // 次の日付へ
          currentDate.setDate(currentDate.getDate() + searchInterval);
        }

        // 高度レンジ × 昇る/沈む × イベントタイプでグループ化して、各グループで最も精度の良いものを選択
        const filteredEvents = filterEventsByElevationRange(events);

        // 結果をソート（時間順）
        const sortedEvents = filteredEvents.sort((a, b) => 
          new Date(a.time).getTime() - new Date(b.time).getTime()
        );

        // 最大 100 件に制限
        const limitedEvents = sortedEvents.slice(0, 100);

        serverLogger.info("地図検索完了", {
          latitude,
          longitude,
          elevation,
          scene,
          searchMode,
          searchInterval,
          dateRange: `${start.toISOString()} - ${end.toISOString()}`,
          totalEvents: limitedEvents.length,
        });

        res.json({
          success: true,
          events: limitedEvents,
          searchParams: {
            latitude: parseFloat(latitude),
            longitude: parseFloat(longitude),
            elevation: parseFloat(elevation) || 0,
            scene,
            searchMode,
            startDate: start.toISOString(),
            endDate: end.toISOString(),
          },
          metadata: {
            totalEvents: limitedEvents.length,
            searchInterval,
            isLimited: sortedEvents.length > 100,
            originalTotal: sortedEvents.length,
          },
        });
      } catch (error) {
        serverLogger.error("地図検索 API エラー", error as Error);
        res.status(500).json({
          success: false,
          message: "地図検索中にエラーが発生しました",
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }
  );

  // 認証 API
  app.post(
    "/api/auth/login",
    authRateLimit,
    authController.login.bind(authController),
  );
  app.post(
    "/api/auth/logout",
    authRateLimit,
    authController.logout.bind(authController),
  );
  app.get(
    "/api/auth/verify",
    authRateLimit,
    authController.verifyToken.bind(authController),
  );
  app.post(
    "/api/auth/change-password",
    authRateLimit,
    authenticateAdmin,
    authController.changePassword.bind(authController),
  );

  // 管理者向け一括再計算（キューベース処理）
  app.post(
    "/api/admin/regenerate-all",
    authenticateAdmin,
    adminApiRateLimit,
    async (req: Request, res: Response) => {
      try {
        const queueService = container.resolve("QueueService") as QueueService;
        const locationRepository = container.resolve(
          "LocationRepository",
        ) as LocationRepository;
        const { years } = req.body;

        // デフォルトで 2024-2026 年を対象
        const targetYears = years || [2024, 2025, 2026];

        serverLogger.info("キューベース一括再計算開始", {
          targetYears,
          requestedBy: (req as AuthenticatedRequest).admin?.username,
        });

        // 全地点を取得
        const locations = await locationRepository.findAll();

        // 各地点・各年をキューに登録（並列実行）
        const jobPromises = [];
        for (const location of locations) {
          for (const year of targetYears) {
            jobPromises.push(
              queueService.scheduleLocationCalculation(
                location.id,
                year,
                year,
                "high", // 管理者による一括処理は高優先度
              )
            );
          }
        }

        // 並列でジョブを登録
        const jobIds = await Promise.all(jobPromises);
        const totalJobsScheduled = jobIds.filter(id => id !== null).length;

        serverLogger.info("キューベース一括再計算ジョブ登録完了", {
          targetYears,
          totalLocations: locations.length,
          totalJobsScheduled,
          estimatedProcessingTime: `約${Math.ceil(totalJobsScheduled / 5)}分`,
        });

        res.json({
          success: true,
          message: `全${locations.length}地点・${targetYears.length}年分の計算ジョブをキューに登録しました`,
          totalLocations: locations.length,
          totalJobsScheduled,
          targetYears,
          jobIds: jobIds.slice(0, 10), // 最初の 10 件のみ表示
          estimatedProcessingTime: `約${Math.ceil(totalJobsScheduled / 5)}分`,
        });
      } catch (error) {
        serverLogger.error("キューベース一括再計算エラー", error);
        res.status(500).json({
          error: "キューベース一括再計算中にエラーが発生しました",
          message: error instanceof Error ? error.message : "Unknown error",
        });
      }
    },
  );

  // 初期セットアップ用（本番環境では無効化推奨）
  if (process.env.NODE_ENV === "development") {
    // Admin creation endpoint disabled in development
  }

  // 管理者用 API（認証必須）
  app.get(
    "/api/admin/locations",
    authenticateAdmin,
    locationController.getLocations.bind(locationController),
  );
  app.get(
    "/api/admin/locations/:id",
    authenticateAdmin,
    locationController.getLocation.bind(locationController),
  );
  app.post(
    "/api/admin/locations",
    adminApiRateLimit,
    authenticateAdmin,
    locationController.createLocation.bind(locationController),
  );
  app.put(
    "/api/admin/locations/:id",
    adminApiRateLimit,
    authenticateAdmin,
    locationController.updateLocation.bind(locationController),
  );
  app.delete(
    "/api/admin/locations/:id",
    adminApiRateLimit,
    authenticateAdmin,
    locationController.deleteLocation.bind(locationController),
  );
  // Export/Import 機能
  app.get(
    "/api/admin/locations/export",
    adminApiRateLimit,
    authenticateAdmin,
    locationController.exportLocations.bind(locationController),
  );
  app.post(
    "/api/admin/locations/import",
    adminApiRateLimit,
    authenticateAdmin,
    locationController.importLocations.bind(locationController),
  );

  // システム設定管理 API
  app.use(
    "/api/admin/system-settings",
    adminApiRateLimit,
    createSystemSettingsRouter(container),
  );

  // パフォーマンス設定 API
  app.get(
    "/api/admin/performance-settings",
    authenticateAdmin,
    async (req: Request, res: Response) => {
      try {
        const queueService = container.resolve("QueueService") as QueueService;
        const currentConcurrency = queueService.getCurrentConcurrency();

        res.json({
          success: true,
          settings: {
            concurrency: currentConcurrency,
            maxConcurrency: 10,
            minConcurrency: 1,
            cacheEnabled: true,
            batchSize: 100,
          },
        });
      } catch (error) {
        serverLogger.error("パフォーマンス設定取得エラー", error);
        res.status(500).json({ error: "Failed to get performance settings" });
      }
    },
  );

  // キュー統計 API
  app.get(
    "/api/admin/queue-stats",
    authenticateAdmin,
    async (req: Request, res: Response) => {
      try {
        const queueService = container.resolve("QueueService") as QueueService;
        const stats = await queueService.getQueueStats();
        res.json(stats);
      } catch (error) {
        serverLogger.error("キュー統計取得エラー", error);
        res.status(500).json({ error: "Failed to get queue stats" });
      }
    },
  );

  // SPA 用のフォールバック（本番環境）
  if (process.env.NODE_ENV === "production") {
    app.get("*", (req: Request, res: Response) => {
      const indexPath = path.join(
        __dirname,
        "../../../apps/client/dist/index.html",
      );
      res.sendFile(indexPath);
    });
  }

  // 404 ハンドリング
  app.use((req: Request, res: Response) => {
    serverLogger.warn("404 - ページが見つかりません", {
      url: req.url,
      method: req.method,
    });
    res.status(404).json({ error: "Not Found" });
  });
}

/**
 * 高度レンジ × 昇る/沈む × イベントタイプでイベントをフィルタリング
 */
function filterEventsByElevationRange(events: SkytreeEvent[]): SkytreeEvent[] {
  const groupMap = new Map<string, SkytreeEvent[]>();
  
  for (const event of events) {
    const elevation = event.elevation || 0;
    const eventType = event.type; // diamond or pearl
    const subType = event.subType; // sunrise, sunset, rising, setting
    
    // 高度レンジを計算（5 度刻み）
    const rangeSize = 5;
    const rangeStart = Math.floor(elevation / rangeSize) * rangeSize;
    const maxElevation = eventType === "diamond" ? 30 : 60;
    const rangeEnd = Math.min(rangeStart + rangeSize - 1, maxElevation);
    
    // 昇る/沈むを判定
    const riseSetType = (subType === "sunrise" || subType === "rising") ? "昇る" : "沈む";
    
    // グループキーを作成
    const groupKey = `${eventType}-${rangeStart}-${rangeEnd}度-${riseSetType}`;
    
    if (!groupMap.has(groupKey)) {
      groupMap.set(groupKey, []);
    }
    groupMap.get(groupKey)!.push(event);
  }
  
  // 各グループで最も精度の良いイベントを選択
  const filteredEvents: SkytreeEvent[] = [];
  for (const groupEvents of groupMap.values()) {
    // qualityScore が最も高いイベントを選択
    const bestEvent = groupEvents.reduce((best, current) => 
      (current.qualityScore || 0) > (best.qualityScore || 0) ? current : best
    );
    filteredEvents.push(bestEvent);
  }
  
  return filteredEvents;
}
