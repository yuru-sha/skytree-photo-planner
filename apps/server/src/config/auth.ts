/**
 * 認証関連の設定
 */

import { getComponentLogger } from "@skytree-photo-planner/utils";

const logger = getComponentLogger("AuthConfig");

// 本番環境でのセキュリティ検証
function validateProductionSecrets(): void {
  if (process.env.NODE_ENV === "production") {
    const requiredSecrets = ["JWT_SECRET", "REFRESH_SECRET"];
    const missingSecrets = requiredSecrets.filter(secret => !process.env[secret]);
    
    if (missingSecrets.length > 0) {
      logger.error("本番環境で必須の環境変数が設定されていません", { 
        missingSecrets,
        severity: "CRITICAL" 
      });
      throw new Error(`Production security failure: Missing required environment variables: ${missingSecrets.join(", ")}`);
    }

    // 秘密鍵の強度検証
    const jwtSecret = process.env.JWT_SECRET!;
    const refreshSecret = process.env.REFRESH_SECRET!;
    
    if (jwtSecret.length < 32) {
      logger.error("JWT_SECRET is too short for production use", { length: jwtSecret.length });
      throw new Error("JWT_SECRET must be at least 32 characters long in production");
    }
    
    if (refreshSecret.length < 32) {
      logger.error("REFRESH_SECRET is too short for production use", { length: refreshSecret.length });
      throw new Error("REFRESH_SECRET must be at least 32 characters long in production");
    }
    
    if (jwtSecret === refreshSecret) {
      logger.error("JWT_SECRET and REFRESH_SECRET must be different");
      throw new Error("JWT_SECRET and REFRESH_SECRET must use different values");
    }
    
    logger.info("Production security validation passed");
  }
}

// 開発環境での警告
function warnDevelopmentSecrets(): void {
  if (process.env.NODE_ENV !== "production") {
    if (!process.env.JWT_SECRET || !process.env.REFRESH_SECRET) {
      logger.warn("開発環境で環境変数が未設定です。デフォルト値を使用します。", {
        hasJwtSecret: !!process.env.JWT_SECRET,
        hasRefreshSecret: !!process.env.REFRESH_SECRET,
        recommendation: "本番環境では必ず強力な秘密鍵を設定してください"
      });
    }
  }
}

// 初期化時の検証実行
validateProductionSecrets();
warnDevelopmentSecrets();

export const AUTH_CONFIG = {
  JWT_SECRET: process.env.JWT_SECRET || (
    process.env.NODE_ENV === "production" 
      ? (() => { throw new Error("JWT_SECRET is required in production"); })()
      : "dev-jwt-secret-key-DO-NOT-USE-IN-PRODUCTION"
  ),
  JWT_EXPIRES_IN: "24h",
  JWT_ALGORITHM: "HS256" as const,
  REFRESH_SECRET: process.env.REFRESH_SECRET || (
    process.env.NODE_ENV === "production"
      ? (() => { throw new Error("REFRESH_SECRET is required in production"); })()
      : "dev-refresh-secret-key-DO-NOT-USE-IN-PRODUCTION"
  ),
  REFRESH_EXPIRES_IN: "7d",
  BCRYPT_SALT_ROUNDS: 12, // 増強（10→12）
} as const;
