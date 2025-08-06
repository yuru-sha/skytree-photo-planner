import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useFavorites } from "../hooks/useFavorites";
import { timeUtils } from "@skytree-photo-planner/utils";
import { Icon } from "@skytree-photo-planner/ui";
import { getLocationNearby } from "../utils/geocoding";
import { uiLogger } from "../utils/logger";
import { FavoriteEvent } from "@skytree-photo-planner/types";

const FavoritesPage: React.FC = () => {
  const navigate = useNavigate();
  const {
    favoriteLocations,
    favoriteEvents,
    upcomingFavoriteEvents,
    stats,
    removeLocationFromFavorites,
    removeEventFromFavorites,
    clearAllFavorites,
    exportFavorites,
    importFavorites,
  } = useFavorites();

  const [activeTab, setActiveTab] = useState<"upcoming" | "past" | "locations">(
    "upcoming",
  );
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [importData, setImportData] = useState("");
  const [locationAddresses, setLocationAddresses] = useState<Map<number, string>>(new Map());

  // 過去のイベントを取得
  const pastEvents = favoriteEvents
    .filter((event) => new Date(event.time) <= new Date())
    .reverse(); // 最新から順番に
    
  // デバッグログ
  uiLogger.debug('FavoritesPage データ:', {
    upcomingEventsCount: upcomingFavoriteEvents.length,
    pastEventsCount: pastEvents.length
  });

  const handleSelectItem = (id: string) => {
    const newSelected = new Set(selectedItems);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedItems(newSelected);
  };

  const handleSelectAll = () => {
    const allIds = new Set<string>();
    if (activeTab === "upcoming") {
      upcomingFavoriteEvents.forEach((event) => allIds.add(`event-${event.id}`));
    } else if (activeTab === "past") {
      pastEvents.forEach((event) => allIds.add(`event-${event.id}`));
    } else {
      favoriteLocations.forEach((location) =>
        allIds.add(`location-${location.id}`),
      );
    }
    setSelectedItems(allIds);
  };

  const handleDeselectAll = () => {
    setSelectedItems(new Set());
  };

  const handleDeleteSelected = () => {
    const eventIds: string[] = [];
    const locationIds: number[] = [];

    selectedItems.forEach((id) => {
      if (id.startsWith("event-")) {
        eventIds.push(id.replace("event-", ""));
      } else if (id.startsWith("location-")) {
        locationIds.push(parseInt(id.replace("location-", "")));
      }
    });

    if (eventIds.length > 0 || locationIds.length > 0) {
      const confirmMessage = `選択した ${eventIds.length} 個のイベントと ${locationIds.length} 個の地点を削除しますか？`;
      if (confirm(confirmMessage)) {
        eventIds.forEach((eventId) => removeEventFromFavorites(eventId));
        locationIds.forEach((locationId) =>
          removeLocationFromFavorites(locationId),
        );
        setSelectedItems(new Set());
      }
    }
  };

  const handleExport = () => {
    exportFavorites();
  };

  const handleImport = () => {
    try {
      const success = importFavorites(importData);
      if (success) {
        alert("インポートが完了しました");
        setShowImportDialog(false);
        setImportData("");
      } else {
        alert("インポートに失敗しました");
      }
    } catch (error) {
      alert(`インポートエラー: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const formatEventDate = (time: string | Date) => {
    const date = typeof time === "string" ? new Date(time) : time;
    return date.toLocaleDateString("ja-JP", {
      year: "numeric",
      month: "short",
      day: "numeric",
      weekday: "short",
    });
  };

  const formatEventTime = (time: string | Date) => {
    const date = typeof time === "string" ? new Date(time) : time;
    return date.toLocaleTimeString("ja-JP", {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const handleViewEventDetail = (event: FavoriteEvent) => {
    const eventDate = new Date(event.time);
    const dateString = timeUtils.formatDateString(eventDate);

    navigate(`/?date=${dateString}`, {
      state: {
        selectedDate: eventDate,
        selectedLocationId: event.locationId,
        selectedEventId: event.id,
      },
    });
  };

  const handleViewLocationDetail = (locationId: number) => {
    navigate(`/location/${locationId}`);
  };

  const handleGoogleMapsClick = (lat: number, lng: number) => {
    const googleMapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
    window.open(googleMapsUrl, "_blank");
  };

  // 計算地点用の住所取得（非同期処理）
  React.useEffect(() => {
    const loadAddresses = async () => {
      const addressMap = new Map<number, string>();
      
      // 計算地点（ID < 0）の住所を取得
      for (const location of favoriteLocations.filter(loc => loc.id < 0)) {
        try {
          const nearby = await getLocationNearby(location.latitude, location.longitude);
          if (nearby) {
            addressMap.set(location.id, nearby);
          }
        } catch (error) {
          uiLogger.warn('住所取得エラー', error as Error, { locationId: location.id });
        }
      }
      
      setLocationAddresses(addressMap);
    };

    if (favoriteLocations.some(loc => loc.id < 0)) {
      loadAddresses();
    }
  }, [favoriteLocations]);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto p-8">
        {/* ヘッダーカード */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
          <div className="flex justify-between items-start mb-6">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 mb-2 flex items-center">
                <Icon name="star" size={24} className="mr-3 text-yellow-500" />
                お気に入り管理
              </h1>
              <p className="text-gray-600">保存済みの撮影地点とイベントを管理します</p>
            </div>
            
            {/* 統計情報 */}
            <div className="flex gap-6">
              <div className="text-center">
                <div className="text-2xl font-bold text-blue-600">{stats.totalLocations}</div>
                <div className="text-sm text-gray-500">保存地点</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-green-600">{stats.upcomingEvents}</div>
                <div className="text-sm text-gray-500">今後のイベント</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-gray-600">{stats.pastEvents}</div>
                <div className="text-sm text-gray-500">過去のイベント</div>
              </div>
            </div>
          </div>

          {/* タブとアクション */}
          <div className="flex justify-between items-center border-t border-gray-200 pt-6">
            <div className="flex gap-1">
              <button
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  activeTab === "upcoming"
                    ? "bg-blue-100 text-blue-700 border border-blue-200"
                    : "text-gray-600 hover:text-gray-800 hover:bg-gray-100"
                }`}
                onClick={() => setActiveTab("upcoming")}
              >
                今後のイベント ({stats.upcomingEvents})
              </button>
              <button
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  activeTab === "past"
                    ? "bg-blue-100 text-blue-700 border border-blue-200"
                    : "text-gray-600 hover:text-gray-800 hover:bg-gray-100"
                }`}
                onClick={() => setActiveTab("past")}
              >
                過去のイベント ({stats.pastEvents})
              </button>
              <button
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  activeTab === "locations"
                    ? "bg-blue-100 text-blue-700 border border-blue-200"
                    : "text-gray-600 hover:text-gray-800 hover:bg-gray-100"
                }`}
                onClick={() => setActiveTab("locations")}
              >
                保存地点 ({stats.totalLocations})
              </button>
            </div>

            <div className="flex gap-2">
              <button 
                className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-md transition-colors"
                onClick={handleSelectAll}
              >
                全選択
              </button>
              <button 
                className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-md transition-colors"
                onClick={handleDeselectAll}
              >
                選択解除
              </button>
              <button
                className="px-3 py-1.5 text-sm bg-red-600 text-white hover:bg-red-700 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                onClick={handleDeleteSelected}
                disabled={selectedItems.size === 0}
              >
                <Icon name="trash" size={14} className="mr-1 inline" />
                選択削除 ({selectedItems.size})
              </button>
              <button 
                className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-md transition-colors border border-gray-200"
                onClick={handleExport}
              >
                <Icon name="download" size={14} className="mr-1 inline" />
                エクスポート
              </button>
              <button
                className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-md transition-colors border border-gray-200"
                onClick={() => setShowImportDialog(true)}
              >
                <Icon name="upload" size={14} className="mr-1 inline" />
                インポート
              </button>
              <button
                className="px-3 py-1.5 text-sm bg-red-600 text-white hover:bg-red-700 rounded-md transition-colors"
                onClick={() => {
                  if (
                    confirm(
                      "全てのお気に入りデータを削除します。この操作は取り消せません。本当に削除しますか？",
                    )
                  ) {
                    clearAllFavorites();
                  }
                }}
              >
                <Icon name="trash" size={14} className="mr-1 inline" />
                全削除
              </button>
            </div>
          </div>
        </div>

        {/* コンテンツカード */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200">
          {activeTab === "upcoming" && (
            <div className="p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                <Icon name="calendar" size={18} className="mr-2 text-blue-600" />
                今後の撮影イベント
              </h2>
              {upcomingFavoriteEvents.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  <Icon name="calendar" size={48} className="mx-auto mb-4 text-gray-300" />
                  <p className="text-lg">今後のお気に入りイベントはありません</p>
                  <p className="text-sm mt-2">ホームページから撮影イベントをお気に入りに追加してください</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {upcomingFavoriteEvents.map((event) => (
                    <div key={event.id} className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50 transition-colors">
                      <div className="flex items-start gap-4">
                        <input
                          type="checkbox"
                          checked={selectedItems.has(`event-${event.id}`)}
                          onChange={() => handleSelectItem(`event-${event.id}`)}
                          className="mt-1 h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                        />
                        
                        <div className="flex-shrink-0">
                          <Icon
                            name={event.type === "diamond" ? "sun" : "moon"}
                            size={40}
                            className={`${
                              event.type === "diamond" ? "text-orange-500" : "text-blue-500"
                            }`}
                          />
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between">
                            <div>
                              <h3 className="text-lg font-medium text-gray-900">
                                {event.subType === "sunrise" || event.subType === "rising" ? "昇る" : "沈む"}
                                {event.type === "diamond" ? "ダイヤモンドスカイツリー" : "パールスカイツリー"}
                              </h3>
                              <p className="text-sm text-gray-600 mt-1">
                                {formatEventDate(event.time)} {formatEventTime(event.time)}
                              </p>
                              <p className="text-sm text-gray-600 mt-1 flex items-center">
                                <Icon name="mapPin" size={14} className="mr-1" />
                                {event.locationId < 0 
                                  ? (locationAddresses.get(event.locationId) || event.locationName)
                                  : event.locationName}
                              </p>
                              <p className="text-xs text-gray-500 font-mono mt-1">
                                座標: {(() => {
                                  if (event.locationId < 0) {
                                    const favoriteLocation = favoriteLocations.find(loc => loc.id === event.locationId);
                                    return favoriteLocation 
                                      ? `緯度 ${favoriteLocation.latitude.toFixed(6)}°, 経度 ${favoriteLocation.longitude.toFixed(6)}°`
                                      : "座標データなし";
                                  }
                                  // 通常地点の場合は locationLatitude/locationLongitude を使用
                                  return (event.locationLatitude && event.locationLongitude)
                                    ? `緯度 ${event.locationLatitude.toFixed(6)}°, 経度 ${event.locationLongitude.toFixed(6)}°`
                                    : "座標データなし";
                                })()}
                              </p>
                            </div>
                            
                            <div className="flex gap-2 ml-4">
                              <button
                                className="px-3 py-1.5 text-sm bg-blue-600 text-white hover:bg-blue-700 rounded-md transition-colors"
                                onClick={() => handleViewEventDetail(event)}
                              >
                                <Icon name="eye" size={14} className="mr-1 inline" />
                                詳細
                              </button>
                              <button
                                className="px-3 py-1.5 text-sm bg-red-50 text-red-600 hover:bg-red-100 rounded-md transition-colors border border-red-200"
                                onClick={() => removeEventFromFavorites(event.id)}
                              >
                                <Icon name="trash" size={14} className="mr-1 inline" />
                                削除
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === "past" && (
            <div className="p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                <Icon name="calendar" size={18} className="mr-2 text-blue-600" />
                過去の撮影イベント
              </h2>
              {pastEvents.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  <Icon name="history" size={48} className="mx-auto mb-4 text-gray-300" />
                  <p className="text-lg">過去のお気に入りイベントはありません</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {pastEvents.map((event) => (
                    <div key={event.id} className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50 transition-colors">
                      <div className="flex items-start gap-4">
                        <input
                          type="checkbox"
                          checked={selectedItems.has(`event-${event.id}`)}
                          onChange={() => handleSelectItem(`event-${event.id}`)}
                          className="mt-1 h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                        />
                        
                        <div className="flex-shrink-0">
                          <Icon
                            name={event.type === "diamond" ? "sun" : "moon"}
                            size={40}
                            className={`${
                              event.type === "diamond" ? "text-orange-500" : "text-blue-500"
                            }`}
                          />
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between">
                            <div>
                              <h3 className="text-lg font-medium text-gray-900">
                                {event.subType === "sunrise" || event.subType === "rising" ? "昇る" : "沈む"}
                                {event.type === "diamond" ? "ダイヤモンドスカイツリー" : "パールスカイツリー"}
                              </h3>
                              <p className="text-sm text-gray-600 mt-1">
                                {formatEventDate(event.time)} {formatEventTime(event.time)}
                              </p>
                              <p className="text-sm text-gray-600 mt-1 flex items-center">
                                <Icon name="mapPin" size={14} className="mr-1" />
                                {event.locationId < 0 
                                  ? (locationAddresses.get(event.locationId) || event.locationName)
                                  : event.locationName}
                              </p>
                              <p className="text-xs text-gray-500 font-mono mt-1">
                                座標: {(() => {
                                  if (event.locationId < 0) {
                                    const favoriteLocation = favoriteLocations.find(loc => loc.id === event.locationId);
                                    return favoriteLocation 
                                      ? `緯度 ${favoriteLocation.latitude.toFixed(6)}°, 経度 ${favoriteLocation.longitude.toFixed(6)}°`
                                      : "座標データなし";
                                  }
                                  // 通常地点の場合は locationLatitude/locationLongitude を使用
                                  return (event.locationLatitude && event.locationLongitude)
                                    ? `緯度 ${event.locationLatitude.toFixed(6)}°, 経度 ${event.locationLongitude.toFixed(6)}°`
                                    : "座標データなし";
                                })()}
                              </p>
                            </div>
                            
                            <div className="flex gap-2 ml-4">
                              <button
                                className="px-3 py-1.5 text-sm bg-gray-100 text-gray-600 hover:bg-gray-200 rounded-md transition-colors"
                                onClick={() => handleViewEventDetail(event)}
                              >
                                <Icon name="eye" size={14} className="mr-1 inline" />
                                詳細
                              </button>
                              <button
                                className="px-3 py-1.5 text-sm bg-red-50 text-red-600 hover:bg-red-100 rounded-md transition-colors border border-red-200"
                                onClick={() => removeEventFromFavorites(event.id)}
                              >
                                <Icon name="trash" size={14} className="mr-1 inline" />
                                削除
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === "locations" && (
            <div className="p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                <Icon name="mapPin" size={18} className="mr-2 text-green-600" />
                保存地点
              </h2>
              {favoriteLocations.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  <Icon name="mapPin" size={48} className="mx-auto mb-4 text-gray-300" />
                  <p className="text-lg">お気に入り地点はありません</p>
                  <p className="text-sm mt-2">地図から地点をお気に入りに追加してください</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {favoriteLocations.map((location) => (
                    <div key={location.id} className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50 transition-colors">
                      <div className="flex items-start gap-4">
                        <input
                          type="checkbox"
                          checked={selectedItems.has(`location-${location.id}`)}
                          onChange={() => handleSelectItem(`location-${location.id}`)}
                          className="mt-1 h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                        />
                        
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between">
                            <div>
                              <h3 className="text-lg font-medium text-gray-900 flex items-center">
                                <Icon name="mapPin" size={16} className="mr-2 text-black" />
                                {location.id < 0 
                                  ? (locationAddresses.has(location.id) 
                                      ? locationAddresses.get(location.id)
                                      : `計算地点 (${location.latitude.toFixed(4)}°, ${location.longitude.toFixed(4)}°)`
                                    )
                                  : location.name}
                              </h3>
                              <p className="text-xs text-gray-500 font-mono mt-1">
                                座標: 緯度 {location.latitude.toFixed(6)}°, 経度 {location.longitude.toFixed(6)}°
                              </p>
                              <p className="text-xs text-gray-500 mt-1">
                                追加日: {new Date(location.addedAt).toLocaleDateString("ja-JP")}
                              </p>
                            </div>
                            
                            <div className="flex gap-2 ml-4">
                              <button
                                className="px-3 py-1.5 text-sm bg-blue-600 text-white hover:bg-blue-700 rounded-md transition-colors"
                                onClick={() => handleViewLocationDetail(location.id)}
                              >
                                <Icon name="eye" size={14} className="mr-1 inline" />
                                詳細
                              </button>
                              <button
                                className="px-3 py-1.5 text-sm bg-green-50 text-green-700 hover:bg-green-100 rounded-md transition-colors border border-green-200"
                                onClick={() => handleGoogleMapsClick(location.latitude, location.longitude)}
                              >
                                <Icon name="route" size={14} className="mr-1 inline" />
                                経路案内
                              </button>
                              <button
                                className="px-3 py-1.5 text-sm bg-red-50 text-red-600 hover:bg-red-100 rounded-md transition-colors border border-red-200"
                                onClick={() => removeLocationFromFavorites(location.id)}
                              >
                                <Icon name="trash" size={14} className="mr-1 inline" />
                                削除
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* インポートダイアログ */}
        {showImportDialog && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-lg w-full max-w-2xl max-h-screen overflow-hidden">
              <div className="flex items-center justify-between p-6 border-b border-gray-200">
                <h3 className="text-lg font-semibold text-gray-900">データインポート</h3>
                <button
                  onClick={() => setShowImportDialog(false)}
                  className="text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <Icon name="x" size={20} />
                </button>
              </div>
              
              <div className="p-6 max-h-96 overflow-y-auto">
                <div className="mb-6">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    ファイルから読み込み
                  </label>
                  <input
                    type="file"
                    accept=".json"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        const reader = new FileReader();
                        reader.onload = (event) => {
                          setImportData(event.target?.result as string);
                        };
                        reader.readAsText(file);
                      }
                    }}
                  />
                </div>
                
                <div className="mb-6">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    または直接貼り付け
                  </label>
                  <textarea
                    value={importData}
                    onChange={(e) => setImportData(e.target.value)}
                    placeholder="JSON 形式のデータを貼り付けてください"
                    rows={10}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 font-mono text-sm resize-vertical"
                  />
                </div>
              </div>
              
              <div className="flex justify-end gap-3 p-6 border-t border-gray-200 bg-gray-50">
                <button
                  onClick={() => setShowImportDialog(false)}
                  className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-md transition-colors"
                >
                  キャンセル
                </button>
                <button
                  onClick={handleImport}
                  disabled={!importData.trim()}
                  className="px-4 py-2 text-sm bg-green-600 text-white hover:bg-green-700 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  インポート
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default FavoritesPage;