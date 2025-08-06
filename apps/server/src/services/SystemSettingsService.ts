import { getComponentLogger } from "@skytree-photo-planner/utils";
import type { SystemSetting } from "@skytree-photo-planner/types";
import type { ISystemSettingsService } from "./interfaces/ISystemSettingsService";
import type { SystemSettingsRepository } from "../repositories/interfaces/SystemSettingsRepository";

const logger = getComponentLogger("SystemSettingsService");

/**
 * システム設定管理サービス
 * 天体計算の定数値などを DB で管理し、運用中に調整可能にする
 */
export class SystemSettingsService implements ISystemSettingsService {
  private repository: SystemSettingsRepository;
  private settingsCache: Map<string, string | number | boolean> = new Map();
  private lastCacheUpdate: Date = new Date(0);
  private readonly CACHE_DURATION = 60 * 1000; // 1 分間キャッシュ

  constructor(repository: SystemSettingsRepository) {
    this.repository = repository;
  }

  /**
   * 設定値を取得（キャッシュ付き）
   */
  async getSetting<T = unknown>(settingKey: string, defaultValue?: T): Promise<T> {
    // キャッシュの有効期限をチェック
    if (Date.now() - this.lastCacheUpdate.getTime() > this.CACHE_DURATION) {
      try {
        await this.refreshCache();
      } catch (error) {
        logger.warn("キャッシュ更新失敗、デフォルト値を使用", { settingKey, error });
        if (defaultValue !== undefined) {
          return defaultValue as T;
        }
      }
    }

    if (this.settingsCache.has(settingKey)) {
      return this.settingsCache.get(settingKey) as T;
    }

    // キャッシュにない場合は DB から取得
    try {
      const setting = await this.repository.getByKey(settingKey);

      if (setting) {
        const value = this.parseSettingValue(setting);
        this.settingsCache.set(settingKey, value);
        return value as T;
      }
    } catch (error) {
      logger.warn("設定値取得エラー、デフォルト値を使用", { settingKey, error });
    }

    // デフォルト値を返す
    if (defaultValue !== undefined) {
      this.settingsCache.set(settingKey, defaultValue as string | number | boolean);
      return defaultValue as T;
    }

    // よく使われる設定のハードコードされたデフォルト値
    const hardcodedDefaults: Record<string, unknown> = {
      search_interval: 10,
      azimuth_tolerance: 1.5,
      elevation_tolerance: 1.0,
      accuracy_perfect_threshold: 0.1,
      accuracy_excellent_threshold: 0.25,
      accuracy_good_threshold: 0.4,
      accuracy_fair_threshold: 0.6,
      elevation_accuracy_perfect_threshold: 0.1,
      elevation_accuracy_excellent_threshold: 0.25,
      elevation_accuracy_good_threshold: 0.4,
      elevation_accuracy_fair_threshold: 0.6,
    };

    if (hardcodedDefaults[settingKey] !== undefined) {
      const fallbackValue = hardcodedDefaults[settingKey];
      logger.info("ハードコードされたデフォルト値を使用", { settingKey, value: fallbackValue });
      this.settingsCache.set(settingKey, fallbackValue as string | number | boolean);
      return fallbackValue as T;
    }

    throw new Error(
      `Setting not found and no default value provided: ${settingKey}`,
    );
  }

  /**
   * 数値設定を取得
   */
  async getNumberSetting(
    settingKey: string,
    defaultValue?: number,
  ): Promise<number> {
    return this.getSetting<number>(settingKey, defaultValue);
  }

  /**
   * 文字列設定を取得
   */
  async getStringSetting(
    settingKey: string,
    defaultValue?: string,
  ): Promise<string> {
    return this.getSetting<string>(settingKey, defaultValue);
  }

  /**
   * 真偽値設定を取得
   */
  async getBooleanSetting(
    settingKey: string,
    defaultValue?: boolean,
  ): Promise<boolean> {
    return this.getSetting<boolean>(settingKey, defaultValue);
  }

  /**
   * 設定値を更新
   */
  async updateSetting(
    settingKey: string,
    value: string | number | boolean,
    settingType?: string,
  ): Promise<void> {
    try {
      await this.repository.upsert(settingKey, value);

      // キャッシュを更新
      this.settingsCache.set(settingKey, value);

      logger.info("設定値更新", { settingKey, value, settingType });
    } catch (error) {
      logger.error("設定値更新エラー", { settingKey, value, error });
      throw error;
    }
  }

  /**
   * 設定値を更新して更新後の設定オブジェクトを返す
   */
  async updateSettingAndReturn(
    settingKey: string,
    value: string | number | boolean,
    settingType?: string,
  ): Promise<SystemSetting | null> {
    try {
      const updatedSetting = await this.repository.upsert(settingKey, value);

      // キャッシュを更新
      this.settingsCache.set(settingKey, value);

      logger.info("設定値更新", { settingKey, value, settingType });
      return updatedSetting;
    } catch (error) {
      logger.error("設定値更新エラー", { settingKey, value, error });
      throw error;
    }
  }

  /**
   * カテゴリ別設定一覧を取得
   */
  async getSettingsByCategory(category: string): Promise<SystemSetting[]> {
    try {
      const settings = await this.repository.findByCategory(category);
      return settings as unknown as SystemSetting[];
    } catch (error) {
      logger.error("カテゴリ別設定取得エラー", { category, error });
      throw error;
    }
  }

  /**
   * 全設定一覧を取得
   */
  async getAllSettings(): Promise<SystemSetting[]> {
    try {
      const settings = await this.repository.findAll();
      return settings as unknown as SystemSetting[];
    } catch (error) {
      logger.error("全設定取得エラー", error);
      throw error;
    }
  }

  /**
   * キャッシュをクリア
   */
  async clearCache(): Promise<void> {
    logger.info("システム設定キャッシュクリア開始");
    this.settingsCache.clear();
    this.lastCacheUpdate = new Date(0); // 古い日付に設定してキャッシュを無効化
    logger.info("システム設定キャッシュクリア完了");
  }

  /**
   * キャッシュをリフレッシュ
   */
  async refreshCache(): Promise<void> {
    try {
      const settings = await this.repository.findAll();

      this.settingsCache.clear();
      settings.forEach((setting) => {
        const value = this.parseSettingValue(setting as unknown as SystemSetting);
        this.settingsCache.set(setting.settingKey, value);
      });

      this.lastCacheUpdate = new Date();
      logger.debug("設定キャッシュを更新", { settingsCount: settings.length });
    } catch (error) {
      logger.warn("キャッシュ更新エラー、デフォルト値で継続", error);
      // エラーを再スローしない（デフォルト値で継続）
      this.lastCacheUpdate = new Date(); // キャッシュ失敗でも再試行を防ぐ
    }
  }

  /**
   * 設定値をパース
   */
  private parseSettingValue(setting: SystemSetting): string | number | boolean | null {
    switch (setting.settingType) {
      case "number":
        return setting.numberValue;
      case "string":
        return setting.stringValue;
      case "boolean":
        return setting.booleanValue;
      default:
        return setting.stringValue; // デフォルトは文字列
    }
  }

  /**
   * 更新データを準備
   */
  private prepareUpdateData(value: string | number | boolean, settingType?: string): Record<string, unknown> {
    const type = settingType || this.inferSettingType(value);

    switch (type) {
      case "number":
        return {
          settingType: "number" as const,
          numberValue: Number(value),
          stringValue: null,
          booleanValue: null,
        };
      case "boolean":
        return {
          settingType: "boolean" as const,
          numberValue: null,
          stringValue: null,
          booleanValue: Boolean(value),
        };
      case "string":
      default:
        return {
          settingType: "string" as const,
          numberValue: null,
          stringValue: String(value),
          booleanValue: null,
        };
    }
  }

  /**
   * 値から設定タイプを推測
   */
  private inferSettingType(value: string | number | boolean): string {
    if (typeof value === "number") return "number";
    if (typeof value === "boolean") return "boolean";
    return "string";
  }

  /**
   * 設定キーからカテゴリを推論
   */
  private inferCategoryFromKey(settingKey: string): string {
    if (settingKey.includes('worker_') || settingKey.includes('job_') || settingKey.includes('processing_') || settingKey.includes('concurrency') || settingKey.includes('max_active')) {
      return 'performance';
    }
    if (settingKey.includes('azimuth_') || settingKey.includes('elevation_') || settingKey.includes('sun_') || settingKey.includes('moon_') || settingKey.includes('search_')) {
      return 'astronomical';
    }
    if (settingKey.includes('ui_') || settingKey.includes('theme_') || settingKey.includes('display_')) {
      return 'ui';
    }
    // デフォルトは performance
    return 'performance';
  }

  /**
   * 天体計算設定を一括取得（パフォーマンス用）
   */
  async getAstronomicalSettings(): Promise<{
    azimuthTolerance: number;
    elevationTolerance: number;
    searchInterval: number;
    sunAngularDiameter: number;
    moonAngularDiameter: number;
  }> {
    // キャッシュを更新
    if (Date.now() - this.lastCacheUpdate.getTime() > this.CACHE_DURATION) {
      await this.refreshCache();
    }

    return {
      azimuthTolerance: await this.getNumberSetting("azimuth_tolerance", 0.05),
      elevationTolerance: await this.getNumberSetting(
        "elevation_tolerance",
        0.05,
      ),
      searchInterval: await this.getNumberSetting("search_interval", 10),
      sunAngularDiameter: await this.getNumberSetting(
        "sun_angular_diameter",
        0.53,
      ),
      moonAngularDiameter: await this.getNumberSetting(
        "moon_angular_diameter",
        0.52,
      ),
    };
  }

  /**
   * パフォーマンス設定を一括取得（負荷制御用）
   */
  async getPerformanceSettings(): Promise<{
    workerConcurrency: number;
    jobDelay: number;
    processingDelay: number;
    enableLowPriorityMode: boolean;
    maxActiveJobs: number;
  }> {
    // キャッシュを更新
    if (Date.now() - this.lastCacheUpdate.getTime() > this.CACHE_DURATION) {
      await this.refreshCache();
    }

    return {
      workerConcurrency: await this.getNumberSetting("worker_concurrency", 1),
      jobDelay: await this.getNumberSetting("job_delay_ms", 5000),
      processingDelay: await this.getNumberSetting("processing_delay_ms", 2000),
      enableLowPriorityMode: await this.getBooleanSetting("enable_low_priority_mode", true),
      maxActiveJobs: await this.getNumberSetting("max_active_jobs", 3),
    };
  }

  /**
   * パフォーマンス設定を初期化
   */
  async initializePerformanceSettings(): Promise<void> {
    const defaultSettings = [
      { key: "worker_concurrency", value: 1, type: "number", description: "各ワーカープロセス内での同時実行ジョブ数。2 台のワーカーで値が 2 なら、システム全体で最大 4 ジョブが並列実行される" },
      { key: "job_delay_ms", value: 5000, type: "number", description: "ジョブ実行間隔（ミリ秒）" },
      { key: "processing_delay_ms", value: 2000, type: "number", description: "処理間の待機時間（ミリ秒）" },
      { key: "enable_low_priority_mode", value: true, type: "boolean", description: "低優先度モードの有効化" },
      { key: "max_active_jobs", value: 3, type: "number", description: "システム全体で同時実行可能なジョブの上限数。ワーカー数に関係なく、この値を超えるジョブは待機状態になる" },
    ];

    for (const setting of defaultSettings) {
      try {
        // 既存の設定があるかチェック
        const existing = await this.repository.getByKey(setting.key);

        if (!existing) {
          await this.repository.upsert(setting.key, setting.value, setting.description);

          logger.info("パフォーマンス設定を初期化", {
            settingKey: setting.key,
            value: setting.value,
            type: setting.type,
          });
        }
      } catch (error) {
        logger.error("パフォーマンス設定初期化エラー", { 
          settingKey: setting.key, 
          error 
        });
      }
    }

    // キャッシュをリフレッシュ
    await this.refreshCache();
  }

  /**
   * SystemSetting オブジェクトから実際の値を抽出
   */
  private extractSettingValue(setting: any): string {
    switch (setting.settingType) {
      case "number":
        return String(setting.numberValue);
      case "boolean":
        return String(setting.booleanValue);
      case "string":
      default:
        return setting.stringValue || "";
    }
  }
}
