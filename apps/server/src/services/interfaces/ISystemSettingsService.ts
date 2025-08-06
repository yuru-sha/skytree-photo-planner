/**
 * システム設定サービスのインターフェース
 * 本格版とダミー版の両方で共通利用
 */
export interface ISystemSettingsService {
  getSetting<T = unknown>(settingKey: string, defaultValue?: T): Promise<T>;
  getNumberSetting(key: string, defaultValue: number): Promise<number>;
  getStringSetting(settingKey: string, defaultValue?: string): Promise<string>;
  getBooleanSetting(settingKey: string, defaultValue?: boolean): Promise<boolean>;
  
  getPerformanceSettings(): Promise<{
    workerConcurrency: number;
    jobDelay: number;
    processingDelay: number;
    enableLowPriorityMode: boolean;
    maxActiveJobs: number;
  }>;
  
  updateSetting(key: string, value: string | number | boolean, type: string): Promise<void>;
}