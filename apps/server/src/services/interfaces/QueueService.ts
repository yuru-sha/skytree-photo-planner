import { EventService } from "./EventService";

/**
 * QueueService インターフェース
 * キューシステムの操作を定義
 */
export interface QueueService {
  /**
   * EventService を後から注入（循環依存対策）
   */
  setEventService(eventService: EventService): void;

  /**
   * SystemSettingsService を後から注入（循環依存対策）
   */
  setSystemSettingsService?(systemSettingsService: {
    getPerformanceSettings(): Promise<{
      workerConcurrency: number;
      jobDelay: number;
      processingDelay: number;
      enableLowPriorityMode: boolean;
      maxActiveJobs: number;
    }>;
    updateSetting(key: string, value: string | number | boolean, type: string): Promise<void>;
  }): void;

  /**
   * 地点計算ジョブをスケジュール
   */
  scheduleLocationCalculation(
    locationId: number,
    startYear: number,
    endYear: number,
    priority?: "low" | "normal" | "high",
  ): Promise<string | null>;

  /**
   * キューの統計情報を取得
   */
  getQueueStats(): Promise<{
    enabled: boolean;
    waiting: number;
    active: number;
    completed: number;
    failed: number;
    delayed: number;
    paused: number;
    failedJobs: Array<{
      id: string;
      name: string;
      data: Record<string, unknown>;
      failedReason: string;
      attemptsMade: number;
      timestamp: number;
    }>;
  }>;

  /**
   * Redis 接続テスト
   */
  testRedisConnection(): Promise<boolean>;

  /**
   * ワーカーの同時実行数をリアルタイムで変更
   */
  updateConcurrency(newConcurrency: number): Promise<boolean>;

  /**
   * 現在の同時実行数を取得
   */
  getCurrentConcurrency(): number;

  /**
   * 失敗したジョブをクリーンアップ
   */
  cleanFailedJobs(): Promise<number>;

  /**
   * キューサービスを終了
   */
  shutdown(): Promise<void>;
}
