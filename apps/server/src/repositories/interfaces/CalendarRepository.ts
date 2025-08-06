import { Location, SkytreeEvent, CalendarStats } from "@skytree-photo-planner/types";

export interface CalendarRepository {
  // 月間イベント取得
  getMonthlyEvents(year: number, month: number): Promise<SkytreeEvent[]>;

  // 日別イベント取得
  getDayEvents(date: string): Promise<SkytreeEvent[]>;

  // 今後のイベント取得
  getUpcomingEvents(limit?: number): Promise<SkytreeEvent[]>;

  // 地点別年間イベント取得
  getLocationYearlyEvents(
    locationId: number,
    year: number,
  ): Promise<SkytreeEvent[]>;

  // カレンダー統計情報取得
  getCalendarStats(year: number): Promise<CalendarStats>;

  // アクティブな地点取得
  getActiveLocations(): Promise<Location[]>;

  // イベント件数カウント
  countEventsByDate(
    startDate: string,
    endDate: string,
  ): Promise<{ date: string; count: number }[]>;
}
