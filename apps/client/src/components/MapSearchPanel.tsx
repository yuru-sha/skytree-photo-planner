import React, { useState, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Icon } from "@skytree-photo-planner/ui";
import { mapLogger } from "../utils/logger";

// 検索モード定義
export type SearchMode = "auto" | "fast" | "balanced" | "precise";

// 撮影シーン定義
export type ShootingScene = "all" | "diamond" | "pearl";

// 検索パラメータの型定義
export interface MapSearchParams {
  // 地点情報
  latitude: number;
  longitude: number;
  elevation: number;
  
  // 検索条件
  scene: ShootingScene;
  searchMode: SearchMode;
  
  // 検索範囲
  startDate: Date;
  endDate: Date;
}

// 検索結果の型定義
export interface MapSearchResult {
  id: string;
  type: "diamond" | "pearl";
  subType: "sunrise" | "sunset" | "rising" | "setting";
  time: Date;
  azimuth: number;
  elevation: number;
  accuracy: "perfect" | "excellent" | "good" | "fair";
  qualityScore: number;
  moonPhase?: number;
  moonIllumination?: number;
}

interface MapSearchPanelProps {
  isOpen: boolean;
  onClose: () => void;
  onSearch: (params: MapSearchParams) => Promise<MapSearchResult[]>;
  isSearching?: boolean;
  results?: MapSearchResult[];
}

const MapSearchPanel: React.FC<MapSearchPanelProps> = ({
  isOpen,
  onClose,
  onSearch,
  isSearching = false,
  results = [],
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);

  // 検索条件の状態管理
  const [searchParams, setSearchParams] = useState<MapSearchParams>({
    latitude: 35.7100069,
    longitude: 139.8108103,
    elevation: 0,
    scene: "all",
    searchMode: "auto",
    startDate: new Date(),
    endDate: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000), // 3 ヶ月後
  });

  // 地図の初期化
  React.useEffect(() => {
    if (!isOpen || !mapContainerRef.current || mapRef.current) return;

    // 地図を初期化
    const map = L.map(mapContainerRef.current).setView(
      [searchParams.latitude, searchParams.longitude],
      10,
    );
    mapRef.current = map;

    // 国土地理院の淡色地図タイルを使用
    L.tileLayer("https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png", {
      attribution:
        '<a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank">国土地理院</a>',
      maxZoom: 18,
    }).addTo(map);

    // スカイツリーマーカー（赤色）
    const skytreeIcon = L.icon({
      iconUrl:
        "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png",
      shadowUrl:
        "https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png",
      iconSize: [25, 41],
      iconAnchor: [12, 41],
      popupAnchor: [1, -34],
      shadowSize: [41, 41],
    });

    L.marker([35.7100069, 139.8108103], {
      icon: skytreeIcon,
    })
      .addTo(map)
      .bindPopup("東京スカイツリー");

    // 初期選択地点マーカー
    const marker = L.marker([searchParams.latitude, searchParams.longitude], {
      draggable: true,
    }).addTo(map);
    markerRef.current = marker;

    // マーカーのドラッグイベント
    marker.on("dragend", () => {
      const pos = marker.getLatLng();
      updateSearchParams({
        latitude: Number(pos.lat.toFixed(6)),
        longitude: Number(pos.lng.toFixed(6)),
      });
    });

    // 地図クリックイベント
    map.on("click", (e: L.LeafletMouseEvent) => {
      const { lat, lng } = e.latlng;
      marker.setLatLng([lat, lng]);
      updateSearchParams({
        latitude: Number(lat.toFixed(6)),
        longitude: Number(lng.toFixed(6)),
      });
    });

    // クリーンアップ
    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [isOpen]);

  // 検索パラメータの更新
  const updateSearchParams = (updates: Partial<MapSearchParams>) => {
    setSearchParams((prev) => ({ ...prev, ...updates }));
  };

  // 検索実行
  const handleSearch = async () => {
    try {
      mapLogger.info("地図検索開始", { searchParams });
      await onSearch(searchParams);
    } catch (error) {
      mapLogger.error("地図検索エラー", error as Error, { searchParams });
    }
  };

  // 検索モードの説明
  const getSearchModeDescription = (mode: SearchMode): string => {
    switch (mode) {
      case "auto":
        return "検索条件に応じて自動選択";
      case "fast":
        return "低精度・高速（期間制限なし）";
      case "balanced":
        return "中精度・中速（期間制限なし）";
      case "precise":
        return "高精度・低速（3 ヶ月限定）";
      default:
        return "";
    }
  };

  // 日付範囲の初期化（3 ヶ月デフォルト）
  const resetDateRange = () => {
    const today = new Date();
    const threeMonthsLater = new Date(today.getTime() + 90 * 24 * 60 * 60 * 1000);
    updateSearchParams({
      startDate: today,
      endDate: threeMonthsLater,
    });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full mx-4 max-h-[90vh] overflow-hidden">
        {/* ヘッダー */}
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-xl font-bold text-gray-900">
            <Icon name="search" size={20} className="inline mr-2" />
            地図検索
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
            title="閉じる"
          >
            <Icon name="x" size={24} />
          </button>
        </div>

        <div className="flex flex-col lg:flex-row h-[600px]">
          {/* 左側: 地図 */}
          <div className="flex-1 relative">
            <div
              ref={mapContainerRef}
              className="w-full h-full"
              style={{ minHeight: "300px" }}
            />
            <div className="absolute top-2 left-2 bg-white p-2 rounded shadow text-sm">
              <div>緯度: {searchParams.latitude.toFixed(6)}°</div>
              <div>経度: {searchParams.longitude.toFixed(6)}°</div>
            </div>
          </div>

          {/* 右側: 検索条件・結果 */}
          <div className="w-full lg:w-80 bg-gray-50 flex flex-col">
            <div className="p-4 overflow-y-auto flex-1">
              {/* 検索条件 */}
              <div className="space-y-4">
                <h3 className="font-semibold text-gray-900">検索条件</h3>

                {/* 標高 */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    標高 (m)
                  </label>
                  <input
                    type="number"
                    value={searchParams.elevation}
                    onChange={(e) =>
                      updateSearchParams({
                        elevation: Number(e.target.value) || 0,
                      })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="0"
                  />
                </div>

                {/* 撮影シーン */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    撮影シーン
                  </label>
                  <select
                    value={searchParams.scene}
                    onChange={(e) =>
                      updateSearchParams({
                        scene: e.target.value as ShootingScene,
                      })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="all">すべて</option>
                    <option value="diamond">ダイヤモンドスカイツリー</option>
                    <option value="pearl">パールスカイツリー</option>
                  </select>
                </div>

                {/* 検索モード */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    検索モード
                  </label>
                  <select
                    value={searchParams.searchMode}
                    onChange={(e) =>
                      updateSearchParams({
                        searchMode: e.target.value as SearchMode,
                      })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="auto">自動</option>
                    <option value="fast">高速検索</option>
                    <option value="balanced">バランス</option>
                    <option value="precise">高精度</option>
                  </select>
                  <p className="text-xs text-gray-500 mt-1">
                    {getSearchModeDescription(searchParams.searchMode)}
                  </p>
                </div>

                {/* 検索範囲 */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-sm font-medium text-gray-700">
                      検索範囲
                    </label>
                    <button
                      onClick={resetDateRange}
                      className="text-xs px-2 py-1 bg-gray-200 hover:bg-gray-300 rounded text-gray-700"
                    >
                      3 ヶ月リセット
                    </button>
                  </div>
                  <div className="space-y-2">
                    <div>
                      <label className="block text-xs text-gray-600">開始日</label>
                      <input
                        type="date"
                        value={searchParams.startDate.toISOString().split("T")[0]}
                        onChange={(e) =>
                          updateSearchParams({
                            startDate: new Date(e.target.value),
                          })
                        }
                        className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-600">終了日</label>
                      <input
                        type="date"
                        value={searchParams.endDate.toISOString().split("T")[0]}
                        onChange={(e) =>
                          updateSearchParams({
                            endDate: new Date(e.target.value),
                          })
                        }
                        className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* 検索結果 */}
              {results.length > 0 && (
                <div className="mt-6">
                  <h3 className="font-semibold text-gray-900 mb-3">
                    検索結果 ({results.length}件)
                  </h3>
                  <div className="space-y-2 max-h-40 overflow-y-auto">
                    {results.map((result) => (
                      <div
                        key={result.id}
                        className="p-2 bg-white rounded border text-sm"
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-medium">
                            {result.type === "diamond" ? "🌅" : "🌙"}{" "}
                            {result.type === "diamond"
                              ? "ダイヤモンド"
                              : "パール"}
                          </span>
                          <span className="text-xs px-1 py-0.5 bg-gray-100 rounded">
                            {result.accuracy}
                          </span>
                        </div>
                        <div className="text-xs text-gray-600">
                          {result.time.toLocaleDateString("ja-JP")} {result.time.toLocaleTimeString("ja-JP", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </div>
                        <div className="text-xs text-gray-500">
                          方位角: {result.azimuth.toFixed(1)}°, 仰角: {result.elevation.toFixed(1)}°
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* フッター: 検索ボタン */}
            <div className="p-4 border-t bg-white">
              <button
                onClick={handleSearch}
                disabled={isSearching}
                className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white rounded-md font-medium flex items-center justify-center"
              >
                {isSearching ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    検索中...
                  </>
                ) : (
                  <>
                    <Icon name="search" size={16} className="mr-2" />
                    検索実行
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MapSearchPanel;