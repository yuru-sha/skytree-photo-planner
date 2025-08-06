/**
 * 統一エラーハンドリングシステム
 * アーキテクチャレベルでの一貫したエラー処理
 */

import { getLogger } from './logger';

const logger = getLogger('ErrorHandler');

/**
 * アプリケーション固有のエラー分類
 */
export enum ErrorCategory {
  CALCULATION = 'CALCULATION',
  VALIDATION = 'VALIDATION',
  EXTERNAL_API = 'EXTERNAL_API',
  DATABASE = 'DATABASE',
  AUTHENTICATION = 'AUTHENTICATION',
  AUTHORIZATION = 'AUTHORIZATION',
  NETWORK = 'NETWORK',
  SYSTEM = 'SYSTEM',
}

/**
 * エラーの重要度レベル
 */
export enum ErrorSeverity {
  LOW = 'LOW',       // ログのみ、処理続行
  MEDIUM = 'MEDIUM', // ログ + アラート、部分的失敗
  HIGH = 'HIGH',     // ログ + アラート + 処理停止
  CRITICAL = 'CRITICAL', // 即座のエスカレーション
}

/**
 * 構造化エラー情報
 */
export interface StructuredError {
  category: ErrorCategory;
  severity: ErrorSeverity;
  originalError: Error | unknown;
  context: Record<string, unknown>;
  timestamp: Date;
  correlationId?: string;
  retryable: boolean;
}

/**
 * エラーハンドリング結果
 */
export interface ErrorHandlingResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: StructuredError;
  shouldRetry: boolean;
  retryDelay?: number;
}

/**
 * 統一エラーハンドラー
 */
export class UnifiedErrorHandler {
  private static instance: UnifiedErrorHandler;
  
  private constructor() {}
  
  static getInstance(): UnifiedErrorHandler {
    if (!UnifiedErrorHandler.instance) {
      UnifiedErrorHandler.instance = new UnifiedErrorHandler();
    }
    return UnifiedErrorHandler.instance;
  }

  /**
   * エラーを構造化して処理
   */
  handleError(
    error: Error | unknown,
    category: ErrorCategory,
    context: Record<string, unknown> = {},
    severity: ErrorSeverity = ErrorSeverity.MEDIUM
  ): StructuredError {
    const structuredError: StructuredError = {
      category,
      severity,
      originalError: error,
      context,
      timestamp: new Date(),
      correlationId: this.generateCorrelationId(),
      retryable: this.isRetryable(category, error),
    };

    this.logError(structuredError);
    this.notifyIfNeeded(structuredError);

    return structuredError;
  }

  /**
   * 非同期操作のエラーハンドリング
   */
  async handleAsyncOperation<T>(
    operation: () => Promise<T>,
    category: ErrorCategory,
    context: Record<string, unknown> = {},
    maxRetries: number = 0
  ): Promise<ErrorHandlingResult<T>> {
    let lastError: StructuredError | undefined;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const data = await operation();
        return { success: true, data, shouldRetry: false };
      } catch (error) {
        lastError = this.handleError(error, category, {
          ...context,
          attempt: attempt + 1,
          maxRetries,
        });

        if (attempt < maxRetries && lastError.retryable) {
          const delay = this.calculateRetryDelay(attempt);
          logger.info('リトライ実行', {
            attempt: attempt + 1,
            delay,
            category,
            correlationId: lastError.correlationId,
          });
          await this.sleep(delay);
          continue;
        }
        break;
      }
    }

    return {
      success: false,
      error: lastError,
      shouldRetry: lastError?.retryable || false,
      retryDelay: lastError?.retryable ? this.calculateRetryDelay(maxRetries) : undefined,
    };
  }

  /**
   * 計算エラー専用ハンドラー（天体計算等）
   */
  handleCalculationError(
    error: Error | unknown,
    calculationType: string,
    inputData: Record<string, unknown>
  ): StructuredError {
    return this.handleError(
      error,
      ErrorCategory.CALCULATION,
      {
        calculationType,
        inputData,
        stackTrace: error instanceof Error ? error.stack : 'No stack trace',
      },
      ErrorSeverity.MEDIUM
    );
  }

  /**
   * API エラー専用ハンドラー
   */
  handleApiError(
    error: Error | unknown,
    endpoint: string,
    method: string,
    requestData?: Record<string, unknown>
  ): StructuredError {
    const isNetworkError = this.isNetworkError(error);
    const category = isNetworkError ? ErrorCategory.NETWORK : ErrorCategory.EXTERNAL_API;
    
    return this.handleError(
      error,
      category,
      {
        endpoint,
        method,
        requestData,
        isNetworkError,
      },
      isNetworkError ? ErrorSeverity.LOW : ErrorSeverity.MEDIUM
    );
  }

  /**
   * データベースエラー専用ハンドラー
   */
  handleDatabaseError(
    error: Error | unknown,
    operation: string,
    query?: string
  ): StructuredError {
    return this.handleError(
      error,
      ErrorCategory.DATABASE,
      {
        operation,
        query: query?.substring(0, 200), // セキュリティのため制限
      },
      ErrorSeverity.HIGH
    );
  }

  private logError(structuredError: StructuredError): void {
    const logData = {
      category: structuredError.category,
      severity: structuredError.severity,
      correlationId: structuredError.correlationId,
      context: structuredError.context,
      retryable: structuredError.retryable,
    };

    switch (structuredError.severity) {
      case ErrorSeverity.CRITICAL:
        logger.error('CRITICAL ERROR', structuredError.originalError as Error, logData);
        break;
      case ErrorSeverity.HIGH:
        logger.error('High severity error', structuredError.originalError as Error, logData);
        break;
      case ErrorSeverity.MEDIUM:
        logger.warn('Medium severity error', logData);
        break;
      case ErrorSeverity.LOW:
        logger.debug('Low severity error', logData);
        break;
    }
  }

  private notifyIfNeeded(structuredError: StructuredError): void {
    if (structuredError.severity === ErrorSeverity.CRITICAL) {
      // 本番環境では外部アラートシステムに通知
      logger.error('CRITICAL ERROR - IMMEDIATE ATTENTION REQUIRED', {
        correlationId: structuredError.correlationId,
        category: structuredError.category,
        context: structuredError.context,
      });
    }
  }

  private isRetryable(category: ErrorCategory, error: Error | unknown): boolean {
    // カテゴリ別のリトライ可能性判定
    switch (category) {
      case ErrorCategory.NETWORK:
      case ErrorCategory.EXTERNAL_API:
        return true;
      case ErrorCategory.DATABASE:
        return this.isDatabaseConnectionError(error);
      case ErrorCategory.CALCULATION:
        return false; // 計算エラーは通常リトライしても解決しない
      case ErrorCategory.VALIDATION:
      case ErrorCategory.AUTHENTICATION:
      case ErrorCategory.AUTHORIZATION:
        return false; // これらはリトライしても解決しない
      default:
        return false;
    }
  }

  private isNetworkError(error: Error | unknown): boolean {
    if (error instanceof Error) {
      const message = error.message.toLowerCase();
      return message.includes('network') || 
             message.includes('timeout') || 
             message.includes('connection') ||
             message.includes('econnrefused') ||
             message.includes('enotfound');
    }
    return false;
  }

  private isDatabaseConnectionError(error: Error | unknown): boolean {
    if (error instanceof Error) {
      const message = error.message.toLowerCase();
      return message.includes('connection') ||
             message.includes('timeout') ||
             message.includes('pool');
    }
    return false;
  }

  private calculateRetryDelay(attempt: number): number {
    // Exponential backoff with jitter
    const baseDelay = 1000; // 1 秒
    const maxDelay = 30000; // 30 秒
    const delay = Math.min(baseDelay * Math.pow(2, attempt), maxDelay);
    const jitter = Math.random() * 0.1 * delay; // 10% のジッター
    return Math.floor(delay + jitter);
  }

  private generateCorrelationId(): string {
    return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * シングルトンインスタンスのエクスポート
 */
export const errorHandler = UnifiedErrorHandler.getInstance();

/**
 * 便利な関数エクスポート
 */
export const handleCalculationError = (
  error: Error | unknown,
  calculationType: string,
  inputData: Record<string, unknown>
) => errorHandler.handleCalculationError(error, calculationType, inputData);

export const handleApiError = (
  error: Error | unknown,
  endpoint: string,
  method: string,
  requestData?: Record<string, unknown>
) => errorHandler.handleApiError(error, endpoint, method, requestData);

export const handleDatabaseError = (
  error: Error | unknown,
  operation: string,
  query?: string
) => errorHandler.handleDatabaseError(error, operation, query);

export const handleAsyncOperation = <T>(
  operation: () => Promise<T>,
  category: ErrorCategory,
  context?: Record<string, unknown>,
  maxRetries?: number
) => errorHandler.handleAsyncOperation(operation, category, context, maxRetries);