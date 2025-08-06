import express from "express";
import { Bootstrap } from "./bootstrap";
import { setupMiddleware } from "./middleware/app";
import { setupRoutes } from "./routes";
import { DIContainer } from "./di/DIContainer";
import { ServiceRegistry } from "./di/ServiceRegistry";
import { getComponentLogger } from "@skytree-photo-planner/utils";

const logger = getComponentLogger("server");

// DI コンテナの初期化
const container = new DIContainer();
ServiceRegistry.configure(container);
logger.info("DI コンテナ初期化完了");

const app = express();
const PORT = Number(process.env.PORT) || 3001;

// ミドルウェアの設定
setupMiddleware(app);

// ルートの設定
setupRoutes(app, container);

// グレースフルシャットダウン
process.on("SIGTERM", async () => {
  await Bootstrap.shutdown(container);
  process.exit(0);
});

process.on("SIGINT", async () => {
  await Bootstrap.shutdown(container);
  process.exit(0);
});

// サーバー起動
Bootstrap.startServer({ app, port: PORT }, container);
