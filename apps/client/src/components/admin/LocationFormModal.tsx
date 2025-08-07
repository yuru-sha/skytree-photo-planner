import React, { useState } from 'react';
import { Location } from '@skytree-photo-planner/types';
import LocationPicker from '../LocationPicker';
import { Icon } from '@skytree-photo-planner/ui';
import { uiLogger } from '../../utils/logger';

// Types
export interface LocationFormData {
  name: string;
  prefecture: string;
  latitude: number | '';
  longitude: number | '';
  elevation: number | '';
  description: string;
  accessInfo: string;
  parkingInfo: string;
  // スカイツリー関連（任意入力）
  azimuthToSkytree: number | '';
  elevationToSkytree: number | '';
  distanceToSkytree: number | '';
  measurementNotes: string;
}

// Constants
export const initialFormData: LocationFormData = {
  name: '',
  prefecture: '',
  latitude: '',
  longitude: '',
  elevation: '',
  description: '',
  accessInfo: '',
  parkingInfo: '',
  // スカイツリー関連（任意入力）
  azimuthToSkytree: '',
  elevationToSkytree: '',
  distanceToSkytree: '',
  measurementNotes: '',
};

const PREFECTURES = [
  '茨城県',
  '埼玉県',
  '千葉県',
  '東京都',
  '神奈川県',
  '山梨県',
  '長野県',
  '静岡県',
  '三重県',
  '奈良県',
  '和歌山県',
] as const;

interface LocationFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  formData: LocationFormData;
  editingLocation: Location | null;
  loading: boolean;
  onSubmit: (e: React.FormEvent) => void;
  onFormDataChange: (field: keyof LocationFormData, value: string | number) => void;
}

const LocationFormModal: React.FC<LocationFormModalProps> = ({
  isOpen,
  onClose,
  formData,
  editingLocation,
  loading,
  onSubmit,
  onFormDataChange,
}) => {
  const [showLocationPicker, setShowLocationPicker] = useState(false);

  // Handlers
  const handleLocationSelect = async (lat: number, lng: number) => {
    onFormDataChange('latitude', lat);
    onFormDataChange('longitude', lng);
    
    // 標高も自動取得
    try {
      const response = await fetch(
        `https://cyberjapandata2.gsi.go.jp/general/dem/scripts/getelevation.php?lon=${lng}&lat=${lat}&outtype=JSON`
      );
      
      if (response.ok) {
        const data = await response.json();
        const elevation = data.elevation;
        
        if (elevation !== null && elevation !== undefined) {
          onFormDataChange('elevation', Math.round(elevation));
        }
      }
    } catch (error) {
      uiLogger.warn('標高取得エラー', error as Error);
    }
    
    setShowLocationPicker(false);
  };

  const handleNumberInputChange = (
    field: keyof LocationFormData,
    value: string
  ) => {
    onFormDataChange(field, value === '' ? '' : parseFloat(value));
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
      <div className="relative top-20 mx-auto p-5 border w-full max-w-2xl shadow-lg rounded-md bg-white">
        <div className="border-b border-gray-200 px-6 py-4 -m-5 mb-6">
          <h2 className="text-xl font-bold text-gray-900">
            {editingLocation ? '地点編集' : '新規地点追加'}
          </h2>
        </div>
        <div className="px-6">
          <form onSubmit={onSubmit} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  地点名 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => onFormDataChange('name', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="例: 竜ヶ岳"
                  aria-label="地点名"
                  aria-required="true"
                  aria-describedby="name-error"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  都道府県 <span className="text-red-500">*</span>
                </label>
                <select
                  value={formData.prefecture}
                  onChange={(e) => onFormDataChange('prefecture', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  aria-label="都道府県"
                  aria-required="true"
                  aria-describedby="prefecture-error"
                  required
                >
                  <option value="">選択してください</option>
                  {PREFECTURES.map((prefecture) => (
                    <option key={prefecture} value={prefecture}>
                      {prefecture}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  緯度 <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  step="0.000001"
                  value={formData.latitude === '' ? '' : formData.latitude}
                  onChange={(e) => handleNumberInputChange('latitude', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="35.123456"
                  aria-label="緯度"
                  aria-required="true"
                  aria-describedby="latitude-error"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  経度 <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  step="0.000001"
                  value={formData.longitude === '' ? '' : formData.longitude}
                  onChange={(e) => handleNumberInputChange('longitude', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="138.123456"
                  aria-label="経度"
                  aria-required="true"
                  aria-describedby="longitude-error"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  標高 (m) <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  step="0.1"
                  value={formData.elevation === '' ? '' : formData.elevation}
                  onChange={(e) => handleNumberInputChange('elevation', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="1000.5"
                  aria-label="標高"
                  aria-required="true"
                  aria-describedby="elevation-error"
                  required
                />
              </div>
            </div>

            <div className="text-center">
              <button
                type="button"
                onClick={() => setShowLocationPicker(true)}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors flex items-center space-x-2 mx-auto focus:ring-2 focus:ring-blue-500 focus:outline-none"
                aria-label="地図から座標を選択"
              >
                <Icon name="map" size={16} color="white" />
                <span>地図から座標を選択</span>
              </button>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                説明
              </label>
              <textarea
                value={formData.description}
                onChange={(e) => onFormDataChange('description', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                rows={3}
                placeholder="地点の特徴や撮影時の注意点など"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  アクセス情報
                </label>
                <textarea
                  value={formData.accessInfo}
                  onChange={(e) => onFormDataChange('accessInfo', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                  rows={2}
                  placeholder="最寄り駅、バス停、道路からのアクセス方法など"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  駐車場情報
                </label>
                <textarea
                  value={formData.parkingInfo}
                  onChange={(e) => onFormDataChange('parkingInfo', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                  rows={2}
                  placeholder="駐車場の有無、台数、料金など"
                />
              </div>
            </div>

            {/* スカイツリー視線情報（詳細設定） */}
            <div className="border-t border-gray-200 pt-6">
              <div className="mb-4">
                <h3 className="text-sm font-medium text-gray-900 mb-2">
                  スカイツリー視線情報（任意）
                </h3>
                <p className="text-xs text-gray-500">
                  現地で実測された値があれば入力してください。未入力の場合は理論値を自動計算します。
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    方位角（度）
                  </label>
                  <input
                    type="number"
                    step="0.001"
                    value={
                      formData.azimuthToSkytree === ''
                        ? ''
                        : formData.azimuthToSkytree
                    }
                    onChange={(e) => handleNumberInputChange('azimuthToSkytree', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="例: 78.728（自動計算）"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    仰角（度）
                  </label>
                  <input
                    type="number"
                    step="0.001"
                    value={
                      formData.elevationToSkytree === ''
                        ? ''
                        : formData.elevationToSkytree
                    }
                    onChange={(e) => handleNumberInputChange('elevationToSkytree', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="例: 3.61（実測推奨）"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    距離（m）
                  </label>
                  <input
                    type="number"
                    step="1"
                    value={
                      formData.distanceToSkytree === ''
                        ? ''
                        : formData.distanceToSkytree
                    }
                    onChange={(e) => handleNumberInputChange('distanceToSkytree', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="例: 17700（自動計算）"
                  />
                </div>
              </div>

              <div className="mt-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  測定方法・備考
                </label>
                <input
                  type="text"
                  value={formData.measurementNotes}
                  onChange={(e) =>
                    onFormDataChange('measurementNotes', e.target.value)
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="例: スーパー地形で確認"
                />
              </div>
            </div>

            <div className="flex items-center justify-end space-x-4 pt-6 border-t border-gray-200">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 transition-colors"
              >
                キャンセル
              </button>
              <button
                type="submit"
                disabled={loading}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {loading ? '保存中...' : editingLocation ? '更新' : '追加'}
              </button>
            </div>
          </form>

          {showLocationPicker && (
            <LocationPicker
              onLocationSelect={handleLocationSelect}
              initialLat={(formData.latitude as number) || 35.7100069}
              initialLng={(formData.longitude as number) || 139.8108103}
              onClose={() => setShowLocationPicker(false)}
            />
          )}
        </div>
      </div>
    </div>
  );
};

export default LocationFormModal;