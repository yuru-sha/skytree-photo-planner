import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { AuthService } from "./interfaces/AuthService";
import { AuthRepository } from "../repositories/interfaces/AuthRepository";
import { getComponentLogger } from "@skytree-photo-planner/utils";
import { AUTH_CONFIG } from "../config/auth";

const logger = getComponentLogger("auth-service");

// JWT ペイロード型定義
interface JwtAccessPayload {
  adminId: number;
  username: string;
  type: "access";
  iat?: number;
  exp?: number;
}

interface JwtRefreshPayload {
  type: "refresh";
  adminId?: number;
  iat?: number;
  exp?: number;
}

export class AuthServiceImpl implements AuthService {
  private readonly jwtSecret: string;
  private readonly refreshSecret: string;
  private readonly accessTokenExpiry = AUTH_CONFIG.JWT_EXPIRES_IN;
  private readonly refreshTokenExpiry = AUTH_CONFIG.REFRESH_EXPIRES_IN;
  private readonly jwtAlgorithm = AUTH_CONFIG.JWT_ALGORITHM;

  constructor(private authRepository: AuthRepository) {
    this.jwtSecret = AUTH_CONFIG.JWT_SECRET;
    this.refreshSecret = AUTH_CONFIG.REFRESH_SECRET;
    
    logger.info("AuthService initialized with secure configuration");
  }

  async authenticate(
    username: string,
    password: string,
    ipAddress?: string,
  ): Promise<{
    success: boolean;
    accessToken?: string;
    refreshToken?: string;
    message: string;
    admin?: {
      id: number;
      username: string;
    };
  }> {
    try {
      logger.info("認証試行開始", { username, ipAddress });

      // 管理者情報取得
      const admin = await this.authRepository.findAdminByUsername(username);
      if (!admin) {
        await this.authRepository.recordLoginAttempt(
          username,
          false,
          ipAddress,
        );
        logger.warn("認証失敗 - ユーザーが見つかりません", {
          username,
          ipAddress,
        });
        return {
          success: false,
          message: "ユーザー名またはパスワードが正しくありません。",
        };
      }

      // パスワード検証
      const isValidPassword = await bcrypt.compare(
        password,
        admin.passwordHash,
      );
      if (!isValidPassword) {
        await this.authRepository.recordLoginAttempt(
          username,
          false,
          ipAddress,
        );
        logger.warn("認証失敗 - パスワードが正しくありません", {
          username,
          ipAddress,
        });
        return {
          success: false,
          message: "ユーザー名またはパスワードが正しくありません。",
        };
      }

      // トークン生成
      const accessToken = this.generateAccessToken(admin.id, admin.username);
      const refreshToken = this.generateRefreshToken();

      // リフレッシュトークンをデータベースに保存
      const refreshExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 日後
      await this.authRepository.saveRefreshToken(
        admin.id,
        refreshToken,
        refreshExpiresAt,
      );

      // 成功記録
      await this.authRepository.recordLoginAttempt(username, true, ipAddress);
      await this.authRepository.resetFailedLoginAttempts(username);

      logger.info("認証成功", { username, adminId: admin.id, ipAddress });

      return {
        success: true,
        accessToken,
        refreshToken,
        message: "認証に成功しました。",
        admin: {
          id: admin.id,
          username: admin.username,
        },
      };
    } catch (error) {
      logger.error("認証処理エラー", { username, ipAddress, error });
      return {
        success: false,
        message: "認証処理中にエラーが発生しました。",
      };
    }
  }

  async refreshAccessToken(refreshToken: string): Promise<{
    success: boolean;
    accessToken?: string;
    refreshToken?: string;
    message: string;
  }> {
    try {
      logger.debug("アクセストークン更新試行");

      // データベースでリフレッシュトークンの有効性を検証
      const tokenData = await this.authRepository.findValidRefreshToken(refreshToken);
      if (!tokenData) {
        logger.warn("無効または期限切れのリフレッシュトークン");
        return {
          success: false,
          message: "リフレッシュトークンが無効または期限切れです。再ログインしてください。",
        };
      }

      // 管理者情報を取得
      const admin = await this.authRepository.findAdminById(tokenData.adminId);
      if (!admin) {
        logger.error("リフレッシュトークンに対応する管理者が見つかりません", { 
          adminId: tokenData.adminId 
        });
        return {
          success: false,
          message: "管理者アカウントが見つかりません。",
        };
      }

      // 古いリフレッシュトークンを無効化（セキュリティ向上のためリフレッシュごとにローテーション）
      await this.authRepository.revokeRefreshToken(refreshToken);

      // 新しいアクセストークンとリフレッシュトークンを生成
      const newAccessToken = this.generateAccessToken(admin.id, admin.username);
      const newRefreshToken = this.generateRefreshToken();
      
      // 新しいリフレッシュトークンの有効期限を計算
      const refreshExpiresAt = new Date();
      refreshExpiresAt.setTime(refreshExpiresAt.getTime() + (7 * 24 * 60 * 60 * 1000)); // 7 日間

      // 新しいリフレッシュトークンをデータベースに保存
      await this.authRepository.saveRefreshToken(admin.id, newRefreshToken, refreshExpiresAt);

      logger.info("アクセストークン更新成功", { 
        adminId: admin.id,
        username: admin.username 
      });

      return {
        success: true,
        accessToken: newAccessToken,
        refreshToken: newRefreshToken,
        message: "アクセストークンを更新しました。",
      };
    } catch (error) {
      logger.error("アクセストークン更新エラー", { error });
      return {
        success: false,
        message: "アクセストークン更新中にエラーが発生しました。",
      };
    }
  }

  // 旧メソッドとの互換性を保持（削除予定）
  async refreshAccessTokenLegacy(refreshToken: string): Promise<{
    success: boolean;
    accessToken?: string;
    message: string;
  }> {
    try {
      logger.debug("Legacy アクセストークン更新試行", { deprecated: true });

      // リフレッシュトークンの JWT 検証
      let decoded;
      try {
        decoded = jwt.verify(refreshToken, this.refreshSecret, {
          algorithms: [this.jwtAlgorithm],
          issuer: "skytree-photo-planner",
          audience: "skytree-photo-planner-admin",
        }) as JwtRefreshPayload;
      } catch (error) {
        logger.warn("Legacy リフレッシュトークン検証失敗", { error });
        return {
          success: false,
          message: "リフレッシュトークンが無効です。",
        };
      }

      // リフレッシュトークンの型確認
      if (decoded.type !== "refresh") {
        logger.warn("無効なトークンタイプ", { type: decoded.type });
        return {
          success: false,
          message: "リフレッシュトークンが無効です。",
        };
      }

      // JWT からの adminId は使わず、現在のアクセストークンから取得（より安全）
      // リフレッシュ時は既存の有効な管理者のみ対象とする
      const admin = await this.authRepository.findAdminByUsername("admin");
      if (!admin) {
        logger.error("管理者情報の取得に失敗");
        return {
          success: false,
          message: "管理者情報の取得に失敗しました。",
        };
      }

      // 新しいアクセストークン生成
      const accessToken = this.generateAccessToken(admin.id, admin.username);

      logger.info("アクセストークン更新成功", { adminId: admin.id });

      return {
        success: true,
        accessToken,
        message: "アクセストークンを更新しました。",
      };
    } catch (error) {
      logger.error("アクセストークン更新エラー", { error });
      return {
        success: false,
        message: "トークン更新中にエラーが発生しました。",
      };
    }
  }

  async revokeRefreshToken(refreshToken: string): Promise<void> {
    try {
      await this.authRepository.revokeRefreshToken(refreshToken);
      logger.info("リフレッシュトークン無効化完了");
    } catch (error) {
      logger.error("リフレッシュトークン無効化エラー", { error });
      throw error;
    }
  }

  async revokeAllRefreshTokens(adminId: number): Promise<void> {
    try {
      await this.authRepository.revokeAllRefreshTokens(adminId);
      logger.info("全リフレッシュトークン無効化完了", { adminId });
    } catch (error) {
      logger.error("全リフレッシュトークン無効化エラー", { adminId, error });
      throw error;
    }
  }

  async changePassword(
    adminId: number,
    currentPassword: string,
    newPassword: string,
  ): Promise<{
    success: boolean;
    message: string;
  }> {
    try {
      logger.info("パスワード変更試行", { adminId });

      // 現在の管理者情報を取得
      const admin = await this.authRepository.findAdminById(adminId);
      if (!admin) {
        logger.warn("パスワード変更失敗 - 管理者が見つかりません", { adminId });
        return {
          success: false,
          message: "管理者情報が見つかりません。",
        };
      }

      // 現在のパスワード検証
      const isCurrentPasswordValid = await bcrypt.compare(
        currentPassword,
        admin.passwordHash,
      );
      if (!isCurrentPasswordValid) {
        logger.warn("パスワード変更失敗 - 現在のパスワードが正しくありません", {
          adminId,
        });
        return {
          success: false,
          message: "現在のパスワードが正しくありません。",
        };
      }

      // 新しいパスワードのハッシュ化
      const saltRounds = 12;
      const newPasswordHash = await bcrypt.hash(newPassword, saltRounds);
      logger.debug("新しいパスワードハッシュ生成完了", {
        hashLength: newPasswordHash.length,
      });

      // パスワード更新
      await this.authRepository.updateAdminPassword(adminId, newPasswordHash);

      logger.info("パスワード変更成功", { adminId });

      return {
        success: true,
        message: "パスワードを変更しました。",
      };
    } catch (error) {
      logger.error("パスワード変更エラー", { adminId, error });
      return {
        success: false,
        message: "パスワード変更中にエラーが発生しました。",
      };
    }
  }

  async verifyAccessToken(token: string): Promise<{
    valid: boolean;
    adminId?: number;
    username?: string;
  }> {
    try {
      const decoded = jwt.verify(token, this.jwtSecret, {
        algorithms: [this.jwtAlgorithm],
        issuer: "skytree-photo-planner",
        audience: "skytree-photo-planner-admin",
      }) as JwtAccessPayload;

      // ペイロード型の検証
      if (!decoded || decoded.type !== "access" || !decoded.adminId || !decoded.username) {
        logger.warn("Invalid access token payload structure", {
          hasType: !!decoded?.type,
          hasAdminId: !!decoded?.adminId,
          hasUsername: !!decoded?.username,
        });
        return { valid: false };
      }

      return {
        valid: true,
        adminId: decoded.adminId,
        username: decoded.username,
      };
    } catch (error) {
      logger.debug("アクセストークン検証失敗", {
        error: error instanceof Error ? error.message : error,
        tokenPreview: token.substring(0, 20) + "...",
      });
      return {
        valid: false,
      };
    }
  }

  async cleanupExpiredTokens(): Promise<number> {
    try {
      const deletedCount = await this.authRepository.cleanupExpiredTokens();
      logger.info("期限切れトークンクリーンアップ完了", { deletedCount });
      return deletedCount;
    } catch (error) {
      logger.error("期限切れトークンクリーンアップエラー", { error });
      throw error;
    }
  }

  private generateAccessToken(adminId: number, username: string): string {
    const payload: Omit<JwtAccessPayload, 'iat' | 'exp'> = {
      adminId,
      username,
      type: "access",
    };
    
    return jwt.sign(
      payload,
      this.jwtSecret,
      {
        algorithm: this.jwtAlgorithm,
        expiresIn: this.accessTokenExpiry,
        issuer: "skytree-photo-planner",
        audience: "skytree-photo-planner-admin",
        jwtid: `access-${adminId}-${Date.now()}`,
      },
    );
  }

  private generateRefreshToken(): string {
    const payload: Omit<JwtRefreshPayload, 'iat' | 'exp' | 'adminId'> = {
      type: "refresh",
    };
    
    return jwt.sign(
      payload,
      this.refreshSecret,
      {
        algorithm: this.jwtAlgorithm,
        expiresIn: this.refreshTokenExpiry,
        issuer: "skytree-photo-planner",
        audience: "skytree-photo-planner-admin",
        jwtid: `refresh-${Date.now()}-${Math.random().toString(36).substring(2, 15)}`,
      },
    );
  }
}
