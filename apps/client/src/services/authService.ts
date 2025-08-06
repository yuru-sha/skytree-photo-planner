import { apiLogger } from "../utils/logger";

// 認証用の軽量な管理者型
interface AuthAdmin {
  id: number;
  username: string;
}

interface LoginRequest {
  username: string;
  password: string;
}

interface LoginResponse {
  success: boolean;
  admin?: AuthAdmin;
  message: string;
  error?: string;
  tokenStorage?: string; // セキュアクッキー使用の場合は "httpOnly-cookie"
}

interface AuthState {
  isAuthenticated: boolean;
  admin: AuthAdmin | null;
}

class AuthService {
  private baseUrl: string;
  private adminKey = "skytree_photo_planner_admin";

  constructor() {
    this.baseUrl = process.env.NODE_ENV === "production" ? "/api" : "/api"; // Vite proxy を使用
  }

  /**
   * ログイン
   */
  async login(credentials: LoginRequest): Promise<LoginResponse> {
    try {
      const response = await fetch(`${this.baseUrl}/auth/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include", // httpOnly クッキーの送受信を有効化
        body: JSON.stringify(credentials),
      });

      const data = await response.json();

      if (data.success) {
        // 管理者情報がある場合のみ保存（トークンはクッキーで管理される）
        if (data.admin) {
          localStorage.setItem(this.adminKey, JSON.stringify(data.admin));
        }
      }

      return data;
    } catch (error) {
      apiLogger.error("Login error:", error as Error);
      return {
        success: false,
        message: "ログイン処理中にエラーが発生しました。",
        error: "Network error",
      };
    }
  }

  /**
   * ログアウト
   */
  async logout(): Promise<void> {
    try {
      await fetch(`${this.baseUrl}/auth/logout`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include", // httpOnly クッキーの送信を有効化
      });
    } catch (error) {
      apiLogger.error("Logout error:", error as Error);
    } finally {
      // ローカルストレージから管理者情報を削除（クッキーはサーバーが削除）
      localStorage.removeItem(this.adminKey);
    }
  }

  /**
   * トークン検証
   */
  async verifyToken(): Promise<{ success: boolean; admin?: AuthAdmin }> {
    try {
      apiLogger.debug("verifyToken: Verifying cookie-based authentication");

      const response = await fetch(`${this.baseUrl}/auth/verify`, {
        credentials: "include", // httpOnly クッキーの送信を有効化
      });

      if (!response.ok) {
        this.clearAuth();
        return { success: false };
      }

      const data = await response.json();

      if (data.valid) {
        // 管理者情報を更新（API レスポンス形式に合わせる）
        const admin = {
          id: data.adminId,
          username: data.username,
        };
        localStorage.setItem(this.adminKey, JSON.stringify(admin));
        return { success: true, admin };
      } else {
        // トークンが無効な場合はクリア
        this.clearAuth();
        return { success: false };
      }
    } catch (error) {
      apiLogger.error("Token verification error:", error as Error);
      this.clearAuth();
      return { success: false };
    }
  }

  /**
   * パスワード変更
   */
  async changePassword(
    currentPassword: string,
    newPassword: string,
  ): Promise<{ success: boolean; message: string }> {
    try {
      const response = await fetch(`${this.baseUrl}/auth/change-password`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include", // httpOnly クッキーの送信を有効化
        body: JSON.stringify({
          currentPassword,
          newPassword,
        }),
      });

      const data = await response.json();
      return {
        success: data.success,
        message:
          data.message ||
          (data.success
            ? "パスワードが変更されました。"
            : "パスワード変更に失敗しました。"),
      };
    } catch (error) {
      apiLogger.error("Change password error:", error as Error);
      return {
        success: false,
        message: "パスワード変更中にエラーが発生しました。",
      };
    }
  }

  /**
   * 現在の認証状態を取得
   */
  getAuthState(): AuthState {
    const adminData = localStorage.getItem(this.adminKey);

    return {
      isAuthenticated: !!adminData,
      admin: adminData ? JSON.parse(adminData) : null,
    };
  }

  /**
   * 認証情報をクリア
   */
  clearAuth(): void {
    localStorage.removeItem(this.adminKey);
  }

  /**
   * 認証ヘッダーを取得（cookie-based認証では空のヘッダーを返す）
   */
  getAuthHeaders(): Record<string, string> {
    // Cookie-based認証を使用しているため、特別なヘッダーは不要
    // credentialsオプションでhttpOnlyクッキーが自動的に送信される
    return {};
  }

  /**
   * 認証が必要な API リクエスト用の fetch ラッパー
   */
  async authenticatedFetch(
    url: string,
    options: RequestInit = {},
  ): Promise<Response> {
    const headers = {
      "Content-Type": "application/json",
      ...options.headers,
    };

    let response = await fetch(url, {
      ...options,
      headers,
      credentials: "include", // httpOnly クッキーの送信を有効化
    });

    // 401 エラーの場合はリフレッシュトークンで再試行
    if (response.status === 401) {
      apiLogger.debug("Access token expired, attempting refresh");
      
      const refreshResult = await this.refreshAccessToken();
      if (refreshResult.success) {
        // リフレッシュ成功: 元のリクエストを再試行
        response = await fetch(url, {
          ...options,
          headers,
          credentials: "include",
        });
      } else {
        // リフレッシュ失敗: 認証情報をクリアしてログインページへ
        this.clearAuth();
        window.location.href = "/admin/login";
      }
    }

    return response;
  }

  /**
   * アクセストークンのリフレッシュ
   */
  private async refreshAccessToken(): Promise<{ success: boolean; message?: string }> {
    try {
      const response = await fetch(`${this.baseUrl}/auth/refresh`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
      });

      const data = await response.json();
      
      if (data.success) {
        apiLogger.debug("Access token refreshed successfully");
        return { success: true };
      } else {
        apiLogger.warn("Token refresh failed:", data.message);
        return { success: false, message: data.message };
      }
    } catch (error) {
      apiLogger.error("Token refresh error:", error as Error);
      return { success: false, message: "Token refresh failed" };
    }
  }

  /**
   * 管理者作成（開発環境用）
   */
  async createAdmin(
    username: string,
    email: string,
    password: string,
  ): Promise<{ success: boolean; message: string }> {
    try {
      const response = await fetch(`${this.baseUrl}/auth/create-admin`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          username,
          email,
          password,
        }),
      });

      const data = await response.json();
      return {
        success: data.success,
        message:
          data.message ||
          (data.success
            ? "管理者が作成されました。"
            : "管理者作成に失敗しました。"),
      };
    } catch (error) {
      apiLogger.error("Create admin error:", error as Error);
      return {
        success: false,
        message: "管理者作成中にエラーが発生しました。",
      };
    }
  }
}

// シングルトンインスタンス
export const authService = new AuthService();

import React from "react";

// React 用のカスタムフック
export function useAuth() {
  const [authState, setAuthState] = React.useState<AuthState>(
    authService.getAuthState(),
  );

  React.useEffect(() => {
    // トークン検証
    const verifyAuth = async () => {
      await authService.verifyToken();
      setAuthState(authService.getAuthState());
    };

    if (authState.admin) {
      verifyAuth();
    }
  }, []);

  const login = async (credentials: LoginRequest) => {
    const result = await authService.login(credentials);
    setAuthState(authService.getAuthState());
    return result;
  };

  const logout = async () => {
    await authService.logout();
    setAuthState(authService.getAuthState());
  };

  return {
    ...authState,
    login,
    logout,
    verifyToken: authService.verifyToken.bind(authService),
    changePassword: authService.changePassword.bind(authService),
  };
}

export default authService;
