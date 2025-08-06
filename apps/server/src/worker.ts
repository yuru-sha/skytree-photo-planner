#!/usr/bin/env node

/**
 * スカイツリー撮影プランナー キューワーカープロセス
 *
 * このファイルは独立したワーカープロセスとして実行され、
 * BullMQ キューから天体計算ジョブを取得して処理します。
 *
 * 使用方法:
 * npm run worker
 * または
 * node dist/server/worker.js
 */

import { DIContainer } from "./di/DIContainer";
import { ServiceRegistry } from "./di/ServiceRegistry";
import { QueueService } from "./services/interfaces/QueueService";
import { getComponentLogger } from "@skytree-photo-planner/utils";

const logger = getComponentLogger("queue-worker");

// DIContainer インスタンス
let diContainer: DIContainer;
let queueService: QueueService;

// プロセス終了時のクリーンアップ
const cleanup = async (signal: string) => {
  logger.info(`${signal} シグナル受信 - ワーカーを安全に終了中...`);

  try {
    if (queueService) {
      await queueService.shutdown();
    }
    logger.info("キューサービス終了完了");
    process.exit(0);
  } catch (error) {
    logger.error("キューサービス終了エラー", error);
    process.exit(1);
  }
};

// シグナルハンドラーの登録
process.on("SIGTERM", () => cleanup("SIGTERM"));
process.on("SIGINT", () => cleanup("SIGINT"));

// 未処理の例外と Promise 拒否のハンドリング
process.on("uncaughtException", (error) => {
  logger.error("未処理の例外が発生しました", error);
  cleanup("UNCAUGHT_EXCEPTION");
});

process.on("unhandledRejection", (reason, promise) => {
  logger.error("未処理の Promise 拒否が発生しました", {
    reason,
    promise: promise.toString(),
  });
  cleanup("UNHANDLED_REJECTION");
});

// メイン処理
async function main() {
  try {
    logger.info("スカイツリー撮影プランナー キューワーカー開始", {
      nodeVersion: process.version,
      platform: process.platform,
      pid: process.pid,
      memory: process.memoryUsage(),
    });

    // 環境変数チェック（デフォルト値があるため必須チェックを緩和）
    const redisHost = process.env.REDIS_HOST || "localhost";
    const redisPort = process.env.REDIS_PORT || "6379";
    
    if (process.env.DISABLE_REDIS === "true") {
      logger.info("Redis無効化モード: ワーカーは起動しますがキューは無効です");
    }

    logger.info("環境設定確認完了", {
      redisHost,
      redisPort,
      nodeEnv: process.env.NODE_ENV || "development",
      redisDisabled: process.env.DISABLE_REDIS === "true"
    });

    // DIContainer を初期化
    diContainer = new DIContainer();

    // サービスを登録
    ServiceRegistry.configure(diContainer);

    // EventService を先に解決して依存関係注入を確実に実行
    const eventService = diContainer.resolve("EventService");
    logger.info("EventService 解決完了", { hasEventService: !!eventService });

    // QueueService を取得（この時点で EventService が注入済み）
    queueService = diContainer.resolve<QueueService>("QueueService");

    // 依存関係が正しく注入されたことを確認
    logger.info("依存関係注入確認", {
      hasQueueService: !!queueService,
      hasEventService: !!eventService,
    });

    logger.info("キューワーカーが正常に開始されました");

    // 定期的なヘルスチェック（5 分ごと）
    const healthCheckInterval = setInterval(
      async () => {
        try {
          const stats = await queueService.getQueueStats();
          logger.info("ワーカーヘルスチェック", {
            queueStats: stats,
            memory: process.memoryUsage(),
            uptime: process.uptime(),
          });
        } catch (error) {
          logger.error("ヘルスチェックエラー", error);
        }
      },
      5 * 60 * 1000,
    ); // 5 分

    // プロセス終了時にインターバルをクリア
    process.on("exit", () => {
      clearInterval(healthCheckInterval);
    });

    // ワーカーを無限に実行（シグナルで終了するまで）
    await new Promise((resolve) => {
      // プロセスが終了するまで待機
      process.on("exit", resolve);
    });
  } catch (error) {
    logger.error("ワーカー初期化エラー", error);
    process.exit(1);
  }
}

// プロセス開始
if (require.main === module) {
  main().catch((error) => {
    logger.error("ワーカーで Unexpected エラーが発生しました", error);
    process.exit(1);
  });
}

export default main;
