import React, { useState, useEffect, useMemo } from 'react';
import { Icon } from '@skytree-photo-planner/ui';
import { Location } from '@skytree-photo-planner/types';
import { authService } from '../../services/authService';
import { getComponentLogger } from '@skytree-photo-planner/utils';

const logger = getComponentLogger('Dashboard');

// Types
interface QueueStats {
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  enabled: boolean;
}

interface DashboardProps {
  locations: Location[];
}

const Dashboard: React.FC<DashboardProps> = ({ locations }) => {
  // State
  const [queueStats, setQueueStats] = useState<QueueStats | null>(null);

  // Effects
  useEffect(() => {
    const fetchQueueStats = async () => {
      try {
        const response = await authService.authenticatedFetch('/api/admin/queue/stats');
        if (response.ok) {
          const data = await response.json();
          setQueueStats(data);
        }
      } catch (error) {
        logger.error('キュー統計取得エラー', error as Error);
        setQueueStats(null);
      }
    };

    fetchQueueStats();
    // 5 秒間隔で更新
    const interval = setInterval(fetchQueueStats, 5000);
    return () => clearInterval(interval);
  }, []);

  // Computed values
  const stats = useMemo(() => {
    if (!Array.isArray(locations)) {
      return {
        totalLocations: 0,
        prefectures: 0,
        avgDistance: '0.0',
        recentAdditions: 0,
      };
    }

    const totalLocations = locations.length;
    const prefectures = new Set(locations.map((l) => l.prefecture || 'その他')).size;
    const avgDistance =
      locations.length > 0
        ? locations.reduce((sum, l) => sum + (l.distanceToSkytree || 0), 0) /
          locations.length /
          1000
        : 0;

    return {
      totalLocations,
      prefectures,
      avgDistance: avgDistance.toFixed(1),
      recentAdditions: locations.filter((l) => {
        const createdAt = new Date(l.createdAt);
        const weekAgo = new Date();
        weekAgo.setDate(weekAgo.getDate() - 7);
        return createdAt > weekAgo;
      }).length,
    };
  }, [locations]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="pt-2">
        <h1 className="text-2xl font-bold text-gray-900">ダッシュボード</h1>
        <p className="text-gray-600 mt-1">
          システム全体の状況を確認できます
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white rounded-lg p-4 shadow-sm border">
          <div className="flex items-center">
            <div className="w-12 h-12 bg-blue-50 border border-blue-200 rounded-lg flex items-center justify-center mr-3">
              <Icon name="location" size={24} className="text-blue-600" />
            </div>
            <div className="flex-1">
              <p className="text-sm text-gray-500">総撮影地点数</p>
              <p className="text-2xl font-bold text-gray-900">
                {stats.totalLocations}
              </p>
              <p className="text-xs text-gray-500">
                有効: 0 件, 制限: 0 件
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg p-4 shadow-sm border">
          <div className="flex items-center">
            <div className="w-12 h-12 bg-green-50 border border-green-200 rounded-lg flex items-center justify-center mr-3">
              <Icon name="queue" size={24} className="text-green-600" />
            </div>
            <div className="flex-1">
              <p className="text-sm text-gray-500">計算キュー</p>
              <p className="text-2xl font-bold text-gray-900">
                {queueStats?.waiting || 0}
              </p>
              <p className="text-xs text-gray-500">
                処理中: {queueStats?.active || 0} 件, 完了:{' '}
                {queueStats?.completed || 0} 件
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg p-4 shadow-sm border">
          <div className="flex items-center">
            <div className="w-12 h-12 bg-yellow-50 border border-yellow-200 rounded-lg flex items-center justify-center mr-3">
              <Icon name="clock" size={24} className="text-yellow-600" />
            </div>
            <div className="flex-1">
              <p className="text-sm text-gray-500">イベントキュー</p>
              <p className="text-2xl font-bold text-gray-900">0</p>
              <p className="text-xs text-gray-500">
                待機: 0 件, 処理中: 0 件
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg p-4 shadow-sm border">
          <div className="flex items-center">
            <div className="w-12 h-12 bg-purple-50 border border-purple-200 rounded-lg flex items-center justify-center mr-3">
              <Icon name="users" size={24} className="text-purple-600" />
            </div>
            <div className="flex-1">
              <p className="text-sm text-gray-500">管理者数</p>
              <p className="text-2xl font-bold text-gray-900">1</p>
              <p className="text-xs text-gray-500">スーパー管理者: 1 人</p>
            </div>
          </div>
        </div>
      </div>

      {/* System Status Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Left Side - Queue System */}
        <div>
          <div className="bg-white rounded-lg p-6 shadow-sm border">
            {/* タイトル */}
            <div className="flex items-center mb-6">
              <div className="w-8 h-8 flex items-center justify-center mr-3">
                <Icon name="server" size={20} className="text-blue-600" />
              </div>
              <h2 className="text-lg font-semibold text-gray-900">
                キューシステム状況
              </h2>
            </div>
            
            {/* 撮影計算キュー */}
            <div className="mb-6">
              <div className="flex justify-between items-center mb-3">
                <h3 className="text-sm font-medium text-gray-900">
                  撮影計算キュー
                </h3>
                <div className="text-sm text-gray-500">
                  {(queueStats?.waiting || 0) + (queueStats?.active || 0)} 件 処理予定
                </div>
              </div>
              <div className="grid grid-cols-4 gap-6">
                <div className="text-center">
                  <div className="text-sm text-orange-600">
                    {queueStats?.waiting || 0}
                  </div>
                  <div className="text-xs text-gray-500">待機</div>
                </div>
                <div className="text-center">
                  <div className="text-sm text-blue-600">
                    {queueStats?.active || 0}
                  </div>
                  <div className="text-xs text-gray-500">処理中</div>
                </div>
                <div className="text-center">
                  <div className="text-sm text-green-600">
                    {queueStats?.completed || 0}
                  </div>
                  <div className="text-xs text-gray-500">完了</div>
                </div>
                <div className="text-center">
                  <div className="text-sm text-red-600">
                    {queueStats?.failed || 0}
                  </div>
                  <div className="text-xs text-gray-500">失敗</div>
                </div>
              </div>
            </div>

            {/* キュー詳細情報 */}
            <div>
              <div className="bg-gray-50 rounded-lg p-4">
                <h3 className="text-sm font-medium text-gray-900 mb-2">
                  処理の種類
                </h3>
                <div className="space-y-1 text-xs text-gray-600">
                  <p>
                    • <strong>地点計算</strong>:
                    各地点の年間ダイヤモンドスカイツリー・パールスカイツリーデータ生成
                  </p>
                  <p>
                    • <strong>月間計算</strong>:
                    複数地点の月間イベント一括計算
                  </p>
                </div>
                {queueStats?.enabled && (
                  <div className="mt-3 pt-3 border-t border-gray-200">
                    <div className="text-xs text-gray-500">
                      Redis: <span className="text-green-600">接続中</span>
                      {queueStats.failed > 0 && (
                        <span className="ml-2 text-red-600">
                          失敗ジョブ {queueStats.failed} 件
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Right Side - System Info */}
        <div>
          <div className="bg-white rounded-lg shadow-sm border">
            <div className="p-6 space-y-4">
              {/* タイトル */}
              <div className="flex items-center mb-6">
                <div className="w-8 h-8 flex items-center justify-center mr-3">
                  <Icon name="data" size={20} className="text-green-600" />
                </div>
                <h2 className="text-lg font-semibold text-gray-900">
                  システム情報
                </h2>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">アプリケーション</span>
                <span className="text-sm text-gray-900 font-medium">
                  Skytree Photo Planner v{import.meta.env.APP_VERSION}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">環境</span>
                <span className="text-sm text-gray-900">開発環境</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">認証システム</span>
                <div className="flex items-center space-x-1">
                  <Icon name="checkCircle" size={14} className="text-green-600" />
                  <span className="text-xs text-green-600">正常稼働</span>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">キューシステム</span>
                <div className="flex items-center space-x-1">
                  <Icon name="checkCircle" size={14} className="text-green-600" />
                  <span className="text-xs text-green-600">正常稼働</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="text-center pt-8">
        <p className="text-xs text-gray-500">
          最終更新:{' '}
          {new Date().toLocaleString('ja-JP', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false,
          }).replace(
            /(\d{4})\/(\d{2})\/(\d{2}) (\d{2}):(\d{2}):(\d{2})/,
            '$1/$2/$3 $4:$5:$6'
          )}
        </p>
      </div>
    </div>
  );
};

export default Dashboard;