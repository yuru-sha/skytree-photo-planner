import React, { useState, useEffect, useMemo } from "react";
import { useLocation, useSearchParams, useNavigate } from "react-router-dom";
import { Icon } from "@skytree-photo-planner/ui";
import { uiLogger } from "../utils/logger";
import {
  Location,
  FujiEvent,
  CalendarResponse,

} from "@skytree-photo-planner/types";
import { apiClient } from "../services/apiClient";
import { timeUtils } from "@skytree-photo-planner/utils";
import SimpleCalendar from "../components/SimpleCalendar";
import LazyMap from "../components/LazyMap";
import FilterPanel, { FilterOptions } from "../components/FilterPanel";
import CameraPanel, { CameraSettings } from "../components/CameraPanel";
import EventDetail from "../components/EventDetail";

const HomePage: React.FC = () => {
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const [calendarData, setCalendarData] = useState<CalendarResponse | null>(
    null,
  );
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [dayEvents, setDayEvents] = useState<FujiEvent[]>([]);

  const [locations, setLocations] = useState<Location[]>([]);
  const [selectedLocationId, setSelectedLocationId] = useState<
    number | undefined
  >(undefined);
  const [selectedEventId, setSelectedEventId] = useState<string | undefined>(
    undefined,
  );
  const [isDateSearchLoading, setIsDateSearchLoading] = useState(false);
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear());
  const [currentMonth, setCurrentMonth] = useState(new Date().getMonth() + 1);
  const [filters, setFilters] = useState<FilterOptions>({
    distance: "all",
    diamondSunrise: false,
    diamondSunset: false,
    pearlMoonrise: false,
    pearlMoonset: false,
    specialEvents: {
      solarEclipse: false,
      lunarEclipse: false,
      supermoon: false,
    },
  });
  const [cameraSettings, setCameraSettings] = useState<CameraSettings>({
    showAngles: false,
    focalLength: 50,
    sensorType: "fullframe",
    aspectRatio: "3:2",
    orientation: "landscape",
  });



  // URL パラメータから日付や地点 ID を処理
  useEffect(() => {
    const dateParam = searchParams.get("date");
    const locationIdParam = searchParams.get("locationId");
    const eventIdParam = searchParams.get("eventId");

    // お気に入りから遷移した場合の状態を復元
    if (location.state) {
      const {
        selectedDate: stateDate,
        selectedLocationId: stateLocationId,
        selectedEventId: stateEventId,
      } = location.state;

      if (stateDate) {
        setSelectedDate(new Date(stateDate));
        setCurrentYear(new Date(stateDate).getFullYear());
        setCurrentMonth(new Date(stateDate).getMonth() + 1);
      }

      // 地点 ID と イベント ID は locations が読み込まれた後に処理
      if (stateLocationId) {
        setSelectedLocationId(stateLocationId); // 一旦セット
      }

      if (stateEventId) {
        setSelectedEventId(stateEventId);
      }
    }
    // URL パラメータから日付を処理
    else if (dateParam) {
      try {
        const date = new Date(dateParam);
        if (!isNaN(date.getTime())) {
          setSelectedDate(date);
          setCurrentYear(date.getFullYear());
          setCurrentMonth(date.getMonth() + 1);
        }
      } catch (error) {
        uiLogger.warn("Invalid date parameter:", error as Error, { dateParam });
      }
    }

    // URL パラメータから地点 ID を処理
    if (locationIdParam) {
      const locationId = parseInt(locationIdParam);
      if (!isNaN(locationId)) {
        setSelectedLocationId(locationId);
      }
    }

    // URL パラメータからイベント ID を処理
    if (eventIdParam) {
      setSelectedEventId(eventIdParam);
    }
  }, [searchParams, location.state]);

  // カレンダーデータを取得
  useEffect(() => {
    const loadCalendar = async () => {
      try {
        const response = await apiClient.getMonthlyCalendar(
          currentYear,
          currentMonth,
        );
        uiLogger.debug("Calendar API Response:", {
          totalEvents: response.events?.length || 0,
          year: currentYear,
          month: currentMonth,
          hasEvents: Array.isArray(response.events)
        });
        
        if (!response.events || !Array.isArray(response.events)) {
          uiLogger.error("No events array in response:", new Error("Invalid response format"), { response });
          return;
        }
        
        if (response.events.length === 0) {
          uiLogger.debug("No events found for this month", { year: currentYear, month: currentMonth });
          setCalendarData(response);
          return;
        }
        
        uiLogger.debug("First event structure:", { firstEvent: response.events[0] });
        
        // イベントタイプの分布を確認
        const eventTypes = response.events.map((e) => e?.type).filter(Boolean);
        const diamondCount = eventTypes.filter((type) => type === 'diamond').length;
        const pearlCount = eventTypes.filter((type) => type === 'pearl').length;
        uiLogger.debug("Event type distribution:", {
          diamondCount,
          pearlCount,
          total: response.events.length,
          allEventTypes: [...new Set(eventTypes)]
        });
        
        // 最初の数件のイベントの詳細を確認（安全にアクセス）
        const firstCalendarEvents = response.events.slice(0, 5);
        uiLogger.debug("First 5 calendar events:", { 
          count: firstCalendarEvents.length,
          types: firstCalendarEvents.map(e => e.type)
        });
        
        setCalendarData(response);
      } catch (error) {
        uiLogger.error("Failed to load calendar:", error as Error);
      }
    };

    loadCalendar();
  }, [currentYear, currentMonth]);

  // 撮影地点を取得
  useEffect(() => {
    const loadLocations = async () => {
      try {
        const response = await apiClient.getLocations();
        uiLogger.debug("Locations loaded:", { locationsCount: response.locations?.length || 0 });
        setLocations(response.locations);
      } catch (error) {
        uiLogger.error("Failed to load locations:", error as Error);
      }
    };

    loadLocations();
  }, []);

  // locations 読み込み後に、お気に入りから来た地点 ID の存在確認
  useEffect(() => {
    if (locations.length > 0 && selectedLocationId) {
      // 仮想地点（負の ID）の場合は存在チェックをスキップ
      if (selectedLocationId < 0) {
        return; // 仮想地点は常に有効とみなす
      }
      
      const locationExists = locations.find(
        (loc) => loc.id === selectedLocationId,
      );
      if (!locationExists) {
        uiLogger.warn(
          "指定された地点 ID は存在しません。選択をリセットします。",
          new Error("Location not found"),
          { selectedLocationId }
        );
        setSelectedLocationId(undefined);
      }
    }
  }, [locations, selectedLocationId]);

  // URL パラメータで指定された日付のイベントを自動読み込み
  useEffect(() => {
    if (selectedDate && calendarData) {
      handleDateClick(selectedDate);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate, calendarData]);

  // 月変更ハンドラー
  const handleMonthChange = (year: number, month: number) => {
    setCurrentYear(year);
    setCurrentMonth(month);
  };

  // 日付選択ハンドラー
  const handleDateClick = async (date: Date) => {
    setSelectedDate(date);
    setIsDateSearchLoading(true);

    // URL パラメータまたは location.state で地点が指定されている場合はリセットしない
    const hasPreselectedLocation = selectedLocationId !== undefined;
    if (!hasPreselectedLocation) {
      setSelectedLocationId(undefined);
    }

    try {
      const dateString = timeUtils.formatDateString(date);
      uiLogger.debug("日付検索開始", { date: dateString });
      
      // 最低 1 秒のローディング表示を保証
      const [response] = await Promise.all([
        apiClient.getDayEvents(dateString),
        new Promise(resolve => setTimeout(resolve, 1000))
      ]);
      
      uiLogger.debug("日付検索完了", { 
        date: dateString, 
        eventsCount: response.events?.length || 0,
        hasEvents: Array.isArray(response.events)
      });
      
      setDayEvents(response.events || []);

      // 地点が事前に選択されていない場合のみ、最初の地点とイベントを自動選択
      if (!hasPreselectedLocation) {
        if (response.events && response.events.length > 0) {
          // フィルタリング後のイベントから最初の地点を特定するため、
          // ここでは地点 ID のみ設定し、イベント ID は後で filteredEvents から選択
          const firstLocationId = response.events[0].location.id;
          setSelectedLocationId(firstLocationId);
          
          uiLogger.debug("最初の地点を自動選択（イベントは後で選択）", { 
            locationId: firstLocationId,
            locationName: response.events[0].location.name,
            totalEvents: response.events.length
          });
        } else {
          // イベントが存在しない場合は選択をクリア
          setSelectedLocationId(undefined);
          setSelectedEventId(undefined);
          uiLogger.warn(
            "選択された日付にはイベントが存在しません",
            new Error("No events for selected date"),
            { date: timeUtils.formatDateString(date) }
          );
        }
      }

      // 天気情報を取得（7 日間以内の未来日付のみ）
      
      // 高度別ポイントを計算（常に計算）
      // 選択した日の正午を基準時刻として使用
      const noonTime = new Date(date);
      noonTime.setHours(12, 0, 0, 0);
      

    } catch (error) {
      uiLogger.error("Failed to load day events:", error as Error);
      setDayEvents([]);

    } finally {
      setIsDateSearchLoading(false);
    }
  };




  // 高度別ポイントは不要なので空配列を返す
  const elevationVirtualEvents = useMemo(() => {
    return [];
  }, []);

  // フィルタリングされたイベントを計算（高度別ポイントも含む）
  const filteredEvents = useMemo(() => {
    const allEvents = [...dayEvents, ...elevationVirtualEvents];
    
    uiLogger.debug("フィルタリング処理開始", {
      dayEventsCount: dayEvents.length,
      elevationVirtualEventsCount: elevationVirtualEvents.length,
      allEventsCount: allEvents.length,
      filters
    });
      
    if (!allEvents.length) {
      uiLogger.debug("フィルタリング処理完了 - イベントなし", { allEventsCount: 0 });
      return [];
    }

    const filtered = allEvents.filter((event) => {
      // 距離フィルター
      if (filters.distance !== "all") {
        const distance = (event.location.distanceToSkytree || 0) / 1000; // メートルからキロメートルに変換
        switch (filters.distance) {
          case "very_near":
            if (distance > 50) return false;
            break;
          case "near":
            if (distance > 100) return false;
            break;
          case "medium":
            if (distance > 200) return false;
            break;
          case "far":
            if (distance > 300) return false;
            break;
          case "very_far":
            if (distance <= 300) return false;
            break;
        }
      }

      // イベントタイプフィルター（複数選択可能）
      const hasEventTypeFilter =
        filters.diamondSunrise ||
        filters.diamondSunset ||
        filters.pearlMoonrise ||
        filters.pearlMoonset;

      if (hasEventTypeFilter) {
        const isDiamond = event.type === "diamond";
        const isPearl = event.type === "pearl";
        const isRising =
          event.subType === "rising" || event.subType === "sunrise";
        const isSetting =
          event.subType === "setting" || event.subType === "sunset";

        let matchesFilter = false;

        if (isDiamond && isRising && filters.diamondSunrise)
          matchesFilter = true;
        if (isDiamond && isSetting && filters.diamondSunset)
          matchesFilter = true;
        if (isPearl && isRising && filters.pearlMoonrise) matchesFilter = true;
        if (isPearl && isSetting && filters.pearlMoonset) matchesFilter = true;

        if (!matchesFilter) return false;
      }

      // 特別イベントフィルター
      const hasSpecialEventFilter =
        filters.specialEvents.solarEclipse ||
        filters.specialEvents.lunarEclipse ||
        filters.specialEvents.supermoon;

      if (hasSpecialEventFilter) {
        // 現在は基本的なダイヤモンドスカイツリー・パールスカイツリーのみなので、
        // 特別イベントフィルターが有効な場合は結果を制限
        // 将来的には実際の日食・月食・スーパームーンデータと照合

        // 月相データがある場合の簡易的な判定（スーパームーン近似）
        if (
          filters.specialEvents.supermoon &&
          event.type === "pearl" &&
          event.moonIllumination !== undefined
        ) {
          // 満月に近い場合（照度 90% 以上）をスーパームーン近似として扱う
          if (event.moonIllumination >= 0.9) {
            return true;
          }
        }

        // 日食・月食は現在データがないため除外
        if (
          filters.specialEvents.solarEclipse ||
          filters.specialEvents.lunarEclipse
        ) {
          return false;
        }

        // スーパームーンのみの場合で条件に合わない場合は除外
        if (
          filters.specialEvents.supermoon &&
          (event.type !== "pearl" ||
            !event.moonIllumination ||
            event.moonIllumination < 0.9)
        ) {
          return false;
        }
      }

      return true;
    });
    
    uiLogger.debug("フィルタリング処理完了", {
      originalCount: allEvents.length,
      filteredCount: filtered.length,
      filtersApplied: filters
    });
    
    return filtered;
  }, [dayEvents, elevationVirtualEvents, filters]);

  // 初回の検索後に最初の地点を自動選択（日付が変更された時のみ）
  const [hasAutoSelected, setHasAutoSelected] = useState(false);
  
  useEffect(() => {
    // 日付が変更されたらリセット
    setHasAutoSelected(false);
  }, [selectedDate]);
  
  useEffect(() => {
    // 既に自動選択済みの場合はスキップ
    if (hasAutoSelected) {
      return;
    }
    
    if (filteredEvents.length > 0) {
      // selectedEventId が指定されている場合は、そのイベントの地点を選択
      if (selectedEventId) {
        const targetEvent = filteredEvents.find(event => event.id === selectedEventId);
        if (targetEvent) {
          setSelectedLocationId(targetEvent.location.id);
          setHasAutoSelected(true);
          return;
        }
      }
      
      // 地点が選択されていない場合のみ、最初の地点を自動選択
      if (!selectedLocationId) {
        const firstLocation = filteredEvents[0].location;
        setSelectedLocationId(firstLocation.id);
      }
      
      // EventDetail で最初に表示される地点の最初のイベントを自動選択
      // 地点ごとにグループ化して最初の地点の最初のイベントを特定
      const eventsByLocation = filteredEvents.reduce((acc, event) => {
        const locationId = event.location.id;
        if (!acc[locationId]) {
          acc[locationId] = [];
        }
        acc[locationId].push(event);
        return acc;
      }, {} as Record<number, typeof filteredEvents>);
      
      const firstLocationEntries = Object.entries(eventsByLocation);
      if (firstLocationEntries.length > 0 && !selectedEventId) {
        const [, firstLocationEvents] = firstLocationEntries[0] as [string, typeof filteredEvents];
        // 時刻順でソートして最初のイベントを選択
        const sortedEvents = firstLocationEvents.sort((a, b) => 
          new Date(a.time).getTime() - new Date(b.time).getTime()
        );
        
        setSelectedEventId(sortedEvents[0].id);
        uiLogger.debug("EventDetail 最初地点の最初イベントを自動選択", {
          locationId: sortedEvents[0].location.id,
          locationName: sortedEvents[0].location.name,
          eventId: sortedEvents[0].id,
          eventTime: sortedEvents[0].time
        });
      }
      
      // 自動選択完了フラグを立てる
      setHasAutoSelected(true);
    }
  }, [filteredEvents, hasAutoSelected, selectedEventId, selectedLocationId]);


  if (!calendarData) {
    return (
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          height: "50vh",
          flexDirection: "column",
          gap: "1rem",
        }}
      >
        <div
          style={{
            width: "40px",
            height: "40px",
            border: "4px solid #e5e7eb",
            borderTop: "4px solid #2563eb",
            borderRadius: "50%",
            animation: "spin 1s linear infinite",
          }}
        ></div>
        <p style={{ color: "#6b7280" }}>読み込み中...</p>
      </div>
    );
  }

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
          {/* レスポンシブ: モバイルでは 1 カラム、デスクトップで 2 カラム */}
          {/* 左カラム: カレンダーと地図 */}
          <div
            style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}
          >
            {/* 地図検索ボタン */}
            <div className="flex justify-between items-center">
              <h1 className="text-2xl font-bold text-gray-900">
                日付検索
              </h1>
              <button
                onClick={() => navigate("/map-search")}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md font-medium flex items-center gap-2 transition-colors"
                title="地図で選択した地点のイベントを検索"
              >
                <Icon name="search" size={16} />
                地図検索
              </button>
            </div>

            <SimpleCalendar
              year={currentYear}
              month={currentMonth}
              events={calendarData.events}
              onDateClick={handleDateClick}
              onMonthChange={handleMonthChange}
              selectedDate={selectedDate || undefined}
            />

            {/* 日付検索中の表示 */}
            {isDateSearchLoading && (
              <div className="bg-white rounded-lg shadow-sm border p-6">
                <div className="text-center py-12">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
                  <h3 className="text-lg font-medium text-gray-900 mb-2">
                    検索中...
                  </h3>
                  <p className="text-gray-600">
                    ダイヤモンド・パールスカイツリーのイベントを検索しています
                  </p>
                </div>
              </div>
            )}

            {/* 検索結果が見つからない場合の表示 */}
            {selectedDate && !isDateSearchLoading && filteredEvents.length === 0 && (
              <div className="bg-white rounded-lg shadow-sm border p-6">
                <div className="text-center py-8">
                  <Icon name="searchX" size={48} className="mx-auto text-gray-400 mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">
                    検索結果がありません
                  </h3>
                  <p className="text-gray-600 mb-4">
                    {selectedDate.getFullYear()}年{selectedDate.getMonth() + 1}月{selectedDate.getDate()}日にダイヤモンド・パールスカイツリーのイベントが見つかりませんでした。
                  </p>
                  <div className="text-sm text-gray-500 space-y-1">
                    <p>• 別の日付を選択してみてください</p>
                    <p>• フィルター設定を「すべて」に変更してみてください</p>
                    <p>• 地図検索で特定の撮影地点から検索してみてください</p>
                  </div>
                </div>
              </div>
            )}

            {selectedDate && !isDateSearchLoading && filteredEvents.length > 0 && (
              <LazyMap
                locations={locations}
                events={filteredEvents}
                selectedLocationId={selectedLocationId}
                selectedEventId={selectedEventId}
                onLocationSelect={(locationId) => setSelectedLocationId(locationId)}
                onEventSelect={(eventId) => setSelectedEventId(eventId)}
                cameraSettings={cameraSettings}
              />
            )}

            {/* 地図下のコントロールパネル */}
            {selectedDate && !isDateSearchLoading && filteredEvents.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FilterPanel
                  filters={filters}
                  onFilterChange={setFilters}
                  eventCount={filteredEvents.length}
                  uniqueLocationCount={
                    new Set(filteredEvents.map((e) => e.location.id)).size
                  }
                />
                <CameraPanel
                  cameraSettings={cameraSettings}
                  onCameraSettingsChange={setCameraSettings}
                />
              </div>
            )}


            {/* 撮影地詳細情報 */}
            {selectedDate && !isDateSearchLoading && filteredEvents.length > 0 && (
              <EventDetail
                date={selectedDate}
                events={filteredEvents}
                selectedLocationId={selectedLocationId}
                onLocationSelect={(location) => {
                  if (location) {
                    setSelectedLocationId(location.id);
                  } else {
                    setSelectedLocationId(undefined);
                  }
                }}
              />
            )}
          </div>

          {/* 右カラム: サイドバー */}
          <div className="flex flex-col gap-6 lg:sticky lg:top-4 lg:self-start lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto">
            {/* 使い方ガイド */}
            <div
              style={{
                backgroundColor: "white",
                borderRadius: "8px",
                padding: "1.5rem",
                boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
                border: "1px solid #e5e7eb",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  marginBottom: "1rem",
                  paddingBottom: "0.75rem",
                  borderBottom: "1px solid #e5e7eb",
                }}
              >
                <Icon name="book" size={20} style={{ marginRight: "0.5rem" }} />
                <h3
                  style={{
                    margin: 0,
                    fontSize: "1.125rem",
                    fontWeight: "600",
                    color: "#111827",
                  }}
                >
                  使い方ガイド
                </h3>
              </div>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.75rem",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: "0.75rem",
                    padding: "0.75rem",
                    borderRadius: "6px",
                    backgroundColor: "#f9fafb",
                    border: "1px solid #e5e7eb",
                  }}
                >
                  <span
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      width: "24px",
                      height: "24px",
                      backgroundColor: "#2563eb",
                      color: "white",
                      borderRadius: "50%",
                      fontSize: "0.75rem",
                      fontWeight: "bold",
                      flexShrink: 0,
                    }}
                  >
                    1
                  </span>
                  <div>
                    <div
                      style={{
                        fontSize: "0.875rem",
                        fontWeight: "600",
                        color: "#1e293b",
                        marginBottom: "0.25rem",
                      }}
                    >
                      日付を選択
                    </div>
                    <div
                      style={{
                        fontSize: "0.75rem",
                        color: "#64748b",
                        lineHeight: "1.4",
                      }}
                    >
                      カレンダーから撮影したい日付をクリック
                    </div>
                  </div>
                </div>

                <div
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: "0.75rem",
                    padding: "0.75rem",
                    borderRadius: "6px",
                    backgroundColor: "#f9fafb",
                    border: "1px solid #e5e7eb",
                  }}
                >
                  <span
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      width: "24px",
                      height: "24px",
                      backgroundColor: "#10b981",
                      color: "white",
                      borderRadius: "50%",
                      fontSize: "0.75rem",
                      fontWeight: "bold",
                      flexShrink: 0,
                    }}
                  >
                    2
                  </span>
                  <div>
                    <div
                      style={{
                        fontSize: "0.875rem",
                        fontWeight: "600",
                        color: "#1e293b",
                        marginBottom: "0.25rem",
                      }}
                    >
                      地図で位置確認
                    </div>
                    <div
                      style={{
                        fontSize: "0.75rem",
                        color: "#64748b",
                        lineHeight: "1.4",
                      }}
                    >
                      地図上で撮影地点とルート確認
                    </div>
                  </div>
                </div>

                <div
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: "0.75rem",
                    padding: "0.75rem",
                    borderRadius: "6px",
                    backgroundColor: "#f9fafb",
                    border: "1px solid #e5e7eb",
                  }}
                >
                  <span
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      width: "24px",
                      height: "24px",
                      backgroundColor: "#f59e0b",
                      color: "white",
                      borderRadius: "50%",
                      fontSize: "0.75rem",
                      fontWeight: "bold",
                      flexShrink: 0,
                    }}
                  >
                    3
                  </span>
                  <div>
                    <div
                      style={{
                        fontSize: "0.875rem",
                        fontWeight: "600",
                        color: "#1e293b",
                        marginBottom: "0.25rem",
                      }}
                    >
                      撮影地詳細を確認
                    </div>
                    <div
                      style={{
                        fontSize: "0.75rem",
                        color: "#64748b",
                        lineHeight: "1.4",
                      }}
                    >
                      下に表示される詳細情報をチェック
                    </div>
                  </div>
                </div>
              </div>

              <div
                style={{
                  marginTop: "1rem",
                  padding: "0.75rem",
                  backgroundColor: "#f0f9ff",
                  borderRadius: "6px",
                  border: "1px solid #bae6fd",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5rem",
                    fontSize: "0.75rem",
                    color: "#0369a1",
                    fontWeight: "500",
                  }}
                >
                  <Icon name="lightbulb" size={16} />
                  <span>
                    <Icon
                      name="sun"
                      size={14}
                      style={{
                        display: "inline-block",
                        verticalAlign: "middle",
                        marginRight: "2px",
                      }}
                    />
                    ダイヤモンドスカイツリー、
                    <Icon
                      name="moon"
                      size={14}
                      style={{
                        display: "inline-block",
                        verticalAlign: "middle",
                        marginLeft: "4px",
                        marginRight: "2px",
                      }}
                    />
                    パールスカイツリーのアイコンで種類を確認できます
                  </span>
                </div>
              </div>
            </div>

            {/* 選択中の情報 */}
            {selectedDate && (
              <div
                style={{
                  backgroundColor: "white",
                  borderRadius: "8px",
                  padding: "1.5rem",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
                  border: "1px solid #e5e7eb",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    marginBottom: "1rem",
                    paddingBottom: "0.75rem",
                    borderBottom: "1px solid #f3f4f6",
                  }}
                >
                  <Icon
                    name="calendar"
                    size={20}
                    style={{ marginRight: "0.5rem" }}
                  />
                  <h3
                    style={{
                      margin: 0,
                      fontSize: "1.125rem",
                      fontWeight: "600",
                      color: "#111827",
                    }}
                  >
                    選択中の情報
                  </h3>
                </div>

                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "1rem",
                  }}
                >
                  {/* 選択日付 */}
                  <div
                    style={{
                      padding: "0.75rem",
                      backgroundColor: "#f0f9ff",
                      borderRadius: "8px",
                      border: "1px solid #bae6fd",
                      boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
                    }}
                  >
                    <div
                      style={{
                        fontSize: "0.875rem",
                        color: "#0369a1",
                        fontWeight: "600",
                        marginBottom: "0.25rem",
                      }}
                    >
                      選択日付
                    </div>
                    <div
                      style={{
                        fontSize: "1rem",
                        color: "#0c4a6e",
                        fontWeight: "500",
                      }}
                    >
                      {selectedDate.getFullYear()}年
                      {selectedDate.getMonth() + 1}月{selectedDate.getDate()}日
                    </div>
                    <div
                      style={{
                        fontSize: "0.75rem",
                        color: "#0369a1",
                        marginTop: "0.25rem",
                      }}
                    >
                      {
                        ["日", "月", "火", "水", "木", "金", "土"][
                          selectedDate.getDay()
                        ]
                      }
                      曜日
                    </div>
                  </div>

                  {/* 選択地点 */}
                  {selectedLocationId &&
                    locations.length > 0 &&
                    (() => {
                      const selectedLocation = locations.find(
                        (loc) => loc.id === selectedLocationId,
                      );
                      return selectedLocation ? (
                        <div
                          style={{
                            padding: "0.75rem",
                            backgroundColor: "#f0fdf4",
                            borderRadius: "8px",
                            border: "1px solid #bbf7d0",
                            boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
                          }}
                        >
                          <div
                            style={{
                              fontSize: "0.875rem",
                              color: "#166534",
                              fontWeight: "600",
                              marginBottom: "0.25rem",
                            }}
                          >
                            選択地点
                          </div>
                          <div
                            style={{
                              fontSize: "1rem",
                              color: "#14532d",
                              fontWeight: "500",
                              marginBottom: "0.25rem",
                            }}
                          >
                            {selectedLocation.name}
                          </div>
                          <div
                            style={{
                              fontSize: "0.75rem",
                              color: "#166534",
                            }}
                          >
                            {selectedLocation.prefecture || selectedLocation.name} • 標高
                            {selectedLocation.elevation.toFixed(0)}m
                          </div>
                          {selectedLocation.distanceToSkytree && (
                            <div
                              style={{
                                fontSize: "0.75rem",
                                color: "#166534",
                                marginTop: "0.25rem",
                              }}
                            >
                              スカイツリーまで約
                              {selectedLocation.distanceToSkytree.toFixed(
                                1,
                              )}
                              km
                            </div>
                          )}
                        </div>
                      ) : null;
                    })()}

                  {/* イベント数 */}
                  {filteredEvents.length > 0 && (
                    <div
                      style={{
                        padding: "0.75rem",
                        backgroundColor: "#fef3c7",
                        borderRadius: "8px",
                        border: "1px solid #fbbf24",
                        boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
                      }}
                    >
                      <div
                        style={{
                          fontSize: "0.875rem",
                          color: "#92400e",
                          fontWeight: "600",
                          marginBottom: "0.25rem",
                        }}
                      >
                        この日のイベント
                      </div>
                      <div
                        style={{
                          fontSize: "1rem",
                          color: "#78350f",
                          fontWeight: "500",
                        }}
                      >
                        {filteredEvents.length}件のイベント
                      </div>
                      <div
                        style={{
                          fontSize: "0.75rem",
                          color: "#92400e",
                          marginTop: "0.25rem",
                        }}
                      >
                        {new Set(filteredEvents.map((e) => e.location.id)).size}
                        箇所の撮影地点
                      </div>
                    </div>
                  )}



                </div>
              </div>
            )}
          </div>
        </div>
      </div>

    </div>
  );
};

export default HomePage;
