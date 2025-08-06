import { CalendarResponse, LocationsResponse } from "@skytree-photo-planner/types";
import { apiLogger } from "../utils/logger";

class ApiClient {
  private baseUrl: string;

  constructor() {
    this.baseUrl =
      process.env.NODE_ENV === "production"
        ? "/api"
        : "http://localhost:3001/api";
  }

  async getMonthlyCalendar(
    year: number,
    month: number,
  ): Promise<CalendarResponse> {
    try {
      const response = await fetch(`${this.baseUrl}/calendar/${year}/${month}`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();

      // 日付文字列を Date オブジェクトに変換
      const events = data.events.map((event: { date: string; events: Array<{ time: string; [key: string]: unknown }> }) => ({
        ...event,
        date: new Date(event.date),
        events: event.events.map((e) => ({
          ...e,
          time: new Date(e.time),
        })),
      }));

      return {
        year: data.year,
        month: data.month,
        events,
      };
    } catch (error) {
      apiLogger.error("Failed to fetch calendar:", error as Error);
      // フォールバック: 空のデータを返す
      return {
        year,
        month,
        events: [],
      };
    }
  }

  async getLocations(): Promise<LocationsResponse> {
    try {
      const response = await fetch(`${this.baseUrl}/locations`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      apiLogger.error("Failed to fetch locations:", error as Error);
      // フォールバック: 空のデータを返す
      return {
        locations: [],
      };
    }
  }

  async getDayEvents(date: string) {
    try {
      const response = await fetch(`${this.baseUrl}/events/${date}`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();

      // 時刻文字列を Date オブジェクトに変換
      const events = data.events.map((event: { time: string; [key: string]: unknown }) => {
        // 時刻文字列を Date オブジェクトに変換
        return {
          ...event,
          time: new Date(event.time),
        };
      });

      return {
        ...data,
        events,
      };
    } catch (error) {
      apiLogger.error("Failed to fetch day events:", error as Error);
      return { events: [] };
    }
  }


  async getUpcomingEvents(limit: number = 50) {
    try {
      const response = await fetch(
        `${this.baseUrl}/events/upcoming?limit=${limit}`,
      );
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();

      // 時刻文字列を Date オブジェクトに変換
      const events = data.events.map((event: { time: string; [key: string]: unknown }) => ({
        ...event,
        time: new Date(event.time),
      }));

      return { events };
    } catch (error) {
      apiLogger.error("Failed to fetch upcoming events:", error as Error);
      return { events: [] };
    }
  }

  async getBestShotDays(year: number, month: number) {
    try {
      const response = await fetch(
        `${this.baseUrl}/calendar/${year}/${month}/best-shots`,
      );
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();

      // 時刻文字列を Date オブジェクトに変換
      const recommendations = data.recommendations.map((event: { time: string; [key: string]: unknown }) => ({
        ...event,
        time: new Date(event.time),
      }));

      return { recommendations };
    } catch (error) {
      apiLogger.error("Failed to fetch best shot days:", error as Error);
      return { recommendations: [] };
    }
  }

  async mapSearch(params: {
    latitude: number;
    longitude: number;
    elevation?: number;
    scene?: "all" | "diamond" | "pearl";
    searchMode?: "auto" | "fast" | "balanced" | "precise";
    startDate: Date;
    endDate: Date;
  }): Promise<{
    success: boolean;
    events: Array<{
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
    }>;
    searchParams: {
      latitude: number;
      longitude: number;
      elevation: number;
      scene: string;
      searchMode: string;
      startDate: string;
      endDate: string;
    };
    metadata: {
      totalEvents: number;
      searchInterval: number;
      isLimited: boolean;
      originalTotal: number;
    };
  }> {
    try {
      const response = await fetch(`${this.baseUrl}/map-search`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          latitude: params.latitude,
          longitude: params.longitude,
          elevation: params.elevation || 0,
          scene: params.scene || "all",
          searchMode: params.searchMode || "auto",
          startDate: params.startDate.toISOString(),
          endDate: params.endDate.toISOString(),
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      
      // 日付文字列を Date オブジェクトに変換
      const eventsWithDates = data.events.map((event: any) => ({
        ...event,
        time: new Date(event.time),
      }));

      return {
        ...data,
        events: eventsWithDates,
      };
    } catch (error) {
      apiLogger.error("地図検索 API エラー:", error as Error, { params });
      throw error;
    }
  }

  async exportLocations(): Promise<Blob> {
    const response = await fetch(`${this.baseUrl}/admin/locations/export`, {
      method: "GET",
      credentials: "include",
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return await response.blob();
  }

  async importLocations(locationsData: unknown): Promise<unknown> {
    const response = await fetch(`${this.baseUrl}/admin/locations/import`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      credentials: "include",
      body: JSON.stringify(locationsData),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return await response.json();
  }

  getErrorMessage(error: unknown): string {
    if (error && typeof error === 'object') {
      const errorObj = error as { response?: { data?: { message?: string } }, message?: string };
      if (errorObj.response?.data?.message) {
        return errorObj.response.data.message;
      }
      if (errorObj.message) {
        return errorObj.message;
      }
    }
    return "An unexpected error occurred";
  }
}

export const apiClient = new ApiClient();
