import { useState, useCallback } from 'react';
import { Location } from '@skytree-photo-planner/types';
import { getComponentLogger } from '@skytree-photo-planner/utils';

const logger = getComponentLogger('useLocationData');

export const useLocationData = () => {
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(false);

  const loadLocations = useCallback(async () => {
    try {
      setLoading(true);
      
      // 管理画面用の認証付きエンドポイントを使用
      const response = await fetch('/api/admin/locations', {
        method: 'GET',
        credentials: 'include',
      });
      
      if (response.ok) {
        const data = await response.json();
        if (data.success && Array.isArray(data.locations)) {
          setLocations(data.locations);
        } else {
          logger.error('不正な API レスポンス形式', new Error(JSON.stringify(data)));
          setLocations([]);
        }
      } else if (response.status === 401) {
        // 認証エラーの場合は空配列を設定
        logger.warn('認証が必要です');
        setLocations([]);
      } else {
        logger.error('地点の読み込み失敗', new Error(`HTTP ${response.status}`));
        setLocations([]);
      }
    } catch (error) {
      logger.error('地点の読み込み失敗', error as Error);
      setLocations([]);
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    locations,
    loading,
    loadLocations,
  };
};