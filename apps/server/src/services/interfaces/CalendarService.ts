import { SkytreeEvent, CalendarStats } from "@skytree-photo-planner/types";

export interface CalendarService {
  // 月間カレンダーデータを取得
  getMonthlyCalendar(
    year: number,
    month: number,
  ): Promise<{
    year: number;
    month: number;
    events: Array<{
      date: string;
      type: string;
      events: SkytreeEvent[];
    }>;
  }>;

  // 日別イベント取得
  getDayEvents(date: string): Promise<{ events: SkytreeEvent[] }>;

  // 今後のイベント取得
  getUpcomingEvents(limit?: number): Promise<SkytreeEvent[]>;

  // 地点別年間イベント取得
  getLocationYearlyEvents(
    locationId: number,
    year: number,
  ): Promise<SkytreeEvent[]>;

  // カレンダー統計情報取得
  getCalendarStats(year: number): Promise<CalendarStats>;

}
