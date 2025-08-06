import { Admin } from "@skytree-photo-planner/types";
import { getComponentLogger } from "@skytree-photo-planner/utils";
import { AuthRepository } from "./interfaces/AuthRepository";
import { PrismaClientManager } from "../database/prisma";

const logger = getComponentLogger("prisma-auth-repository");

export class PrismaAuthRepository implements AuthRepository {
  private prisma = PrismaClientManager.getInstance();

  async findAdminByUsername(username: string): Promise<Admin | null> {
    try {
      const admin = await this.prisma.admin.findUnique({
        where: { username },
      });

      if (!admin) {
        return null;
      }

      return {
        id: admin.id,
        username: admin.username,
        email: admin.email,
        passwordHash: admin.passwordHash,
        createdAt: admin.createdAt,
      };
    } catch (error) {
      logger.error("管理者取得エラー", { username, error });
      throw error;
    }
  }

  async findAdminById(adminId: number): Promise<Admin | null> {
    try {
      const admin = await this.prisma.admin.findUnique({
        where: { id: adminId },
      });

      if (!admin) {
        return null;
      }

      return {
        id: admin.id,
        username: admin.username,
        email: admin.email,
        passwordHash: admin.passwordHash,
        createdAt: admin.createdAt,
      };
    } catch (error) {
      logger.error("管理者 ID 取得エラー", { adminId, error });
      throw error;
    }
  }

  async updateAdminPassword(
    adminId: number,
    passwordHash: string,
  ): Promise<void> {
    try {
      await this.prisma.admin.update({
        where: { id: adminId },
        data: { passwordHash },
      });
      logger.info("管理者パスワード更新完了", { adminId });
    } catch (error) {
      logger.error("管理者パスワード更新エラー", { adminId, error });
      throw error;
    }
  }

  async saveRefreshToken(
    adminId: number,
    refreshToken: string,
    expiresAt: Date,
  ): Promise<void> {
    try {
      logger.debug("リフレッシュトークン保存開始", { adminId });
      
      // 既存の古いトークンをクリーンアップ（管理者あたり最大 5 個まで）
      const existingTokens = await this.prisma.refreshToken.findMany({
        where: { 
          adminId,
          isRevoked: false,
          expiresAt: { gt: new Date() }
        },
        orderBy: { createdAt: 'desc' }
      });

      if (existingTokens.length >= 5) {
        const tokensToRevoke = existingTokens.slice(4); // 最新 4 個を残して古いものを無効化
        await this.prisma.refreshToken.updateMany({
          where: {
            id: { in: tokensToRevoke.map(t => t.id) }
          },
          data: { isRevoked: true }
        });
        logger.info("古いリフレッシュトークンを無効化", { count: tokensToRevoke.length, adminId });
      }

      await this.prisma.refreshToken.create({
        data: {
          token: refreshToken,
          adminId,
          expiresAt,
        },
      });
      
      logger.debug("リフレッシュトークン保存完了", { adminId });
    } catch (error) {
      logger.error("リフレッシュトークン保存エラー", { adminId, error });
      throw error;
    }
  }

  async findValidRefreshToken(
    token: string,
  ): Promise<{ adminId: number; expiresAt: Date } | null> {
    try {
      logger.debug("リフレッシュトークン検索開始");
      
      const refreshToken = await this.prisma.refreshToken.findUnique({
        where: { token },
        include: { admin: true }
      });

      if (!refreshToken) {
        logger.debug("リフレッシュトークンが見つかりません");
        return null;
      }

      if (refreshToken.isRevoked) {
        logger.warn("無効化されたリフレッシュトークンの使用試行", { 
          tokenId: refreshToken.id,
          adminId: refreshToken.adminId 
        });
        return null;
      }

      if (refreshToken.expiresAt < new Date()) {
        logger.debug("期限切れのリフレッシュトークン", { 
          tokenId: refreshToken.id,
          expiresAt: refreshToken.expiresAt 
        });
        return null;
      }

      if (!refreshToken.admin.isActive) {
        logger.warn("非アクティブな管理者のリフレッシュトークン使用試行", { 
          adminId: refreshToken.adminId 
        });
        return null;
      }

      return {
        adminId: refreshToken.adminId,
        expiresAt: refreshToken.expiresAt,
      };
    } catch (error) {
      logger.error("リフレッシュトークン検索エラー", { error });
      throw error;
    }
  }

  async revokeRefreshToken(token: string): Promise<void> {
    try {
      logger.debug("リフレッシュトークン無効化開始");
      
      const result = await this.prisma.refreshToken.updateMany({
        where: { token, isRevoked: false },
        data: { isRevoked: true },
      });

      if (result.count === 0) {
        logger.debug("無効化対象のリフレッシュトークンが見つかりません", { token: token.substring(0, 20) + "..." });
      } else {
        logger.info("リフレッシュトークン無効化完了", { count: result.count });
      }
    } catch (error) {
      logger.error("リフレッシュトークン無効化エラー", { error });
      throw error;
    }
  }

  async revokeAllRefreshTokens(adminId: number): Promise<void> {
    try {
      logger.debug("全リフレッシュトークン無効化開始", { adminId });
      
      const result = await this.prisma.refreshToken.updateMany({
        where: { adminId, isRevoked: false },
        data: { isRevoked: true },
      });

      logger.info("全リフレッシュトークン無効化完了", { adminId, count: result.count });
    } catch (error) {
      logger.error("全リフレッシュトークン無効化エラー", { adminId, error });
      throw error;
    }
  }

  async cleanupExpiredTokens(): Promise<number> {
    try {
      logger.debug("期限切れトークンクリーンアップ開始");
      
      const result = await this.prisma.refreshToken.deleteMany({
        where: {
          OR: [
            { expiresAt: { lt: new Date() } },
            { isRevoked: true }
          ]
        },
      });

      logger.info("期限切れトークンクリーンアップ完了", { deletedCount: result.count });
      return result.count;
    } catch (error) {
      logger.error("期限切れトークンクリーンアップエラー", { error });
      throw error;
    }
  }

  async recordLoginAttempt(
    username: string,
    success: boolean,
    ipAddress?: string,
  ): Promise<void> {
    try {
      // login_attempts テーブルがある場合の実装
      // 現在のスキーマにはないため、ログ出力のみ行う
      logger.info("ログイン試行記録", {
        username,
        success,
        ipAddress,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error("ログイン試行記録エラー", { username, success, error });
      // この機能は補助的なものなので、エラーでも処理を継続
    }
  }

  async getFailedLoginAttempts(username: string, since: Date): Promise<number> {
    try {
      // login_attempts テーブルがある場合の実装
      // 現在のスキーマにはないため、0 を返す
      logger.debug("失敗ログイン試行回数取得", { username, since });
      return 0;
    } catch (error) {
      logger.error("失敗ログイン試行回数取得エラー", { username, error });
      return 0;
    }
  }

  async resetFailedLoginAttempts(username: string): Promise<void> {
    try {
      // login_attempts テーブルがある場合の実装
      // 現在のスキーマにはないため、ログ出力のみ行う
      logger.debug("失敗ログイン試行回数リセット", { username });
    } catch (error) {
      logger.error("失敗ログイン試行回数リセットエラー", { username, error });
      // この機能は補助的なものなので、エラーでも処理を継続
    }
  }
}
