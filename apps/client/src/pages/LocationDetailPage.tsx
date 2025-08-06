import React, { useState, useEffect } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { Location, FujiEvent, SKYTREE_COORDINATES } from "@skytree-photo-planner/types";
import { apiClient } from "../services/apiClient";
import { timeUtils } from "@skytree-photo-planner/utils";
import { useFavorites } from "../hooks/useFavorites";
import { getComponentLogger } from "@skytree-photo-planner/utils";
import SimpleMap from "../components/SimpleMap";
import { Icon } from "@skytree-photo-planner/ui";
import { getLocationNearby } from "../utils/geocoding";

const LocationDetailPage: React.FC = () => {
  const logger = getComponentLogger('LocationDetailPage');
  const { locationId } = useParams<{ locationId: string }>();
  const navigate = useNavigate();
  const {
    isLocationFavorite,
    toggleLocationFavorite,
    isEventFavorite,
    toggleEventFavorite,
  } = useFavorites();

  const [location, setLocation] = useState<Location | null>(null);
  const [upcomingEvents, setUpcomingEvents] = useState<FujiEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [locationAddress, setLocationAddress] = useState<string | null>(null);

  useEffect(() => {
    const loadLocationDetail = async () => {
      if (!locationId) return;

      setLoading(true);
      setError(null);

      try {
        const parsedLocationId = parseInt(locationId);
        
        // 仮想地点（負の ID）の場合は、お気に入りから情報を取得
        if (parsedLocationId < 0) {
          logger.debug('仮想地点 ID', { parsedLocationId });
          
          const favorites = localStorage.getItem("skytree-photo-planner-favorites");
          if (favorites) {
            const favoritesData = JSON.parse(favorites);
            logger.debug('お気に入りデータ', { favoritesData });
            
            const favoriteLocation = favoritesData.locations?.find(
              (loc: { id: number }) => loc.id === parsedLocationId
            );
            
            logger.debug('見つかったお気に入り地点', { favoriteLocation });
            
            if (favoriteLocation) {
              // FavoriteLocation を Location 型に変換
              // 仮想地点なので、スカイツリーへの方位角・仰角・距離を計算
              const deltaLat = SKYTREE_COORDINATES.latitude - favoriteLocation.latitude;
              const deltaLon = SKYTREE_COORDINATES.longitude - favoriteLocation.longitude;
              const avgLat = (favoriteLocation.latitude + SKYTREE_COORDINATES.latitude) / 2;
              
              // 簡易的な方位角計算
              const azimuthRad = Math.atan2(deltaLon * Math.cos(avgLat * Math.PI / 180), deltaLat);
              const azimuthDeg = (azimuthRad * 180 / Math.PI + 360) % 360;
              
              // 簡易的な距離計算（ハバーサイン公式の簡略版）
              const R = 6371000; // 地球の半径（メートル）
              const dLat = (deltaLat) * Math.PI / 180;
              const dLon = (deltaLon) * Math.PI / 180;
              const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                        Math.cos(favoriteLocation.latitude * Math.PI / 180) * Math.cos(SKYTREE_COORDINATES.latitude * Math.PI / 180) *
                        Math.sin(dLon/2) * Math.sin(dLon/2);
              const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
              const distance = R * c;
              
              // 標高データを取得（国土地理院 API）
              let elevation = 0;
              try {
                const elevationResponse = await fetch(
                  `https://cyberjapandata2.gsi.go.jp/general/dem/scripts/getelevation.php?lon=${favoriteLocation.longitude}&lat=${favoriteLocation.latitude}&outtype=JSON`
                );
                if (elevationResponse.ok) {
                  const elevationData = await elevationResponse.json();
                  elevation = elevationData.elevation || 0;
                }
              } catch (elevationError) {
                logger.warn('標高データ取得エラー', elevationError as Error);
              }
              
              const virtualLocation: Location = {
                id: favoriteLocation.id,
                name: favoriteLocation.name,
                prefecture: "東京都", // 仮想地点のデフォルト
                latitude: favoriteLocation.latitude,
                longitude: favoriteLocation.longitude,
                elevation: elevation,
                description: null,
                accessInfo: favoriteLocation.accessInfo || null,
                measurementNotes: null,
                parkingInfo: null,
                azimuthToSkytree: azimuthDeg,
                elevationToSkytree: 0, // 仮想地点のデフォルト
                distanceToSkytree: distance,
                status: "active",
                createdAt: favoriteLocation.addedAt,
                updatedAt: favoriteLocation.addedAt
              };
              setLocation(virtualLocation);
              
              // 今後 3 ヶ月間のイベントを取得（仮想地点用）
              const today = new Date();
              const events: FujiEvent[] = [];
              
              // 仮想地点の場合：お気に入りイベントから関連するイベントを取得
              const locationEvents = favoritesData.events?.filter((e: { locationId: number }) => e.locationId === parsedLocationId) || [];
              
              locationEvents.forEach((savedEvent: { time: string; [key: string]: unknown }) => {
                // 保存されたイベントを復元
                const eventTime = new Date(savedEvent.time);
                
                events.push({
                  id: savedEvent.id,
                  type: savedEvent.type,
                  subType: savedEvent.subType,
                  time: eventTime,
                  location: virtualLocation,
                  azimuth: savedEvent.azimuth,
                  elevation: savedEvent.elevation
                } as FujiEvent);
              });
              
              // 今日以降のイベントのみ、時刻順にソート
              const futureEvents = events
                .filter((event) => new Date(event.time) >= today)
                .sort(
                  (a, b) => new Date(a.time).getTime() - new Date(b.time).getTime(),
                );

              setUpcomingEvents(futureEvents);
            } else {
              setError("地点が見つかりませんでした");
              return;
            }
          } else {
            setError("地点が見つかりませんでした");
            return;
          }
        } else {
          // 通常の地点の場合は API から取得
          const locationsResponse = await apiClient.getLocations();
          const foundLocation = locationsResponse.locations.find(
            (loc) => loc.id === parsedLocationId,
          );

          if (!foundLocation) {
            setError("地点が見つかりませんでした");
            return;
          }

          setLocation(foundLocation);
          
          // 今後 3 ヶ月間のイベントを取得（通常地点用）
          const today = new Date();
          const events: FujiEvent[] = [];
          
          for (let i = 0; i < 3; i++) {
            const targetDate = new Date(
              today.getFullYear(),
              today.getMonth() + i,
              1,
            );
            try {
              const calendarResponse = await apiClient.getMonthlyCalendar(
                targetDate.getFullYear(),
                targetDate.getMonth() + 1,
              );

              // この地点のイベントのみフィルタリング（FujiEvent の型のみ）
              const locationEvents = calendarResponse.events.filter(
                (event) =>
                  "location" in event &&
                  (event as any).location.id === parsedLocationId,
              ) as unknown as FujiEvent[];

              events.push(...locationEvents);
            } catch (error) {
              logger.warn(
                `Failed to load events for ${targetDate.getFullYear()}-${targetDate.getMonth() + 1}`,
                { error: error as Error, targetDate: targetDate.toISOString() }
              );
            }
          }
          
          // 今日以降のイベントのみ、時刻順にソート
          const futureEvents = events
            .filter((event) => new Date(event.time) >= today)
            .sort(
              (a, b) => new Date(a.time).getTime() - new Date(b.time).getTime(),
            );

          setUpcomingEvents(futureEvents);
        }
        
        // デバッグログ
        logger.debug('地点詳細読み込み完了', { parsedLocationId });
      } catch (error) {
        logger.error("Failed to load location detail", { error: error as Error, locationId });
        setError("地点情報の読み込みに失敗しました");
      } finally {
        setLoading(false);
      }
    };

    loadLocationDetail();
  }, [locationId]);

  // 地点の緯度経度から住所を取得
  useEffect(() => {
    const loadAddress = async () => {
      if (!location) return;
      
      try {
        const address = await getLocationNearby(location.latitude, location.longitude);
        setLocationAddress(address);
        logger.debug('住所取得成功', { locationId: location.id, address });
      } catch (error) {
        logger.warn('住所取得エラー', { error: error as Error, locationId: location.id });
        // エラー時は従来の表示にフォールバック
      }
    };
    
    loadAddress();
  }, [location]);

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

    const index = Math.round(azimuth / 22.5) % 16;
    return directions[index];
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

  const handleViewEventDetail = (event: FujiEvent) => {
    const eventDate = new Date(event.time);
    const dateString = timeUtils.formatDateString(eventDate);

    navigate(`/?date=${dateString}`, {
      state: {
        selectedDate: eventDate,
        selectedLocationId: event.location.id,
        selectedEventId: event.id,
      },
    });
  };

  const handleGoogleMapsClick = () => {
    if (!location) return;
    const googleMapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${location.latitude},${location.longitude}`;
    window.open(googleMapsUrl, "_blank");
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-96 text-center">
        <div className="w-10 h-10 border-4 border-gray-300 border-t-blue-600 rounded-full animate-spin mb-4"></div>
        <p>読み込み中...</p>
      </div>
    );
  }

  if (error || !location) {
    return (
      <div className="flex flex-col items-center justify-center min-h-96 text-center">
        <h2 className="text-red-600 mb-4">エラー</h2>
        <p>{error || "地点情報が見つかりませんでした"}</p>
        <Link to="/favorites" className="inline-block bg-blue-600 text-white px-6 py-3 rounded-lg mt-4 hover:bg-blue-700 transition-colors">
          お気に入りに戻る
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="content-wide">
        {/* ヘッダー */}
        <div className="bg-white border-b border-gray-200 px-6 py-4">
          <div className="flex items-center space-x-2 text-sm text-gray-600 mb-4">
            <Link to="/" className="text-blue-600 hover:text-blue-800">
              ホーム
            </Link>
            <span className="text-gray-400">›</span>
            <Link to="/favorites" className="text-blue-600 hover:text-blue-800">
              お気に入り
            </Link>
            <span className="text-gray-400">›</span>
            <span className="text-gray-900 font-medium">地点詳細</span>
          </div>

          <div className={"mb-4"}>
            <h1 className={"text-2xl font-bold text-gray-900 mb-2"}>
              <Icon name="mapPin" size={20} className="inline mr-2" />{" "}
              {location.id < 0 
                ? (locationAddress || `計算地点 (${location.latitude.toFixed(4)}°, ${location.longitude.toFixed(4)}°)`)
                : location.name}
            </h1>
          </div>

          <div className={"flex items-center space-x-3"}>
            <button
              className={`px-3 py-1.5 rounded text-xs transition-colors border flex items-center gap-1.5 ${isLocationFavorite(location.id) ? "bg-yellow-50 hover:bg-yellow-100 text-yellow-700 border-yellow-200" : "bg-gray-50 hover:bg-gray-100 text-gray-700 border-gray-200"}`}
              onClick={() => toggleLocationFavorite(location)}
            >
              {isLocationFavorite(location.id) ? (
                <>
                  <Icon name="star" size={16} className="inline mr-1" />{" "}
                  お気に入り済み
                </>
              ) : (
                <>
                  <Icon name="star" size={16} className="inline mr-1" />{" "}
                  お気に入り追加
                </>
              )}
            </button>
            <button
              className="px-3 py-1.5 bg-green-50 hover:bg-green-100 text-green-700 rounded text-xs transition-colors border border-green-200 flex items-center gap-1.5"
              onClick={handleGoogleMapsClick}
              title="Google Maps で経路案内"
            >
              <Icon name="route" size={14} className="inline" />
              経路案内
            </button>
          </div>
        </div>

        {/* 2 カラムレイアウト */}
        <div className={"grid grid-cols-1 lg:grid-cols-2 gap-8 mt-8"}>
          {/* 左カラム: 地点情報 */}
          <div className={"space-y-6"}>
            {/* 基本情報 */}
            <div className={"bg-white rounded-lg shadow-sm border border-gray-200 p-6"}>
              <h2 className={"text-lg font-semibold text-gray-900 mb-4 flex items-center"}>
                <Icon name="barChart" size={18} className="inline mr-2" />{" "}
                基本情報
              </h2>
              <div className={"grid grid-cols-1 sm:grid-cols-2 gap-4"}>
                <div className={"flex flex-col space-y-1"}>
                  <span className={"text-sm font-medium text-gray-600"}>所在地:</span>
                  <span className={"text-sm text-gray-900"}>
                    {locationAddress || location.accessInfo?.split(',')[0] || location.name}
                  </span>
                </div>
                <div className={"flex flex-col space-y-1"}>
                  <span className={"text-sm font-medium text-gray-600"}>緯度:</span>
                  <span className={"text-sm text-gray-900"}>
                    {location.latitude.toFixed(6)}°
                  </span>
                </div>
                <div className={"flex flex-col space-y-1"}>
                  <span className={"text-sm font-medium text-gray-600"}>経度:</span>
                  <span className={"text-sm text-gray-900"}>
                    {location.longitude.toFixed(6)}°
                  </span>
                </div>
                <div className={"flex flex-col space-y-1"}>
                  <span className={"text-sm font-medium text-gray-600"}>標高:</span>
                  <span className={"text-sm text-gray-900"}>
                    約{location.elevation.toFixed(1)}m
                  </span>
                </div>
                {location.distanceToSkytree && (
                  <div className={"flex flex-col space-y-1"}>
                    <span className={"text-sm font-medium text-gray-600"}>スカイツリーまで:</span>
                    <span className={"text-sm text-gray-900"}>
                      約{(location.distanceToSkytree / 1000).toFixed(1)}km
                    </span>
                  </div>
                )}
                {location.azimuthToSkytree !== undefined && (
                  <div className={"flex flex-col space-y-1"}>
                    <span className={"text-sm font-medium text-gray-600"}>スカイツリーの方角:</span>
                    <span className={"text-sm text-gray-900"}>
                      {location.azimuthToSkytree
                        ? `${getCompassDirection(location.azimuthToSkytree)}（${Math.round(location.azimuthToSkytree)}°）`
                        : "計算中"}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* アクセス情報 */}
            {(location.accessInfo ||
              location.parkingInfo ||
              location.description) && (
              <div className={"bg-white rounded-lg shadow-sm border border-gray-200 p-6"}>
                <h2 className={"text-lg font-semibold text-gray-900 mb-4 flex items-center"}>
                  <Icon name="info" size={18} className="inline mr-2" />{" "}
                  アクセス・注意事項
                </h2>

                {location.accessInfo && (
                  <div className={"mb-4"}>
                    <h3 className={"text-base font-medium text-gray-800 mb-2 flex items-center"}>
                      <Icon
                        name="navigation"
                        size={16}
                        className="inline mr-1"
                      />{" "}
                      アクセス情報
                    </h3>
                    <p>{location.accessInfo}</p>
                  </div>
                )}

                {location.parkingInfo && (
                  <div className={"mb-4"}>
                    <h3 className={"text-base font-medium text-gray-800 mb-2 flex items-center"}>
                      <Icon name="parking" size={16} className="inline mr-1" />{" "}
                      駐車場情報
                    </h3>
                    <p>{location.parkingInfo}</p>
                  </div>
                )}

                {location.description && (
                  <div className={"mb-4"}>
                    <h3 className="text-base font-medium text-gray-800 mb-2 flex items-center">
                      <Icon name="warning" size={16} className="inline mr-1" />{" "}
                      注意事項
                    </h3>
                    <p>{location.description}</p>
                  </div>
                )}
              </div>
            )}

            {/* 今後のイベント */}
            <div className={"bg-white rounded-lg shadow-sm border border-gray-200 p-6"}>
              <h2 className={"text-lg font-semibold text-gray-900 mb-4 flex items-center"}>
                <Icon name="calendar" size={18} className="inline mr-2" />{" "}
                今後の撮影チャンス
              </h2>

              {upcomingEvents.length === 0 ? (
                <div className={"text-center py-8 text-gray-600"}>
                  <p>
                    今後 3
                    ヶ月間に撮影可能なダイヤモンドスカイツリー・パールスカイツリーはありません。
                  </p>
                </div>
              ) : (
                <div className={"space-y-4"}>
                  {upcomingEvents.map((event, index) => (
                    <div key={event.id || index} className={"bg-gray-50 rounded-lg p-4 flex items-start space-x-4"}>
                      <div className={"flex-shrink-0"}>
                        <Icon
                          name={event.type === "diamond" ? "sun" : "moon"}
                          size={32}
                          className={
                            event.type === "diamond"
                              ? "text-orange-500"
                              : "text-blue-500"
                          }
                        />
                      </div>

                      <div className={"flex-1 min-w-0"}>
                        <div className={"font-semibold text-gray-900 mb-1"}>
                          {event.type === "diamond"
                            ? "ダイヤモンドスカイツリー"
                            : "パールスカイツリー"}
                          {event.subType === "sunrise" ||
                          event.subType === "rising"
                            ? " (昇る)"
                            : " (沈む)"}
                        </div>
                        <div className={"text-sm text-gray-600 mb-1"}>
                          {formatEventDate(event.time)}{" "}
                          {formatEventTime(event.time)}
                        </div>
                        {event.elevation !== undefined && (
                          <div className={"text-xs text-gray-500"}>
                            高度: {Math.round(event.elevation)}°
                          </div>
                        )}
                      </div>

                      <div className={"flex flex-col space-y-2"}>
                        <button
                          className={`px-3 py-1.5 rounded text-xs transition-colors border flex items-center justify-center gap-1.5 ${isEventFavorite(event.id) ? "bg-green-50 hover:bg-green-100 text-green-700 border-green-200" : "bg-gray-50 hover:bg-gray-100 text-gray-700 border-gray-200"}`}
                          onClick={() => {
                            logger.debug('イベントお気に入り切り替え', { eventId: event.id, currentFavoriteStatus: isEventFavorite(event.id) });
                            toggleEventFavorite(event);
                          }}
                        >
                          {isEventFavorite(event.id) ? (
                            <>
                              <Icon
                                name="calendar"
                                size={14}
                                className="inline mr-1"
                              />{" "}
                              予定済み
                            </>
                          ) : (
                            <>
                              <Icon
                                name="calendar"
                                size={14}
                                className="inline mr-1"
                              />{" "}
                              予定追加
                            </>
                          )}
                        </button>
                        <button
                          className={"px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded text-xs transition-colors border border-blue-200 flex items-center justify-center gap-1.5"}
                          onClick={() => handleViewEventDetail(event)}
                        >
                          詳細を見る
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* 右カラム: 地図 */}
          <div className={"space-y-6"}>
            <div className={"bg-white rounded-lg shadow-sm border border-gray-200 p-6"}>
              <h2 className={"text-lg font-semibold text-gray-900 mb-4 flex items-center"}>
                <Icon name="map" size={18} className="inline mr-2" /> 位置情報
              </h2>
              <div className={"rounded-lg overflow-hidden border border-gray-200"}>
                <SimpleMap
                  locations={[location]}
                  selectedEvents={upcomingEvents}
                  selectedLocationId={location.id}
                  onLocationSelect={() => {
                    logger.debug('地図で地点選択', { location });
                  }}
                  cameraSettings={{
                    showAngles: false,
                    focalLength: 50,
                    sensorType: "fullframe",
                    aspectRatio: "3:2",
                    orientation: "landscape",
                  }}
                  mapStyle={{ aspectRatio: "1 / 1", height: "400px" }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LocationDetailPage;
