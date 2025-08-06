import { Request, Response } from "express";
import { AuthService } from "../services/interfaces/AuthService";
import { getComponentLogger } from "@skytree-photo-planner/utils";

export class AuthController {
  private logger = getComponentLogger("auth-controller");

  constructor(private authService: AuthService) {}

  // ログイン
  // POST /api/auth/login
  async login(req: Request, res: Response) {
    try {
      const { username, password } = req.body;

      // バリデーション
      if (!username || !password) {
        return res.status(400).json({
          error: "Missing credentials",
          message: "ユーザー名とパスワードを入力してください。",
        });
      }

      if (typeof username !== "string" || typeof password !== "string") {
        return res.status(400).json({
          error: "Invalid credentials format",
          message: "ユーザー名とパスワードは文字列で入力してください。",
        });
      }

      // IP アドレス取得
      const ipAddress = req.ip || req.connection.remoteAddress || "不明";

      this.logger.info("ログイン試行", { username, ipAddress });

      // 認証実行
      const result = await this.authService.authenticate(
        username,
        password,
        ipAddress,
      );

      if (result.success) {
        // アクセストークンとリフレッシュトークンを httpOnly クッキーに設定
        res.cookie("accessToken", result.accessToken, {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: "strict",
          maxAge: 24 * 60 * 60 * 1000, // 24 時間
          path: "/",
        });

        res.cookie("refreshToken", result.refreshToken, {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: "strict",
          maxAge: 7 * 24 * 60 * 60 * 1000, // 7 日
          path: "/",
        });

        this.logger.info("ログイン成功 - セキュアクッキー設定", { username, ipAddress });

        return res.json({
          success: true,
          message: result.message,
          admin: {
            id: result.admin?.id,
            username: result.admin?.username,
          },
          // セキュリティ強化: トークンはレスポンスボディに含めない
          tokenStorage: "httpOnly-cookie",
        });
      } else {
        this.logger.warn("ログイン失敗", {
          username,
          ipAddress,
          message: result.message,
        });

        return res.status(401).json({
          error: "Authentication failed",
          message: result.message,
        });
      }
    } catch (error) {
      this.logger.error("ログイン処理エラー", { error });

      res.status(500).json({
        error: "Internal Server Error",
        message: "ログイン処理中にエラーが発生しました。",
      });
    }
  }

  // ログアウト
  // POST /api/auth/logout
  async logout(req: Request, res: Response) {
    try {
      const refreshToken = req.cookies.refreshToken;

      if (refreshToken) {
        // リフレッシュトークンを無効化
        try {
          await this.authService.revokeRefreshToken(refreshToken);
        } catch (error) {
          this.logger.warn("リフレッシュトークン無効化エラー", { error });
          // エラーでもログアウト処理は継続
        }
      }

      // 両方のクッキーを削除
      res.clearCookie("accessToken", {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        path: "/",
      });
      res.clearCookie("refreshToken", {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        path: "/",
      });

      this.logger.info("ログアウト完了");

      res.json({
        success: true,
        message: "ログアウトしました。",
      });
    } catch (error) {
      this.logger.error("ログアウト処理エラー", { error });

      res.status(500).json({
        error: "Internal Server Error",
        message: "ログアウト処理中にエラーが発生しました。",
      });
    }
  }

  // トークン検証
  // GET /api/auth/verify
  async verifyToken(req: Request, res: Response) {
    try {
      // Cookie ベースの認証を優先、Authorization ヘッダーを次点とする
      let token = req.cookies?.accessToken;
      
      if (!token) {
        const authHeader = req.headers.authorization;
        if (authHeader && authHeader.startsWith("Bearer ")) {
          token = authHeader.substring(7);
        }
      }

      if (!token) {
        return res.status(401).json({
          error: "Missing token",
          message: "アクセストークンが必要です。",
        });
      }
      const result = await this.authService.verifyAccessToken(token);

      if (result.valid) {
        res.json({
          valid: true,
          adminId: result.adminId,
          username: result.username,
        });
      } else {
        res.status(401).json({
          error: "Invalid token",
          message: "アクセストークンが無効です。",
        });
      }
    } catch (error) {
      this.logger.error("トークン検証エラー", { error });

      res.status(500).json({
        error: "Internal Server Error",
        message: "トークン検証中にエラーが発生しました。",
      });
    }
  }

  // パスワード変更
  // POST /api/auth/change-password
  async changePassword(req: Request, res: Response) {
    try {
      const { currentPassword, newPassword } = req.body;

      // バリデーション
      if (!currentPassword || !newPassword) {
        return res.status(400).json({
          error: "Missing passwords",
          message: "現在のパスワードと新しいパスワードを入力してください。",
        });
      }

      if (
        typeof currentPassword !== "string" ||
        typeof newPassword !== "string"
      ) {
        return res.status(400).json({
          error: "Invalid password format",
          message: "パスワードは文字列で入力してください。",
        });
      }

      if (newPassword.length < 8) {
        return res.status(400).json({
          error: "Password too short",
          message: "新しいパスワードは 8 文字以上で入力してください。",
        });
      }

      // 認証済みの管理者 ID を取得（ミドルウェアで設定される想定）
      const admin = (req as any).admin;
      if (!admin || !admin.id) {
        return res.status(401).json({
          error: "Unauthorized",
          message: "認証されていません。",
        });
      }
      const adminId = admin.id;

      this.logger.info("パスワード変更試行", { adminId });

      // パスワード変更実行
      const result = await this.authService.changePassword(
        adminId,
        currentPassword,
        newPassword,
      );

      if (result.success) {
        this.logger.info("パスワード変更成功", { adminId });

        res.json({
          success: true,
          message: result.message,
        });
      } else {
        this.logger.warn("パスワード変更失敗", {
          adminId,
          message: result.message,
        });

        res.status(400).json({
          error: "Password change failed",
          message: result.message,
        });
      }
    } catch (error) {
      this.logger.error("パスワード変更処理エラー", { error });

      res.status(500).json({
        error: "Internal Server Error",
        message: "パスワード変更処理中にエラーが発生しました。",
      });
    }
  }

  // アクセストークン更新
  // POST /api/auth/refresh
  async refreshToken(req: Request, res: Response) {
    try {
      const refreshToken = req.cookies.refreshToken;

      if (!refreshToken) {
        return res.status(401).json({
          error: "Missing refresh token",
          message: "リフレッシュトークンが必要です。",
        });
      }

      this.logger.debug("アクセストークン更新試行");

      // トークン更新実行
      const result = await this.authService.refreshAccessToken(refreshToken);

      if (result.success) {
        // 新しいアクセストークンとリフレッシュトークンを httpOnly クッキーに設定
        res.cookie("accessToken", result.accessToken, {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: "strict",
          maxAge: 24 * 60 * 60 * 1000, // 24 時間
          path: "/",
        });

        if (result.refreshToken) {
          res.cookie("refreshToken", result.refreshToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "strict",
            maxAge: 7 * 24 * 60 * 60 * 1000, // 7 日
            path: "/",
          });
        }

        this.logger.info("アクセストークン更新成功 - セキュアクッキー設定");

        res.json({
          success: true,
          message: result.message,
          // セキュリティ強化: トークンはレスポンスボディに含めない
          tokenStorage: "httpOnly-cookie",
        });
      } else {
        this.logger.warn("アクセストークン更新失敗", {
          message: result.message,
        });

        // リフレッシュトークンが無効な場合は両方のクッキーも削除
        res.clearCookie("accessToken", {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: "strict",
          path: "/",
        });
        res.clearCookie("refreshToken", {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: "strict",
          path: "/",
        });

        res.status(401).json({
          error: "Token refresh failed",
          message: result.message,
        });
      }
    } catch (error) {
      this.logger.error("アクセストークン更新処理エラー", { error });

      res.status(500).json({
        error: "Internal Server Error",
        message: "トークン更新処理中にエラーが発生しました。",
      });
    }
  }
}
