import React, { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Icon } from "@skytree-photo-planner/ui";
import { useFavorites } from "../hooks/useFavorites";
import { MapPin } from "lucide-react";
import { mapLogger } from "../utils/logger";
import { apiClient } from "../services/apiClient";
import { fetchElevation } from "../utils/elevationApi";
import { reverseGeocode, generateGoogleMapsNavUrl, generateGoogleMapsViewUrl } from "../utils/geocodingApi";

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

const MapSearchPage: React.FC = () => {
  const navigate = useNavigate();
  const { addLocationToFavorites } = useFavorites();
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

  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<MapSearchResult[]>([]);
  const [isLoadingElevation, setIsLoadingElevation] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [isLocationSelected, setIsLocationSelected] = useState(false);
  const [locationAddress, setLocationAddress] = useState<string>("");
  
  // 検索結果表示用の状態
  const [currentPage, setCurrentPage] = useState(1);
  const [resultsPerPage] = useState(12);
  const [sortBy, setSortBy] = useState<"time" | "accuracy">("time");
  const [filterType, setFilterType] = useState<"all" | "diamond" | "pearl">("all");
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [addressSearchQuery, setAddressSearchQuery] = useState<string>("");
  const [isSearchingAddress, setIsSearchingAddress] = useState(false);
  
  // スカイツリーの座標
  const SKYTREE_LAT = 35.7100069;
  const SKYTREE_LNG = 139.8108103;
  const SKYTREE_HEIGHT = 634; // スカイツリーの高さ（m）


  // 地図の初期化
  React.useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

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

    // 初期選択地点マーカー（青色）
    const defaultIcon = L.icon({
      iconUrl:
        "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png",
      shadowUrl:
        "https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png",
      iconSize: [25, 41],
      iconAnchor: [12, 41],
      popupAnchor: [1, -34],
      shadowSize: [41, 41],
    });

    const marker = L.marker([searchParams.latitude, searchParams.longitude], {
      icon: defaultIcon,
      draggable: true,
    }).addTo(map);
    markerRef.current = marker;

    // マーカーのドラッグイベント
    marker.on("dragend", () => {
      const pos = marker.getLatLng();
      updateLocationWithElevation(pos.lat, pos.lng);
    });

    // 地図クリックイベント
    map.on("click", (e: L.LeafletMouseEvent) => {
      const { lat, lng } = e.latlng;
      marker.setLatLng([lat, lng]);
      updateLocationWithElevation(lat, lng);
    });

    // クリーンアップ
    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  // 検索パラメータの更新
  const updateSearchParams = (updates: Partial<MapSearchParams>) => {
    setSearchParams((prev) => ({ ...prev, ...updates }));
  };

  // 標高取得と座標更新
  const updateLocationWithElevation = async (lat: number, lng: number) => {
    try {
      setIsLoadingElevation(true);
      
      // 座標を即座に更新
      const coordinates = {
        latitude: Number(lat.toFixed(6)),
        longitude: Number(lng.toFixed(6)),
      };
      updateSearchParams(coordinates);
      setIsLocationSelected(true); // 地点選択状態を更新
      
      // 標高と住所を並行して取得
      const [elevation, address] = await Promise.all([
        fetchElevation(lat, lng),
        reverseGeocode(lat, lng)
      ]);
      
      updateSearchParams({ elevation });
      setLocationAddress(address);
      
      mapLogger.info("地点更新完了", { ...coordinates, elevation, address });
    } catch (error) {
      mapLogger.error("標高取得エラー", error as Error, { lat, lng });
    } finally {
      setIsLoadingElevation(false);
    }
  };

  // 検索実行
  const handleSearch = async () => {
    try {
      setIsSearching(true);
      setHasSearched(true);
      mapLogger.info("地図検索開始", { searchParams });

      const response = await apiClient.mapSearch({
        latitude: searchParams.latitude,
        longitude: searchParams.longitude,
        elevation: searchParams.elevation,
        scene: searchParams.scene,
        searchMode: searchParams.searchMode,
        startDate: searchParams.startDate,
        endDate: searchParams.endDate,
      });

      const results = response.events.map((event): MapSearchResult => ({
        id: event.id,
        type: event.type,
        subType: event.subType,
        time: event.time,
        azimuth: event.azimuth,
        elevation: event.elevation,
        accuracy: event.accuracy,
        qualityScore: event.qualityScore,
        moonPhase: event.moonPhase,
        moonIllumination: event.moonIllumination,
      }));

      setSearchResults(results);
      mapLogger.info("地図検索完了", { 
        totalResults: results.length,
        searchParams: response.searchParams,
        metadata: response.metadata 
      });
    } catch (error) {
      mapLogger.error("地図検索エラー", error as Error, { searchParams });
    } finally {
      setIsSearching(false);
    }
  };

  // 検索モードの説明
  const getSearchModeDescription = (mode: SearchMode): string => {
    switch (mode) {
      case "auto":
        return "検索期間に応じて最適な精度を自動選択";
      case "fast":
        return "低精度・高速（5 分間隔計算）";  
      case "balanced":
        return "中精度・中速（1 分間隔計算）";
      case "precise":
        return "高精度・低速（10 秒間隔計算、最大 3 ヶ月）";
      default:
        return "";
    }
  };

  // 方位角を東西南北表記に変換
  const getCompassDirection = (azimuth: number): string => {
    const directions = [
      "北",
      "北北東",
      "北東",
      "東北東",
      "東",
      "東南東",
      "南東",
      "南南東",
      "南",
      "南南西",
      "南西",
      "西南西",
      "西",
      "西北西",
      "北西",
      "北北西",
    ];

    // 方位角を 16 方位に変換
    const index = Math.round(azimuth / 22.5) % 16;
    return directions[index];
  };

  // 仰角の表示用フォーマット（-0.0 を 0.0 に統一）
  const formatElevation = (elevation: number): string => {
    const rounded = Math.round(elevation * 10) / 10;
    return rounded === 0 ? "0.0" : rounded.toFixed(1);
  };

  // 月相を絵文字で表示する関数
  const getMoonPhase = (moonPhase: number): { name: string; icon: string } => {
    // moonPhase は 0-360 度の値なので正規化
    const normalizedPhase = ((moonPhase % 360) + 360) % 360;

    if (normalizedPhase < 22.5 || normalizedPhase >= 337.5)
      return { name: "新月", icon: "🌑" };
    if (normalizedPhase < 67.5)
      return { name: "三日月", icon: "🌒" };
    if (normalizedPhase < 112.5)
      return { name: "上弦の月", icon: "🌓" };
    if (normalizedPhase < 157.5)
      return { name: "十三夜月", icon: "🌔" };
    if (normalizedPhase < 202.5)
      return { name: "満月", icon: "🌕" };
    if (normalizedPhase < 247.5)
      return { name: "十六夜月", icon: "🌖" };
    if (normalizedPhase < 292.5)
      return { name: "下弦の月", icon: "🌗" };
    return { name: "二十六夜月", icon: "🌘" };
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

  // 検索結果のフィルタリングとソート
  const filteredAndSortedResults = React.useMemo(() => {
    let filtered = searchResults;
    
    // タイプフィルタリング
    if (filterType !== "all") {
      filtered = filtered.filter(result => result.type === filterType);
    }
    
    // ソート
    filtered.sort((a, b) => {
      if (sortBy === "time") {
        return new Date(a.time).getTime() - new Date(b.time).getTime();
      } else if (sortBy === "accuracy") {
        const accuracyOrder = { "perfect": 4, "excellent": 3, "good": 2, "fair": 1 };
        return accuracyOrder[b.accuracy] - accuracyOrder[a.accuracy];
      }
      return 0;
    });
    
    return filtered;
  }, [searchResults, filterType, sortBy]);

  // ページネーション
  const totalPages = Math.ceil(filteredAndSortedResults.length / resultsPerPage);
  const currentResults = filteredAndSortedResults.slice(
    (currentPage - 1) * resultsPerPage,
    currentPage * resultsPerPage
  );

  // イベントタイプの表示名を取得（EventDetail と統一）
  const getEventDisplayName = (result: MapSearchResult): string => {
    const typeLabel = result.type === "diamond" ? "ダイヤモンドスカイツリー" : "パールスカイツリー";
    let subTypeLabel = "";

    if (result.type === "diamond") {
      subTypeLabel = result.subType === "sunrise" ? "昇る" : "沈む";
    } else {
      subTypeLabel = result.subType === "rising" ? "昇る" : "沈む";
    }

    return `${subTypeLabel}${typeLabel}`;
  };

  // 精度の表示名を取得
  const getAccuracyDisplayName = (accuracy: string): string => {
    const accuracyMap = {
      perfect: "完全一致",
      excellent: "非常に高精度",
      good: "高精度",
      fair: "標準精度"
    };
    return accuracyMap[accuracy as keyof typeof accuracyMap] || accuracy;
  };

  // お気に入り管理
  const toggleFavorite = (resultId: string) => {
    setFavorites(prev => {
      const newFavorites = new Set(prev);
      if (newFavorites.has(resultId)) {
        newFavorites.delete(resultId);
        mapLogger.info("お気に入り削除", { resultId });
      } else {
        newFavorites.add(resultId);
        mapLogger.info("お気に入り追加", { resultId });
      }
      return newFavorites;
    });
  };


  // 住所検索
  const handleAddressSearch = async () => {
    if (!addressSearchQuery.trim()) return;
    
    try {
      setIsSearchingAddress(true);
      mapLogger.info("住所検索開始", { query: addressSearchQuery });

      // OpenStreetMap Nominatim API を使用（無料）
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(addressSearchQuery + " 日本")}&limit=1&addressdetails=1`
      );
      
      if (!response.ok) {
        throw new Error("住所検索 API エラー");
      }

      const results = await response.json();
      
      if (results.length === 0) {
        mapLogger.warn("住所が見つかりません", new Error("Address not found"), { query: addressSearchQuery });
        alert("住所が見つかりませんでした。別の表記で試してください。");
        return;
      }

      const result = results[0];
      
      // 検索結果の精度をチェック
      const importance = result.importance || 0;
      const searchWords = addressSearchQuery.toLowerCase().split(/\s+/);
      const resultDisplay = result.display_name.toLowerCase();
      
      // 検索語が結果に含まれているかチェック
      const hasMatchingWords = searchWords.some(word => 
        word.length > 1 && resultDisplay.includes(word)
      );
      
      // 精度が低すぎる場合は警告
      if (importance < 0.3 && !hasMatchingWords) {
        mapLogger.warn("検索結果の精度が低い", new Error("Low accuracy search result"), { 
          query: addressSearchQuery, 
          result: result.display_name,
          importance 
        });
        
        const confirmResult = confirm(
          `検索結果：${result.display_name}\n\n` +
          "検索した住所と異なる可能性があります。この場所を使用しますか？"
        );
        
        if (!confirmResult) {
          return;
        }
      }

      const lat = parseFloat(result.lat);
      const lng = parseFloat(result.lon);
      
      mapLogger.info("住所検索成功", { 
        query: addressSearchQuery, 
        lat, 
        lng, 
        displayName: result.display_name 
      });

      // 地図の中心を移動
      if (mapRef.current) {
        mapRef.current.setView([lat, lng], 16);
      }

      // マーカーの位置を更新
      if (markerRef.current) {
        markerRef.current.setLatLng([lat, lng]);
      }

      // 地点を更新
      await updateLocationWithElevation(lat, lng);

    } catch (error) {
      mapLogger.error("住所検索エラー", error as Error, { query: addressSearchQuery });
      alert("住所検索中にエラーが発生しました。しばらく待ってから再試行してください。");
    } finally {
      setIsSearchingAddress(false);
    }
  };

  // お気に入り地点として保存（即座登録方式）
  const handleToggleFavoriteLocation = async () => {
    try {
      const virtualLocationId = -Date.now(); // 負の ID で仮想地点として作成
      
      // 自動で地点名を生成
      const autoName = locationAddress 
        ? `${locationAddress.split(',')[0]}の撮影地点` 
        : `撮影地点 (${searchParams.latitude.toFixed(4)}, ${searchParams.longitude.toFixed(4)})`;
      
      // useFavorites フックを使用して正しく保存
      const locationToSave = {
        id: virtualLocationId,
        name: autoName,
        prefecture: null,
        latitude: searchParams.latitude,
        longitude: searchParams.longitude,
        elevation: searchParams.elevation,
        azimuthToSkytree: null,
        elevationToSkytree: null,
        distanceToSkytree: null,
        description: null,
        accessInfo: locationAddress,
        parkingInfo: null,
        measurementNotes: null,
        status: "active" as const,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      
      const success = addLocationToFavorites(locationToSave);
      if (!success) {
        throw new Error("お気に入りの保存に失敗しました");
      }

      mapLogger.info("お気に入り地点保存", {
        id: virtualLocationId,
        name: autoName,
        coordinates: { lat: searchParams.latitude, lng: searchParams.longitude }
      });
    } catch (error) {
      mapLogger.error("お気に入り保存エラー", error as Error);
      alert("お気に入りの保存に失敗しました");
    }
  };

  // スカイツリーとの関係を計算
  const calculateSkytreeRelation = (lat: number, lng: number, elevation: number) => {
    // 距離計算（ハバーサイン公式）
    const R = 6371000; // 地球の半径（m）
    const dLat = (SKYTREE_LAT - lat) * Math.PI / 180;
    const dLng = (SKYTREE_LNG - lng) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(lat * Math.PI / 180) * Math.cos(SKYTREE_LAT * Math.PI / 180) *
              Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = R * c;

    // 方位角計算
    const y = Math.sin(dLng) * Math.cos(SKYTREE_LAT * Math.PI / 180);
    const x = Math.cos(lat * Math.PI / 180) * Math.sin(SKYTREE_LAT * Math.PI / 180) -
              Math.sin(lat * Math.PI / 180) * Math.cos(SKYTREE_LAT * Math.PI / 180) * Math.cos(dLng);
    let azimuth = Math.atan2(y, x) * 180 / Math.PI;
    azimuth = (azimuth + 360) % 360; // 0-360 度に正規化

    // 仰角計算
    const heightDiff = SKYTREE_HEIGHT - elevation; // スカイツリー頂上との高度差
    const elevationAngle = Math.atan2(heightDiff, distance) * 180 / Math.PI;

    return {
      distance: Math.round(distance),
      azimuth: Number(azimuth.toFixed(1)),
      elevation: Number(elevationAngle.toFixed(2))
    };
  };

  // 現在の地点のスカイツリー関係情報
  const skytreeRelation = React.useMemo(() => {
    if (!isLocationSelected) return null;
    return calculateSkytreeRelation(searchParams.latitude, searchParams.longitude, searchParams.elevation);
  }, [isLocationSelected, searchParams.latitude, searchParams.longitude, searchParams.elevation]);

  return (
    <div
      style={{
        backgroundColor: "#f8f9fa",
        minHeight: "100vh",
        padding: "2rem 0",
      }}
    >
      <div
        style={{
          maxWidth: "1280px",
          margin: "0 auto",
          padding: "0 1rem",
        }}
      >
        <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-4 lg:gap-6">
          {/* 左カラム: メインコンテンツ */}
          <div className="flex flex-col gap-6">
            {/* タイトルと日付検索ボタン */}
            <div className="flex justify-between items-center">
              <h1 className="text-2xl font-bold text-gray-900">
                地図検索
              </h1>
              <button
                onClick={() => navigate("/")}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md font-medium flex items-center gap-2 transition-colors"
                title="日付検索に切り替え"
              >
                <Icon name="calendar" size={16} />
                日付検索
              </button>
            </div>
            <div className="space-y-6">
              <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
                {/* 住所検索バー */}
                <div className="p-4 border-b border-gray-200 bg-gray-50">
                  <div className="flex gap-2">
                    <div className="flex-1">
                      <input
                        type="text"
                        value={addressSearchQuery}
                        onChange={(e) => setAddressSearchQuery(e.target.value)}
                        placeholder="住所を入力（例：東京都墨田区押上 1-1-2）"
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                        disabled={isSearchingAddress}
                      />
                    </div>
                    <button
                      onClick={handleAddressSearch}
                      disabled={isSearchingAddress || !addressSearchQuery.trim()}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white rounded-md font-medium flex items-center gap-2 transition-colors text-sm"
                    >
                      {isSearchingAddress ? (
                        <>
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                          検索中
                        </>
                      ) : (
                        <>
                          <Icon name="search" size={16} />
                          住所検索
                        </>
                      )}
                    </button>
                  </div>
                </div>

                <div className="h-96 lg:h-[600px] relative">
                  <div
                    ref={mapContainerRef}
                    className="w-full h-full"
                  />
                  <div className="absolute top-4 left-4 bg-white p-3 rounded-lg shadow-lg text-sm max-w-xs">
                    <div className="font-medium text-gray-900 mb-2">撮影地データ</div>
                    {locationAddress && (
                      <div className="text-gray-700 mb-2 text-xs flex items-center gap-1">
                        <MapPin size={12} className="text-blue-600" />
                        {locationAddress}
                      </div>
                    )}
                    <div className="grid grid-cols-4 gap-2 text-xs text-gray-600">
                      <div className="text-center">
                        <div className="text-gray-500">緯度</div>
                        <div className="font-medium">{searchParams.latitude.toFixed(4)}°</div>
                      </div>
                      <div className="text-center">
                        <div className="text-gray-500">経度</div>
                        <div className="font-medium">{searchParams.longitude.toFixed(4)}°</div>
                      </div>
                      <div className="text-center">
                        <div className="text-gray-500">標高</div>
                        <div className="font-medium flex items-center justify-center gap-1">
                          {searchParams.elevation}m
                          {isLoadingElevation && (
                            <div className="animate-spin rounded-full h-3 w-3 border border-blue-600 border-t-transparent"></div>
                          )}
                        </div>
                      </div>
                      <div className="text-center">
                        <div className="text-gray-500">距離</div>
                        <div className="font-medium">
                          {skytreeRelation ? `${(skytreeRelation.distance / 1000).toFixed(1)}km` : '計算中'}
                        </div>
                      </div>
                    </div>
                    {isLocationSelected && (
                      <div className="flex gap-1 mt-2">
                        <a
                          href={generateGoogleMapsViewUrl(searchParams.latitude, searchParams.longitude)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex-1 px-2 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded text-xs text-center transition-colors"
                        >
                          地図表示
                        </a>
                        <a
                          href={generateGoogleMapsNavUrl(searchParams.latitude, searchParams.longitude)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex-1 px-2 py-1 bg-green-50 hover:bg-green-100 text-green-700 rounded text-xs text-center transition-colors"
                        >
                          ナビ
                        </a>
                      </div>
                    )}
                  </div>
                </div>
              </div>


              {/* 選択地点の詳細情報 */}
              {isLocationSelected && (
                <div className="bg-white rounded-lg shadow-sm border p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1">
                      <h2 className="text-lg font-semibold text-gray-900 mb-1 flex items-center gap-2">
                        <Icon name="data" size={14} />
                        撮影地データ
                      </h2>
                      {locationAddress && (
                        <div className="text-sm text-gray-600 flex items-center gap-1">
                          <MapPin size={14} className="text-blue-600" />
                          {locationAddress}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button
                        onClick={handleToggleFavoriteLocation}
                        className="px-3 py-1.5 bg-yellow-50 hover:bg-yellow-100 text-yellow-700 rounded text-xs transition-colors border border-yellow-200 flex items-center gap-1.5"
                      >
                        <Icon name="star" size={14} />
                        お気に入り
                      </button>
                      <a
                        href={generateGoogleMapsNavUrl(searchParams.latitude, searchParams.longitude)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-3 py-1.5 bg-green-50 hover:bg-green-100 text-green-700 rounded text-xs transition-colors border border-green-200 flex items-center gap-1.5"
                      >
                        <Icon name="route" size={14} />
                        経路案内
                      </a>
                    </div>
                  </div>


                  
                  <div className="space-y-3 mb-3">
                    {/* 撮影地データ */}
                    <div className="space-y-3">
                      <div className="grid grid-cols-4 gap-3 text-xs">
                        <div>
                          <div className="text-gray-500 mb-1">緯度:</div>
                          <div className="font-medium text-gray-900">{searchParams.latitude.toFixed(6)}°</div>
                        </div>
                        <div>
                          <div className="text-gray-500 mb-1">経度:</div>
                          <div className="font-medium text-gray-900">{searchParams.longitude.toFixed(6)}°</div>
                        </div>
                        <div>
                          <div className="text-gray-500 mb-1">海抜標高:</div>
                          <div className="font-medium text-gray-900 flex items-center gap-1">
                            約{searchParams.elevation.toFixed(1)}m
                            {isLoadingElevation && (
                              <div className="animate-spin rounded-full h-3 w-3 border border-gray-600 border-t-transparent"></div>
                            )}
                          </div>
                        </div>
                        <div>
                          <div className="text-gray-500 mb-1">スカイツリーの方角:</div>
                          <div className="font-medium text-gray-900">
                            {skytreeRelation ? `${getCompassDirection(skytreeRelation.azimuth)} (${Math.round(skytreeRelation.azimuth)}°)` : '計算中'}
                          </div>
                        </div>
                      </div>
                      <div className="text-xs">
                        <div className="text-gray-500 mb-1">スカイツリーまで:</div>
                        <div className="font-medium text-gray-900">
                          {skytreeRelation ? `約${(skytreeRelation.distance / 1000).toFixed(1)}km` : '計算中'}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}


              {/* 検索実行前のナビゲーション */}
              {isLocationSelected && !hasSearched && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0">
                      <Icon name="info" size={20} className="text-blue-600 mt-0.5" />
                    </div>
                    <div>
                      <h3 className="text-sm font-medium text-blue-900 mb-1">
                        次のステップ
                      </h3>
                      <p className="text-sm text-blue-800 mb-2">
                        まだ検索していません。サイドバーの検索条件を入力し、検索を実行してください。
                      </p>
                      <div className="text-xs text-blue-700 space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="w-4 h-4 bg-blue-600 text-white rounded-full flex items-center justify-center text-xs font-bold">1</span>
                          <span>撮影シーン（ダイヤモンド・パール）を選択</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="w-4 h-4 bg-blue-600 text-white rounded-full flex items-center justify-center text-xs font-bold">2</span>
                          <span>検索期間を設定</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="w-4 h-4 bg-blue-600 text-white rounded-full flex items-center justify-center text-xs font-bold">3</span>
                          <span>検索実行ボタンをクリック</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* 検索結果 */}
              {hasSearched && (
                <div className="bg-white rounded-lg shadow-sm border p-6">
                  {isSearching ? (
                    <div className="text-center py-12">
                      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
                      <h3 className="text-lg font-medium text-gray-900 mb-2">
                        検索中...
                      </h3>
                      <p className="text-gray-600">
                        ダイヤモンド・パールスカイツリーのイベントを検索しています
                      </p>
                    </div>
                  ) : searchResults.length > 0 ? (
                    <>
                      {/* 結果ヘッダー・コントロール */}
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6">
                        <h2 className="text-lg font-semibold text-gray-900 mb-4 sm:mb-0">
                          検索結果 ({filteredAndSortedResults.length}/{searchResults.length}件)
                        </h2>
                        
                        <div className="flex flex-col sm:flex-row gap-3">
                          {/* フィルター */}
                          <select
                            value={filterType}
                            onChange={(e) => {
                              setFilterType(e.target.value as "all" | "diamond" | "pearl");
                              setCurrentPage(1);
                            }}
                            className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                          >
                            <option value="all">すべて</option>
                            <option value="diamond">ダイヤモンドのみ</option>
                            <option value="pearl">パールのみ</option>
                          </select>
                          
                          {/* ソート */}
                          <select
                            value={sortBy}
                            onChange={(e) => setSortBy(e.target.value as "time" | "accuracy")}
                            className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                          >
                            <option value="time">時間順</option>
                            <option value="accuracy">精度順</option>
                          </select>
                        </div>
                      </div>

                      {/* 結果リスト（ホームページスタイル） */}
                      <div className="space-y-3 mb-6">
                        {currentResults.map((result) => (
                          <div key={result.id} className="bg-white border border-gray-200 rounded-lg overflow-hidden hover:shadow-md transition-shadow">
                            {/* イベントヘッダー */}
                            <div className="p-4">
                              <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-3">
                                  <div className="flex items-center gap-2">
                                    <Icon 
                                      name={result.type === "diamond" ? "sun" : "moon"} 
                                      size={16} 
                                      className={result.type === "diamond" ? "text-yellow-500" : "text-blue-400"}
                                    />
                                    <span className="font-medium text-gray-900">
                                      {getEventDisplayName(result)}
                                    </span>
                                  </div>
                                  <span className={`px-2 py-1 text-xs rounded font-medium ${
                                    result.accuracy === "perfect" ? "bg-gray-100 text-gray-700 border border-gray-200" :
                                    result.accuracy === "excellent" ? "bg-gray-50 text-gray-600 border border-gray-200" :
                                    result.accuracy === "good" ? "bg-gray-50 text-gray-600 border border-gray-200" :
                                    "bg-gray-50 text-gray-500 border border-gray-200"
                                  }`}>
                                    {getAccuracyDisplayName(result.accuracy)}
                                  </span>
                                </div>
                                <div className="text-right">
                                  <div className="font-medium text-gray-900">
                                    {result.time.toLocaleTimeString("ja-JP", {
                                      hour: "2-digit",
                                      minute: "2-digit"
                                    })}
                                  </div>
                                  <div className="text-xs text-gray-500">
                                    {result.time.toLocaleDateString("ja-JP", {
                                      month: "short",
                                      day: "numeric",
                                      weekday: "short"
                                    })}
                                  </div>
                                </div>
                              </div>
                              
                              <div className="flex items-center justify-between text-sm text-gray-600">
                                <div className="flex items-center gap-4">
                                  <span>方位角 {getCompassDirection(result.azimuth)}（{result.azimuth.toFixed(1)}°）</span>
                                  <span>
                                    仰角 {formatElevation(skytreeRelation?.elevation || result.elevation)}°
                                    {(skytreeRelation?.elevation || result.elevation) < 0 && (
                                      <span className="text-xs text-gray-500 ml-1">（見下ろし）</span>
                                    )}
                                  </span>
                                  {result.moonPhase !== undefined && (
                                    <span>
                                      {getMoonPhase(result.moonPhase).icon} {getMoonPhase(result.moonPhase).name}
                                    </span>
                                  )}
                                </div>
                                <div className="flex items-center gap-2">
                                  <button 
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      toggleFavorite(result.id);
                                    }}
                                    className={`px-2 py-1 text-xs rounded transition-colors ${
                                      favorites.has(result.id) 
                                        ? "bg-gray-100 text-gray-700 hover:bg-gray-200" 
                                        : "bg-gray-50 text-gray-600 hover:bg-gray-100"
                                    }`}
                                  >
                                    <Icon name="calendar" size={12} className="inline mr-1" />
                                    {favorites.has(result.id) ? "予定済み" : "予定に追加"}
                                  </button>
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* ページネーション */}
                      {totalPages > 1 && (
                        <div className="flex items-center justify-between border-t pt-4">
                          <div className="text-sm text-gray-500">
                            {(currentPage - 1) * resultsPerPage + 1}-{Math.min(currentPage * resultsPerPage, filteredAndSortedResults.length)} / {filteredAndSortedResults.length}件
                          </div>
                          
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                              disabled={currentPage === 1}
                              className="px-3 py-1 border border-gray-300 rounded text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
                            >
                              前へ
                            </button>
                            
                            <div className="flex items-center gap-1">
                              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                                let pageNum;
                                if (totalPages <= 5) {
                                  pageNum = i + 1;
                                } else if (currentPage <= 3) {
                                  pageNum = i + 1;
                                } else if (currentPage >= totalPages - 2) {
                                  pageNum = totalPages - 4 + i;
                                } else {
                                  pageNum = currentPage - 2 + i;
                                }
                                
                                return (
                                  <button
                                    key={pageNum}
                                    onClick={() => setCurrentPage(pageNum)}
                                    className={`px-3 py-1 text-sm rounded ${
                                      currentPage === pageNum
                                        ? "bg-blue-600 text-white"
                                        : "border border-gray-300 hover:bg-gray-50"
                                    }`}
                                  >
                                    {pageNum}
                                  </button>
                                );
                              })}
                            </div>
                            
                            <button
                              onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                              disabled={currentPage === totalPages}
                              className="px-3 py-1 border border-gray-300 rounded text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
                            >
                              次へ
                            </button>
                          </div>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="text-center py-8">
                      <Icon name="searchX" size={48} className="mx-auto text-gray-400 mb-4" />
                      <h3 className="text-lg font-medium text-gray-900 mb-2">
                        検索結果がありません
                      </h3>
                      <p className="text-gray-600 mb-4">
                        指定した条件でダイヤモンド・パールスカイツリーのイベントが見つかりませんでした。
                      </p>
                      <div className="text-sm text-gray-500 space-y-1">
                        <p>• 検索期間を延長してみてください</p>
                        <p>• 検索モードを「高速」に変更してみてください</p>
                        <p>• 撮影シーンを「すべて」に設定してみてください</p>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* 右カラム: サイドバー */}
          <div className="flex flex-col gap-6 lg:sticky lg:top-4 lg:self-start">
            {/* 使い方ガイド */}
            <div className="bg-white rounded-lg shadow-sm border p-6">
                <div className="flex items-center mb-4 pb-3 border-b border-gray-200">
                  <Icon name="book" size={20} className="mr-2" />
                  <h3 className="text-lg font-semibold text-gray-900 m-0">
                    使い方ガイド
                  </h3>
                </div>
                <div className="flex flex-col gap-3">
                  <div className="flex items-start gap-3 p-3 rounded-md bg-gray-50 border border-gray-200">
                    <span className="flex items-center justify-center w-6 h-6 bg-blue-600 text-white rounded-full text-xs font-bold flex-shrink-0">
                      1
                    </span>
                    <div>
                      <div className="text-sm font-semibold text-gray-800 mb-1">
                        撮影地点を選択
                      </div>
                      <div className="text-xs text-gray-600 leading-relaxed">
                        住所検索または地図をクリックして地点を指定
                      </div>
                    </div>
                  </div>

                  <div className="flex items-start gap-3 p-3 rounded-md bg-gray-50 border border-gray-200">
                    <span className="flex items-center justify-center w-6 h-6 bg-green-600 text-white rounded-full text-xs font-bold flex-shrink-0">
                      2
                    </span>
                    <div>
                      <div className="text-sm font-semibold text-gray-800 mb-1">
                        検索条件を設定
                      </div>
                      <div className="text-xs text-gray-600 leading-relaxed">
                        日付範囲・撮影シーン・検索モードを選択
                      </div>
                    </div>
                  </div>

                  <div className="flex items-start gap-3 p-3 rounded-md bg-gray-50 border border-gray-200">
                    <span className="flex items-center justify-center w-6 h-6 bg-amber-500 text-white rounded-full text-xs font-bold flex-shrink-0">
                      3
                    </span>
                    <div>
                      <div className="text-sm font-semibold text-gray-800 mb-1">
                        検索実行・結果確認
                      </div>
                      <div className="text-xs text-gray-600 leading-relaxed">
                        検索ボタンで実行し、詳細・ルート確認
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* 検索条件 - 地点選択後に表示 */}
              {isLocationSelected && (
                <div className="bg-white rounded-lg shadow-sm border p-6">
                  <h2 className="text-lg font-semibold text-gray-900 mb-4">検索条件</h2>
                  
                  <div className="space-y-4">
                    {/* 標高 */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        標高補正 (m)
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
                      <p className="text-xs text-gray-500 mt-1">
                        地図クリックで自動取得。建物の階層分を手動補正可能（例：天望フロア +350m）
                      </p>
                    </div>

                    <div className="grid grid-cols-1 gap-4">
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
                        {/* 同日検索のヒント */}
                        {searchParams.startDate.toISOString().split("T")[0] === searchParams.endDate.toISOString().split("T")[0] && (
                          <p className="text-xs text-blue-600 bg-blue-50 p-2 rounded">
                            📅 {searchParams.startDate.toLocaleDateString('ja-JP')} の単日検索
                          </p>
                        )}
                      </div>
                    </div>

                    {/* 検索ボタン */}
                    <button
                      onClick={handleSearch}
                      disabled={isSearching || !isLocationSelected}
                      className="w-full px-4 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white rounded-md font-medium flex items-center justify-center"
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
              )}

          </div>
        </div>

      </div>
    </div>
  );
};

export default MapSearchPage;