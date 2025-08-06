// クライアントサイド専用ログシステム（暫定実装）
interface Logger {
  debug(message: string, data?: Record<string, unknown>): void;
  info(message: string, data?: Record<string, unknown>): void;
  warn(message: string, error?: Error, data?: Record<string, unknown>): void;
  error(message: string, error?: Error, data?: Record<string, unknown>): void;
}

class ClientLogger implements Logger {
  private category: string;

  constructor(category: string) {
    this.category = category;
  }

  debug(message: string, data?: Record<string, unknown>): void {
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[DEBUG] [${this.category}] ${message}`, data || '');
    }
  }

  info(message: string, data?: Record<string, unknown>): void {
    console.info(`[INFO] [${this.category}] ${message}`, data || '');
  }

  warn(message: string, error?: Error, data?: Record<string, unknown>): void {
    const logData = { error: error?.message, stack: error?.stack, ...data };
    console.warn(`[WARN] [${this.category}] ${message}`, logData);
  }

  error(message: string, error?: Error, data?: Record<string, unknown>): void {
    const logData = { error: error?.message, stack: error?.stack, ...data };
    console.error(`[ERROR] [${this.category}] ${message}`, logData);
  }
}

// クライアントサイド専用ロガー
export const uiLogger = new ClientLogger('ui');
export const apiLogger = new ClientLogger('api');
export const mapLogger = new ClientLogger('map');
export const calculationLogger = new ClientLogger('calculation');