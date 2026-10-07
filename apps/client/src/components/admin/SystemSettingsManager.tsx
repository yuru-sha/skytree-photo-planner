import React, { useState, useEffect } from 'react';
import { Icon } from '@skytree-photo-planner/ui';
import { authService } from '../../services/authService';
import { getComponentLogger } from '@skytree-photo-planner/utils';

const logger = getComponentLogger('SystemSettingsManager');

// Types
interface SystemSetting {
  id: number;
  settingKey: string;
  settingType: 'number' | 'string' | 'boolean';
  value: string | number | boolean;
  description?: string;
  editable: boolean;
  updatedAt: string;
}

interface SystemSettingsData {
  success: boolean;
  settings: Record<string, SystemSetting[]>;
  meta: {
    totalSettings: number;
    categories: string[];
    lastUpdate: string;
  };
}

interface PerformanceSettings {
  workerConcurrency: number;
  jobDelayMs: number;
  processingDelayMs: number;
  enableLowPriorityMode: boolean;
  maxActiveJobs: number;
}

interface CategoryDisplayInfo {
  name: string;
  description: string;
  icon: keyof typeof import('@skytree-photo-planner/ui').iconMap;
  color: string;
}

// Constants
const categoryInfo: Record<string, CategoryDisplayInfo> = {
  astronomical: {
    name: '天体計算設定',
    description: 'ダイヤモンドスカイツリー・パールスカイツリーの計算精度に関する設定',
    icon: 'sun',
    color: 'blue',
  },
  performance: {
    name: 'パフォーマンス設定',
    description: 'システムの性能とキャッシュに関する設定',
    icon: 'rocket',
    color: 'green',
  },
  ui: {
    name: 'UI 設定',
    description: 'ユーザーインターフェースの表示に関する設定',
    icon: 'palette',
    color: 'purple',
  },
};

// Components
interface SettingInputProps {
  setting: SystemSetting;
  value: string | number | boolean;
  onChange: (value: string | number | boolean) => void;
  disabled: boolean;
}

const SettingInput: React.FC<SettingInputProps> = ({
  setting,
  value,
  onChange,
  disabled,
}) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;

    switch (setting.settingType) {
      case 'number':
        onChange(newValue === '' ? '' : parseFloat(newValue));
        break;
      case 'boolean':
        onChange(e.target.checked);
        break;
      case 'string':
      default:
        onChange(newValue);
        break;
    }
  };

  if (setting.settingType === 'boolean') {
    return (
      <label className='inline-flex items-center'>
        <input
          type='checkbox'
          checked={Boolean(value)}
          onChange={handleChange}
          disabled={disabled || !setting.editable}
          className='form-checkbox h-4 w-4 text-blue-600'
        />
        <span className='ml-2 text-sm text-gray-700'>{value ? '有効' : '無効'}</span>
      </label>
    );
  }

  return (
    <input
      type={setting.settingType === 'number' ? 'number' : 'text'}
      value={String(value || '')}
      onChange={handleChange}
      disabled={disabled || !setting.editable}
      step={setting.settingType === 'number' ? 'any' : undefined}
      className='w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50'
      placeholder={setting.editable ? '値を入力' : '読み取り専用'}
    />
  );
};

// メインコンポーネント
const SystemSettingsManager: React.FC = () => {
  const [settingsData, setSettingsData] = useState<SystemSettingsData | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editedValues, setEditedValues] = useState<Record<string, string | number | boolean>>({});
  const [expandedCategories, setExpandedCategories] = useState<
    Record<string, boolean>
  >({});

  // パフォーマンス管理の状態
  const [performanceSettings, setPerformanceSettings] = useState<PerformanceSettings>({
    workerConcurrency: 1,
    jobDelayMs: 5000,
    processingDelayMs: 2000,
    enableLowPriorityMode: true,
    maxActiveJobs: 3,
  });

  // 設定を読み込む
  const loadSettings = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await authService.authenticatedFetch(
        '/api/admin/system-settings',
      );

      if (!response.ok) {
        throw new Error(`設定の取得に失敗しました: ${response.status}`);
      }

      const data: SystemSettingsData = await response.json();
      setSettingsData(data);

      // 全カテゴリを最初に展開
      const initialExpanded: Record<string, boolean> = {};
      data.meta.categories.forEach((category) => {
        initialExpanded[category] = true;
      });
      setExpandedCategories(initialExpanded);
    } catch (err) {
      logger.error('設定読み込みエラー', err as Error);
      setError(
        err instanceof Error ? err.message : '設定の読み込みに失敗しました',
      );
    } finally {
      setLoading(false);
    }
  };

  // パフォーマンス設定を読み込む
  const loadPerformanceSettings = async () => {
    try {
      // システム設定から直接パフォーマンス設定を読み込む
      if (settingsData) {
        const performanceSettings = settingsData.settings.performance || [];
        
        const newSettings: PerformanceSettings = {
          workerConcurrency: Number(performanceSettings.find(s => s.settingKey === 'worker_concurrency')?.value) || 1,
          jobDelayMs: Number(performanceSettings.find(s => s.settingKey === 'job_delay_ms')?.value) || 5000,
          processingDelayMs: Number(performanceSettings.find(s => s.settingKey === 'processing_delay_ms')?.value) || 2000,
          enableLowPriorityMode: Boolean(performanceSettings.find(s => s.settingKey === 'enable_low_priority_mode')?.value) ?? true,
          maxActiveJobs: Number(performanceSettings.find(s => s.settingKey === 'max_active_jobs')?.value) || 3,
        };
        
        setPerformanceSettings(newSettings);
        logger.debug('パフォーマンス設定をロード', { newSettings });
      }
    } catch (err) {
      logger.warn('パフォーマンス設定の読み込みに失敗', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  };



  // パフォーマンス設定値の変更
  const handlePerformanceSettingChange = (key: keyof PerformanceSettings, value: string | number | boolean) => {
    setPerformanceSettings(prev => ({ ...prev, [key]: value }));
    
    // パフォーマンス設定のキーマッピング
    const settingKeyMap = {
      workerConcurrency: 'worker_concurrency',
      maxActiveJobs: 'max_active_jobs',
      jobDelayMs: 'job_delay_ms',
      processingDelayMs: 'processing_delay_ms',
      enableLowPriorityMode: 'enable_low_priority_mode'
    };
    
    // editedValues も更新して保存ボタンを表示させる
    const settingKey = settingKeyMap[key];
    if (settingKey) {
      setEditedValues(prev => ({
        ...prev,
        [settingKey]: value
      }));
    }
  };

  // 設定を保存する
  const saveSettings = async () => {
    if (Object.keys(editedValues).length === 0) {
      return;
    }

    try {
      setSaving(true);
      setError(null);

      const settingsToUpdate = Object.entries(editedValues).map(
        ([settingKey, value]) => ({
          settingKey,
          value,
        }),
      );

      const response = await authService.authenticatedFetch(
        '/api/admin/system-settings',
        {
          method: 'PUT',
          body: JSON.stringify({ settings: settingsToUpdate }),
        },
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          errorData.message || `設定の保存に失敗しました: ${response.status}`,
        );
      }

      const result = await response.json();

      if (result.success) {
        // 成功時は編集状態をクリアして再読み込み
        setEditedValues({});
        await loadSettings();

        // 成功メッセージ表示
        alert(`${result.summary.success} 件の設定を更新しました`);
      } else {
        throw new Error(result.message || '設定の保存に失敗しました');
      }
    } catch (err) {
      logger.error('設定保存エラー', err as Error);
      setError(err instanceof Error ? err.message : '設定の保存に失敗しました');
    } finally {
      setSaving(false);
    }
  };

  // キャッシュクリア
  const clearCache = async () => {
    if (
      !confirm(
        'すべてのキャッシュをクリアします。この操作は取り消せません。続行しますか？',
      )
    ) {
      return;
    }

    try {
      setSaving(true);

      const response = await authService.authenticatedFetch(
        '/api/admin/system-settings/clear-cache',
        {
          method: 'POST',
        },
      );

      if (!response.ok) {
        throw new Error(`キャッシュクリアに失敗しました: ${response.status}`);
      }

      const result = await response.json();
      if (result.success) {
        alert('キャッシュをクリアしました');
        await loadSettings(); // 設定を再読み込み
      } else {
        throw new Error(result.message || 'キャッシュクリアに失敗しました');
      }
    } catch (err) {
      logger.error('キャッシュクリアエラー', err as Error);
      setError(
        err instanceof Error ? err.message : 'キャッシュクリアに失敗しました',
      );
    } finally {
      setSaving(false);
    }
  };

  // 編集値を更新
  const handleValueChange = (settingKey: string, value: string | number | boolean) => {
    setEditedValues((prev) => ({
      ...prev,
      [settingKey]: value,
    }));
  };

  // 変更をリセット
  const resetChanges = () => {
    setEditedValues({});
    setError(null);
  };

  // カテゴリの展開状態を切り替え
  const toggleCategory = (category: string) => {
    setExpandedCategories((prev) => ({
      ...prev,
      [category]: !prev[category],
    }));
  };

  // 初期読み込み
  useEffect(() => {
    loadSettings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // settingsData が更新されたらパフォーマンス設定も更新
  useEffect(() => {
    if (settingsData) {
      loadPerformanceSettings();
    }
  }, [settingsData]);

  if (loading) {
    return (
      <div className='flex items-center justify-center min-h-96'>
        <div className='text-center'>
          <div className='animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2'></div>
          <span className='text-gray-600'>設定を読み込み中...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className='bg-red-50 border border-red-200 rounded-lg p-6'>
        <div className='flex items-start space-x-3'>
          <Icon name='x' size={20} className='text-red-600 mt-0.5' />
          <div>
            <h3 className='text-sm font-medium text-red-800'>
              エラーが発生しました
            </h3>
            <p className='text-sm text-red-700 mt-1'>{error}</p>
          </div>
        </div>
        <div className='mt-4'>
          <button
            onClick={loadSettings}
            className='px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500'
          >
            再試行
          </button>
        </div>
      </div>
    );
  }

  if (!settingsData) {
    return (
      <div className='text-center py-12'>
        <Icon
          name='fileX'
          size={48}
          className='text-gray-400 mx-auto mb-4'
        />
        <p className='text-gray-600'>設定データがありません</p>
      </div>
    );
  }

  const hasChanges = Object.keys(editedValues).length > 0;

  return (
    <div className='space-y-6'>
      {/* ヘッダー */}
      <div className='bg-white rounded-lg shadow-sm p-6 border border-gray-200'>
        <div className='flex items-center justify-between'>
          <div>
            <h2 className='text-2xl font-bold text-gray-900'>システム設定</h2>
            <p className='text-gray-600 mt-1'>
              アプリケーションの動作設定を管理します
            </p>
          </div>
          <div className='flex items-center space-x-3'>
            <button
              onClick={clearCache}
              disabled={saving}
              className='px-4 py-2 bg-gray-600 hover:bg-gray-700 disabled:opacity-50 text-white rounded-md font-medium flex items-center space-x-2'
            >
              <Icon name='refresh' size={16} />
              <span>キャッシュクリア</span>
            </button>
            {hasChanges && (
              <>
                <button
                  onClick={resetChanges}
                  disabled={saving}
                  className='px-4 py-2 bg-gray-200 hover:bg-gray-300 disabled:opacity-50 text-gray-800 rounded-md font-medium'
                >
                  変更を破棄
                </button>
                <button
                  onClick={saveSettings}
                  disabled={saving}
                  className='px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-md font-medium flex items-center space-x-2'
                >
                  {saving ? (
                    <>
                      <div className='animate-spin rounded-full h-4 w-4 border-b-2 border-white'></div>
                      <span>保存中...</span>
                    </>
                  ) : (
                    <>
                      <Icon name='save' size={16} />
                      <span>変更を保存</span>
                    </>
                  )}
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* 設定一覧 */}
      <div className='space-y-4'>
        {settingsData.meta.categories.map((category) => {
          const info = categoryInfo[category] || {
            name: category,
            description: `${category} カテゴリの設定`,
            icon: 'settings' as const,
            color: 'gray',
          };

          const settings = settingsData.settings[category] || [];
          const isExpanded = expandedCategories[category];

          return (
            <div
              key={category}
              className='bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden'
            >
              {/* カテゴリヘッダー */}
              <button
                onClick={() => toggleCategory(category)}
                className='w-full px-6 py-4 bg-white hover:bg-gray-50 transition-colors duration-200 flex items-center justify-between'
              >
                <div className='flex items-center space-x-4'>
                  <div
                    className={`w-10 h-10 bg-${info.color}-50 border border-${info.color}-200 rounded-lg flex items-center justify-center`}
                  >
                    <Icon
                      name={info.icon}
                      size={20}
                      className={`text-${info.color}-600`}
                    />
                  </div>
                  <div>
                    <h3 className='text-lg font-medium text-gray-900'>
                      {info.name}
                    </h3>
                    <p className='text-sm text-gray-600 mt-0.5'>{info.description}</p>
                    <p className='text-xs text-gray-500 mt-1'>
                      {settings.length} 件の設定
                    </p>
                  </div>
                </div>
                <Icon
                  name={isExpanded ? 'chevronUp' : 'chevronDown'}
                  size={20}
                  className='text-gray-400'
                />
              </button>

              {/* 設定項目 */}
              {isExpanded && (
                <div className='px-6 py-4 bg-gray-50 border-t border-gray-200'>
                  <div className='space-y-4'>
                    {/* パフォーマンスカテゴリの場合は特別な UI */}
                    {category === 'performance' && (
                      <div className='space-y-6 bg-blue-50 p-6 rounded-lg border border-blue-200'>
                        {/* ワーカー同時実行数 */}
                        <div className='space-y-4'>
                          <h4 className='text-base font-semibold text-blue-900 mb-4'>
                            🎯 コア負荷制御設定
                          </h4>
                          
                          {/* ワーカー同時実行数 */}
                          <div>
                            <label className='block text-sm font-medium text-gray-700 mb-2'>
                              worker_concurrency (各ワーカーの同時実行数)
                            </label>
                            <p className='text-xs text-orange-600 bg-orange-50 p-2 rounded mb-3'>
                              ⚠️ 設定変更後はワーカーの再起動が必要です (docker-compose restart worker)
                            </p>
                          <div className='flex items-center space-x-4'>
                            <input
                              type='range'
                              min='1'
                              max='8'
                              value={performanceSettings.workerConcurrency}
                              onChange={(e) => handlePerformanceSettingChange('workerConcurrency', parseInt(e.target.value))}
                              className='flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer'
                            />
                            <span className='bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm font-medium min-w-[3rem] text-center'>
                              {performanceSettings.workerConcurrency}
                            </span>

                          </div>
                          <p className='text-xs text-gray-600 mt-2'>
                            各ワーカープロセス内での並列度。ワーカー 2 台×値 2 なら最大 4 ジョブ並列実行
                          </p>
                          </div>

                          {/* 最大アクティブジョブ数 */}
                          <div>
                            <label className='block text-sm font-medium text-gray-700 mb-2'>
                              max_active_jobs (システム全体の上限)
                            </label>
                            <div className='flex items-center space-x-4'>
                              <input
                                type='range'
                                min='1'
                                max='20'
                                value={performanceSettings.maxActiveJobs}
                                onChange={(e) => handlePerformanceSettingChange('maxActiveJobs', parseInt(e.target.value))}
                                className='flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer'
                              />
                              <span className='bg-green-100 text-green-800 px-3 py-1 rounded-full text-sm font-medium min-w-[3rem] text-center'>
                                {performanceSettings.maxActiveJobs}
                              </span>
                            </div>
                            <p className='text-xs text-gray-600 mt-2'>
                              ワーカー数に関係なく、システム全体で同時実行可能なジョブの総数制限
                            </p>
                          </div>
                        </div>

                        {/* 重要なパフォーマンス設定の説明 */}
                        <div className='bg-yellow-50 p-4 rounded-lg border border-yellow-200'>
                          <h4 className='text-sm font-semibold text-yellow-800 mb-3'>
                            🔧 重要な設定項目の違い
                          </h4>
                          <div className='space-y-3'>
                            <div>
                              <strong>worker_concurrency (各ワーカーの同時実行数)</strong>
                              <p className='text-xs text-yellow-700'>• 各ワーカープロセス内で同時に動くジョブ数</p>
                              <p className='text-xs text-yellow-700'>• ワーカーが 2 台で値が 2 なら、システム全体で最大 4 ジョブが並列実行</p>
                            </div>
                            <div>
                              <strong>max_active_jobs (システム全体の上限)</strong>
                              <p className='text-xs text-yellow-700'>• ワーカー数に関係なく、システム全体で同時実行可能なジョブの総数</p>
                              <p className='text-xs text-yellow-700'>• この値を超えるジョブは待機状態になる（優先制御）</p>
                            </div>
                          </div>
                        </div>

                        {/* 推奨設定 */}
                        <div className='bg-green-50 p-4 rounded-lg border border-green-200'>
                          <h4 className='text-sm font-semibold text-green-800 mb-3'>
                            パフォーマンス改善のための推奨設定
                          </h4>
                          <div className='space-y-1'>
                            <div className='text-xs text-green-700'>• <strong>低負荷モード:</strong> 同時実行数=1, ジョブ間隔=10 秒, 処理待機=5 秒</div>
                            <div className='text-xs text-green-700'>• <strong>標準モード:</strong> 同時実行数=2, ジョブ間隔=5 秒, 処理待機=2 秒</div>
                            <div className='text-xs text-green-700'>• <strong>高性能モード:</strong> 同時実行数=3, ジョブ間隔=3 秒, 処理待機=1 秒</div>
                          </div>
                        </div>
                      </div>
                    )}
                    
                    {/* 通常の設定項目 */}
                    {settings
                      .filter((setting) => {
                        // パフォーマンスカテゴリーの場合、特別 UI で表示している項目は除外
                        if (category === 'performance') {
                          const excludedKeys = ['worker_concurrency', 'max_active_jobs', 'job_delay_ms', 'processing_delay_ms', 'enable_low_priority_mode', 'cache_ttl'];
                          return !excludedKeys.includes(setting.settingKey);
                        }
                        return true;
                      })
                      .map((setting) => {
                      const currentValue = Object.prototype.hasOwnProperty.call(
                        editedValues,
                        setting.settingKey,
                      )
                        ? editedValues[setting.settingKey]
                        : setting.value;

                      const hasChanged = Object.prototype.hasOwnProperty.call(
                        editedValues,
                        setting.settingKey,
                      );

                      return (
                        <div
                          key={setting.id}
                          className={`p-4 rounded-lg border transition-colors ${
                            hasChanged
                              ? 'bg-blue-50 border-blue-200'
                              : 'bg-white border-gray-200'
                          }`}
                        >
                          <div className='flex items-start justify-between'>
                            <div className='flex-1 pr-4'>
                              <div className='flex items-center space-x-2 mb-1'>
                                <h4 className='text-sm font-medium text-gray-900'>
                                  {setting.settingKey}
                                </h4>
                                {!setting.editable && (
                                  <span className='inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-600'>
                                    読み取り専用
                                  </span>
                                )}
                                {hasChanged && (
                                  <span className='inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-700'>
                                    変更済み
                                  </span>
                                )}
                              </div>
                              {setting.description && (
                                <p className='text-xs text-gray-600 mt-1'>
                                  {setting.description}
                                </p>
                              )}
                              <div className='text-xs text-gray-500 mt-2'>
                                型: {setting.settingType} | 最終更新: 
                                {new Date(setting.updatedAt).toLocaleString(
                                  'ja-JP',
                                )}
                              </div>
                            </div>
                            <div className='w-64 flex-shrink-0'>
                              <SettingInput
                                setting={setting}
                                value={currentValue}
                                onChange={(value) =>
                                  handleValueChange(setting.settingKey, value)
                                }
                                disabled={saving}
                              />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* フッター情報 */}
      <div className='bg-gray-50 rounded-lg p-4 border border-gray-200'>
        <div className='flex items-center justify-between text-sm text-gray-600'>
          <span>
            総設定数: {settingsData.meta.totalSettings} 件 (
            {settingsData.meta.categories.length} カテゴリ)
          </span>
          <span>
            最終更新: 
            {new Date(settingsData.meta.lastUpdate).toLocaleString('ja-JP')}
          </span>
        </div>
      </div>
    </div>
  );
};

export default SystemSettingsManager;
