import React, { useState, useMemo } from 'react';
import { flushSync } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { Location } from '@skytree-photo-planner/types';
import LocationFormModal, { LocationFormData, initialFormData } from './LocationFormModal';
import { Icon } from '@skytree-photo-planner/ui';
import { authService } from '../../services/authService';
import { getComponentLogger } from '@skytree-photo-planner/utils';

const logger = getComponentLogger('LocationManager');

// Types
interface LocationManagerProps {
  locations: Location[];
  onLocationsChange: () => void;
}

const LocationManager: React.FC<LocationManagerProps> = ({ 
  locations, 
  onLocationsChange 
}) => {
  // State
  const navigate = useNavigate();
  const [formData, setFormData] = useState<LocationFormData>(initialFormData);
  const [editingLocation, setEditingLocation] = useState<Location | null>(null);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterPrefecture, setFilterPrefecture] = useState('');
  const [showLocationForm, setShowLocationForm] = useState(false);

  // Event handlers
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const url = editingLocation
        ? `/api/admin/locations/${editingLocation.id}`
        : '/api/admin/locations';
      const method = editingLocation ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          name: formData.name,
          prefecture: formData.prefecture,
          latitude: formData.latitude,
          longitude: formData.longitude,
          elevation: formData.elevation,
          description: formData.description,
          accessInfo: formData.accessInfo,
          parkingInfo: formData.parkingInfo,
          azimuthToSkytree: formData.azimuthToSkytree,
          elevationToSkytree: formData.elevationToSkytree,
          distanceToSkytree: formData.distanceToSkytree,
          measurementNotes: formData.measurementNotes,
        }),
      });

      if (response.ok) {
        onLocationsChange();
        resetForm();
        // React の状態更新を同期的に実行し、適切な状態管理を行う
        flushSync(() => {
          setShowLocationForm(false);
        });
      } else if (response.status === 401) {
        navigate('/admin/login');
      } else {
        const errorData = await response.text();
        logger.error('地点保存エラー', new Error(`${response.status}: ${errorData}`));
      }
    } catch (error) {
      logger.error('地点保存エラー', error as Error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (location: Location) => {
    if (!confirm(`「${location.name}」を削除しますか？`)) return;

    try {
      const response = await fetch(`/api/admin/locations/${location.id}`, {
        method: 'DELETE',
        headers: {
          ...authService.getAuthHeaders(),
        },
        credentials: 'include',
      });

      if (response.ok) {
        onLocationsChange();
      } else if (response.status === 401) {
        navigate('/admin/login');
      }
    } catch (error) {
      logger.error('地点削除エラー', error as Error);
    }
  };

  const handleEdit = (location: Location) => {
    setEditingLocation(location);
    setFormData({
      name: location.name,
      prefecture: location.prefecture || '',
      latitude: location.latitude,
      longitude: location.longitude,
      elevation: location.elevation,
      description: location.description || '',
      accessInfo: location.accessInfo || '',
      parkingInfo: location.parkingInfo || '',
      // スカイツリー関連（既存値または空文字）
      azimuthToSkytree: location.azimuthToSkytree || '',
      elevationToSkytree: location.elevationToSkytree || '',
      distanceToSkytree: location.distanceToSkytree || '',
      measurementNotes: location.measurementNotes || '',
    });
    setShowLocationForm(true);
  };

  const handleRecalculate = async (location: Location) => {
    if (
      !confirm(
        `「${location.name}」の 2025 年データを再計算しますか？\n\n 処理に時間がかかる場合があります。`,
      )
    )
      return;

    try {
      setLoading(true);
      const response = await authService.authenticatedFetch(
        '/api/admin/queue/recalculate-location',
        {
          method: 'POST',
          body: JSON.stringify({
            locationId: location.id,
            startYear: 2025,
            endYear: 2025,
            priority: 'high',
          }),
        },
      );

      if (response.ok) {
        const data = await response.json();
        alert(
          `再計算ジョブを追加しました！\n\n ジョブ ID: ${data.jobId}\n\n キュー管理画面で進行状況を確認できます。`,
        );
      } else {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          errorData.message || '再計算ジョブの追加に失敗しました',
        );
      }
    } catch (error) {
      logger.error('再計算エラー', error as Error);
      alert(
        `再計算中にエラーが発生しました: ${error instanceof Error ? error.message : '不明なエラー'}`,
      );
    } finally {
      setLoading(false);
    }
  };

  const handleRecalculateAllLocations = async () => {
    if (
      !confirm(
        `全地点のスカイツリー関連データを再計算しますか？\n\n 対象: ${locations.length}地点\n 処理に時間がかかる場合があります。`,
      )
    )
      return;

    try {
      setLoading(true);
      
      // まず、全地点のスカイツリー関連データを null で更新（再計算フラグ）
      const updatePromises = locations.map(async (location) => {
        const response = await authService.authenticatedFetch(
          `/api/admin/locations/${location.id}`,
          {
            method: 'PUT',
            body: JSON.stringify({
              azimuthToSkytree: null,
              elevationToSkytree: null,
              distanceToSkytree: null,
            }),
          },
        );
        
        if (!response.ok) {
          logger.error(`地点 ${location.name} の更新に失敗`, new Error(await response.text()));
        }
        return response.ok;
      });

      const updateResults = await Promise.all(updatePromises);
      const successfulUpdates = updateResults.filter(Boolean).length;

      // 地点リストを再読み込み
      onLocationsChange();

      alert(
        `再計算完了！\n\n 成功: ${successfulUpdates}/${locations.length}地点\n\n スカイツリー関連データが最新の計算ロジックで更新されました。`,
      );
    } catch (error) {
      logger.error('全地点再計算エラー', error as Error);
      alert(
        `再計算中にエラーが発生しました: ${error instanceof Error ? error.message : '不明なエラー'}`,
      );
    } finally {
      setLoading(false);
    }
  };

  // Utility functions
  const resetForm = () => {
    setFormData(initialFormData);
    setEditingLocation(null);
  };

  const handleFormDataChange = (
    field: keyof LocationFormData,
    value: string | number,
  ) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };


  const handleExportLocations = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/admin/locations/export', {
        method: 'GET',
        headers: {
          ...authService.getAuthHeaders(),
        },
        credentials: 'include',
      });

      if (response.status === 401) {
        authService.clearAuth();
        navigate('/admin/login');
        return;
      }

      if (!response.ok) {
        throw new Error('エクスポートに失敗しました');
      }

      const blob = await response.blob();

      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `locations_export_${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      logger.error('エクスポートエラー', error as Error);
      alert('エクスポートに失敗しました。');
    } finally {
      setLoading(false);
    }
  };

  const handleImportLocations = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      setLoading(true);
      const text = await file.text();
      const data = JSON.parse(text);

      if (!Array.isArray(data)) {
        throw new Error('無効なファイル形式です。配列形式の JSON が必要です。');
      }

      const response = await fetch('/api/admin/locations/import', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(data),
      });

      if (response.status === 401) {
        // 認証エラーの場合はログインページにリダイレクト
        authService.clearAuth();
        navigate('/admin/login');
        return;
      }

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          errorData.message ||
            `HTTP ${response.status}: インポートに失敗しました`,
        );
      }

      const result = await response.json();

      if (result.success) {
        const { createdCount, updatedCount, errorCount } = result.summary;
        let message = `インポートが完了しました。\n`;
        message += `新規作成: ${createdCount}件\n`;
        message += `更新: ${updatedCount}件\n`;
        if (errorCount > 0) {
          message += `エラー: ${errorCount}件`;
        }
        alert(message);
        onLocationsChange(); // リストを更新
      } else {
        throw new Error(result.message || 'インポートに失敗しました');
      }
    } catch (error) {
      logger.error('インポートエラー', error as Error);
      alert(
        `インポートに失敗しました: ${error instanceof Error ? error.message : '不明なエラー'}`,
      );
    } finally {
      setLoading(false);
      // ファイル入力をリセット
      event.target.value = '';
    }
  };

  // Computed values
  const filteredLocations = useMemo(() => {
    if (!Array.isArray(locations)) {
      return [];
    }
    return locations.filter((location) => {
      const matchesSearch = location.name
        .toLowerCase()
        .includes(searchTerm.toLowerCase());
      const matchesPrefecture =
        !filterPrefecture || (location.prefecture || 'その他') === filterPrefecture;
      return matchesSearch && matchesPrefecture;
    });
  }, [locations, searchTerm, filterPrefecture]);

  return (
    <>
      <div className="space-y-6">
        {/* Header with Add Button */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              撮影地点管理
            </h1>
            <p className="text-gray-600 mt-1">
              撮影地点の追加・編集・削除を行います。エクスポート/インポート機能では、ID がある地点は更新、ない地点は新規登録されます。
            </p>
          </div>
          <div className="flex items-center space-x-3">
            <button
              onClick={handleExportLocations}
              className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors flex items-center space-x-2"
            >
              <Icon name="download" size={16} color="white" />
              <span>エクスポート</span>
            </button>
            <button
              onClick={() =>
                document.getElementById('import-file')?.click()
              }
              className="px-4 py-2 bg-orange-600 text-white rounded-md hover:bg-orange-700 transition-colors flex items-center space-x-2"
            >
              <Icon name="upload" size={16} color="white" />
              <span>インポート</span>
            </button>
            <input
              id="import-file"
              type="file"
              accept=".json"
              onChange={handleImportLocations}
              className="hidden"
            />
            <button
              onClick={handleRecalculateAllLocations}
              disabled={loading}
              className="px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 disabled:bg-gray-400 transition-colors flex items-center space-x-2"
            >
              <Icon name="calculator" size={16} color="white" />
              <span>{loading ? '計算中...' : '全地点再計算'}</span>
            </button>
            <button
              onClick={() => {
                resetForm();
                setShowLocationForm(true);
              }}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors flex items-center space-x-2"
            >
              <Icon name="add" size={16} color="white" />
              <span>新規地点追加</span>
            </button>
          </div>
        </div>

        {/* Search and Filter */}
        <div className="bg-white rounded-lg shadow-sm p-6 border">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                地点を検索
              </label>
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="地点名で検索..."
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                都道府県で絞り込み
              </label>
              <select
                value={filterPrefecture}
                onChange={(e) => setFilterPrefecture(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="">すべて</option>
                <option value="静岡県">静岡県</option>
                <option value="山梨県">山梨県</option>
                <option value="神奈川県">神奈川県</option>
                <option value="東京都">東京都</option>
                <option value="千葉県">千葉県</option>
                <option value="埼玉県">埼玉県</option>
                <option value="長野県">長野県</option>
                <option value="茨城県">茨城県</option>
                <option value="奈良県">奈良県</option>
                <option value="三重県">三重県</option>
                <option value="和歌山県">和歌山県</option>
              </select>
            </div>
          </div>
        </div>

        {/* Location List */}
        {filteredLocations.length === 0 ? (
          <div className="bg-white rounded-lg shadow-sm p-12 text-center border">
            <div className="mb-4 opacity-20">
              <Icon name="location" size={96} className="mx-auto" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              地点が見つかりません
            </h3>
            <p className="text-gray-500">
              検索条件を変更するか、新しい地点を追加してください。
            </p>
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow-sm overflow-hidden border">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    地点名
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    都道府県
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    座標
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    標高
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    スカイツリーまでの距離
                  </th>
                  <th className="relative px-6 py-3">
                    <span className="sr-only">操作</span>
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredLocations.map((location) => (
                  <tr key={location.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">
                        {location.name}
                      </div>
                      {location.description && (
                        <div className="text-sm text-gray-500 truncate max-w-xs">
                          {location.description}
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-blue-100 text-blue-800">
                        {location.prefecture || 'その他'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {location.latitude.toFixed(6)},{' '}
                      {location.longitude.toFixed(6)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {location.elevation}m
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {((location.distanceToSkytree || 0) / 1000).toFixed(1)}km
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <button
                        onClick={() => handleRecalculate(location)}
                        disabled={loading}
                        className="text-green-600 hover:text-green-900 mr-3 disabled:opacity-50"
                        title="2025 年データを再計算"
                      >
                        <Icon
                          name="refresh"
                          size={16}
                          className="inline mr-1"
                        />
                        再計算
                      </button>
                      <button
                        onClick={() => handleEdit(location)}
                        className="text-blue-600 hover:text-blue-900 mr-3"
                      >
                        編集
                      </button>
                      <button
                        onClick={() => handleDelete(location)}
                        className="text-red-600 hover:text-red-900"
                      >
                        削除
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <LocationFormModal
        isOpen={showLocationForm}
        onClose={() => {
          resetForm();
          setShowLocationForm(false);
        }}
        formData={formData}
        editingLocation={editingLocation}
        loading={loading}
        onSubmit={handleSubmit}
        onFormDataChange={handleFormDataChange}
      />
    </>
  );
};

export default LocationManager;