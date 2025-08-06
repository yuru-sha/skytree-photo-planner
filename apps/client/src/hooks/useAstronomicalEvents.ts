import { useState, useEffect, useCallback } from "react";
import { SkytreeEvent, CalendarResponse } from "@skytree-photo-planner/types";
import { apiClient } from "../services/apiClient";
import { getComponentLogger } from "@skytree-photo-planner/utils";

const logger = getComponentLogger("useAstronomicalEvents");

export interface UseAstronomicalEventsOptions {
  year: number;
  month: number;
  selectedDate?: Date | null;
  selectedLocationId?: number;
  selectedEventId?: string;
}

export interface UseAstronomicalEventsResult {
  calendarData: CalendarResponse | null;
  dayEvents: SkytreeEvent[];
  loading: boolean;
  error: string | null;
  refreshData: () => Promise<void>;
}

/**
 * 天体イベントデータの管理フック
 * カレンダーデータ、日別イベント、天気情報を統合管理
 */
export function useAstronomicalEvents(
  options: UseAstronomicalEventsOptions,
): UseAstronomicalEventsResult {
  const { year, month, selectedDate, selectedLocationId, selectedEventId } =
    options;

  const [calendarData, setCalendarData] = useState<CalendarResponse | null>(
    null,
  );
  const [dayEvents, setDayEvents] = useState<SkytreeEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // カレンダーデータを取得
  const loadCalendarData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      logger.debug("カレンダーデータを取得開始", { year, month });
      const response = await apiClient.getMonthlyCalendar(year, month);

      setCalendarData(response);
      logger.info("カレンダーデータ取得成功", {
        year,
        month,
        eventCount: response.events.length,
      });
    } catch (err: unknown) {
      const errorMessage = `カレンダーデータの取得に失敗しました: ${err instanceof Error ? err.message : String(err)}`;
      logger.error("カレンダーデータ取得エラー", err, { year, month });
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  }, [year, month]);

  // 選択日のイベントと天気情報を取得
  const loadDayData = useCallback(
    async (date: Date) => {
      try {
        const dateString = date.toISOString().split("T")[0];
        logger.debug("日別データ取得開始", {
          date: dateString,
          selectedLocationId,
          selectedEventId,
        });

        // 日別イベント取得
        const eventsResponse = await apiClient.getDayEvents(dateString);
        setDayEvents(eventsResponse.events || []);


        logger.info("日別データ取得成功", {
          date: dateString,
          eventCount: eventsResponse.events?.length || 0,
        });
      } catch (err: unknown) {
        logger.error("日別データ取得エラー", err, {
          date: date.toISOString().split("T")[0],
          selectedLocationId,
        });
        setDayEvents([]);
      }
    },
    [selectedLocationId, selectedEventId],
  );

  // データ更新関数
  const refreshData = useCallback(async () => {
    await loadCalendarData();
    if (selectedDate) {
      await loadDayData(selectedDate);
    }
  }, [loadCalendarData, loadDayData, selectedDate]);

  // カレンダーデータの初期読み込み
  useEffect(() => {
    loadCalendarData();
  }, [loadCalendarData]);

  // 選択日変更時の日別データ読み込み
  useEffect(() => {
    if (selectedDate) {
      loadDayData(selectedDate);
    } else {
      setDayEvents([]);
    }
  }, [selectedDate, loadDayData]);

  return {
    calendarData,
    dayEvents,
    loading,
    error,
    refreshData,
  };
}
