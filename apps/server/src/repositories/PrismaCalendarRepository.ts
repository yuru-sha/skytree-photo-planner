import { LocationEvent, Location as PrismaLocation } from '@prisma/client';
import { Location, SkytreeEvent, CalendarStats } from "@skytree-photo-planner/types";
import { getComponentLogger } from "@skytree-photo-planner/utils";
import { CalendarRepository } from "./interfaces/CalendarRepository";
import { PrismaClientManager } from "../database/prisma";

const logger = getComponentLogger("prisma-calendar-repository");

type LocationEventWithLocation = LocationEvent & {
  location: PrismaLocation;
};

export class PrismaCalendarRepository implements CalendarRepository {
  private prisma = PrismaClientManager.getInstance();

  async getMonthlyEvents(year: number, month: number): Promise<SkytreeEvent[]> {
    // 月の範囲を計算
    const monthStartDate = new Date(year, month - 1, 1);
    const monthEndDate = new Date(year, month, 0);

    // カレンダー表示範囲の計算（前月末〜翌月初を含む）
    // 月初の日曜日を取得
    const calendarStartDate = new Date(monthStartDate);
    calendarStartDate.setDate(
      calendarStartDate.getDate() - calendarStartDate.getDay(),
    );

    // 月末が含まれる週の土曜日まで
    const calendarEndDate = new Date(monthEndDate);
    calendarEndDate.setDate(
      calendarEndDate.getDate() + (6 - calendarEndDate.getDay()),
    );
    calendarEndDate.setHours(23, 59, 59, 999);

    logger.debug("getMonthlyEvents: 日付範囲設定", {
      year,
      month,
      monthStart: monthStartDate.toISOString(),
      monthEnd: monthEndDate.toISOString(),
      calendarStart: calendarStartDate.toISOString(),
      calendarEnd: calendarEndDate.toISOString(),
      totalDaysCalculated:
        Math.ceil(
          (calendarEndDate.getTime() - calendarStartDate.getTime()) /
            (1000 * 60 * 60 * 24),
        ) + 1,
    });

    const events = await this.prisma.locationEvent.findMany({
      where: {
        eventDate: {
          gte: calendarStartDate,
          lte: calendarEndDate,
        },
      },
      include: {
        location: true,
      },
      orderBy: {
        eventTime: 'asc',
      },
    });

    return events.map((event: LocationEventWithLocation) =>
      this.mapToSkytreeEvent(event),
    );
  }

  async getDayEvents(date: string): Promise<SkytreeEvent[]> {
    const targetDate = new Date(date + "T00:00:00.000Z");
    const dayStartTime = new Date(targetDate);
    dayStartTime.setUTCHours(0, 0, 0, 0);
    const dayEndTime = new Date(targetDate);
    dayEndTime.setUTCHours(23, 59, 59, 999);

    const events = await this.prisma.locationEvent.findMany({
      where: {
        eventDate: {
          gte: dayStartTime,
          lte: dayEndTime,
        },
      },
      include: {
        location: true,
      },
      orderBy: {
        eventTime: 'asc',
      },
    });

    return events.map((event: LocationEventWithLocation) =>
      this.mapToSkytreeEvent(event),
    );
  }

  async getUpcomingEvents(limit: number = 50): Promise<SkytreeEvent[]> {
    const now = new Date();

    const events = await this.prisma.locationEvent.findMany({
      where: {
        eventTime: {
          gt: now,
        },
      },
      include: {
        location: true,
      },
      orderBy: {
        eventTime: 'asc',
      },
      take: limit,
    });

    return events.map((event: LocationEventWithLocation) =>
      this.mapToSkytreeEvent(event),
    );
  }

  async getLocationYearlyEvents(
    locationId: number,
    year: number,
  ): Promise<SkytreeEvent[]> {
    const startDate = new Date(year, 0, 1);
    const endDate = new Date(year + 1, 0, 0);
    // 年末日の 23:59:59.999 に設定して、その日のイベントも確実に含める
    endDate.setHours(23, 59, 59, 999);

    const events = await this.prisma.locationEvent.findMany({
      where: {
        locationId,
        eventDate: {
          gte: startDate,
          lte: endDate,
        },
      },
      include: {
        location: true,
      },
      orderBy: {
        eventTime: 'asc',
      },
    });

    return events.map((event: LocationEventWithLocation) =>
      this.mapToSkytreeEvent(event),
    );
  }

  async getCalendarStats(year: number): Promise<CalendarStats> {
    const startDate = new Date(year, 0, 1);
    const endDate = new Date(year + 1, 0, 0);
    // 年末日の 23:59:59.999 に設定して、その日のイベントも確実に含める
    endDate.setHours(23, 59, 59, 999);

    const [totalEventsResult, diamondEventsResult, pearlEventsResult, activeLocationsResult] = await Promise.all([
      this.prisma.locationEvent.count({
        where: {
          eventDate: {
            gte: startDate,
            lte: endDate,
          },
        },
      }),
      this.prisma.locationEvent.count({
        where: {
          eventDate: {
            gte: startDate,
            lte: endDate,
          },
          eventType: {
            in: ['diamond_sunrise', 'diamond_sunset'],
          },
        },
      }),
      this.prisma.locationEvent.count({
        where: {
          eventDate: {
            gte: startDate,
            lte: endDate,
          },
          eventType: {
            in: ['pearl_moonrise', 'pearl_moonset'],
          },
        },
      }),
      this.prisma.locationEvent.groupBy({
        by: ['locationId'],
        where: {
          eventDate: {
            gte: startDate,
            lte: endDate,
          },
        },
      }).then(result => result.length),
    ]);

    const totalEvents = totalEventsResult;
    const diamondEvents = diamondEventsResult;
    const pearlEvents = pearlEventsResult;
    const activeLocations = activeLocationsResult;

    return {
      year,
      totalEvents,
      diamondEvents,
      pearlEvents,
      activeLocations,
    };
  }

  async getActiveLocations(): Promise<Location[]> {
    // locationEvent テーブルが存在しないため、全 location を返す
    const locations = await this.prisma.location.findMany({
      orderBy: [{ name: "asc" }],
    });

    return locations.map((location) => ({
      id: location.id,
      name: location.name,
      prefecture: location.prefecture,
      accessInfo: location.accessInfo,
      latitude: location.latitude,
      longitude: location.longitude,
      elevation: location.elevation,
      distanceToSkytree: location.distanceToSkytree,
      azimuthToSkytree: location.azimuthToSkytree,
      elevationToSkytree: location.elevationToSkytree,
      description: location.description,
      measurementNotes: location.measurementNotes,
      parkingInfo: location.parkingInfo,
      status: location.status as Location['status'],
      createdAt: location.createdAt,
      updatedAt: location.updatedAt,
    }));
  }

  async countEventsByDate(
    startDate: string,
    endDate: string,
  ): Promise<{ date: string; count: number }[]> {
    const start = new Date(startDate + "T00:00:00.000Z");
    const end = new Date(endDate + "T23:59:59.999Z");

    const results = await this.prisma.locationEvent.groupBy({
      by: ['eventDate'],
      where: {
        eventDate: {
          gte: start,
          lte: end,
        },
      },
      _count: {
        id: true,
      },
      orderBy: {
        eventDate: 'asc',
      },
    });

    return results.map((result) => ({
      date: result.eventDate.toISOString().split("T")[0],
      count: result._count.id,
    }));
  }

  private mapToSkytreeEvent(event: LocationEventWithLocation): SkytreeEvent {
    // EventType から適切な型に変換
    const eventType = event.eventType.startsWith("diamond")
      ? "diamond"
      : "pearl";
    const subType =
      event.eventType.includes("sunrise")
        ? "sunrise"
        : event.eventType.includes("sunset") 
        ? "sunset"
        : event.eventType.includes("moonrise")
        ? "rising"
        : "setting";

    return {
      id: event.id.toString(),
      type: eventType,
      subType: subType,
      time: event.eventTime,
      location: {
        id: event.location.id,
        name: event.location.name,
        prefecture: event.location.prefecture,
        accessInfo: event.location.accessInfo,
        latitude: event.location.latitude,
        longitude: event.location.longitude,
        elevation: event.location.elevation,
        distanceToSkytree: event.location.distanceToSkytree,
        azimuthToSkytree: event.location.azimuthToSkytree,
        elevationToSkytree: event.location.elevationToSkytree,
        description: event.location.description,
        notes: event.location.measurementNotes,
        parkingInfo: event.location.parkingInfo,
        status: event.location.status,
        createdAt: event.location.createdAt,
        updatedAt: event.location.updatedAt,
      },
      azimuth: event.azimuth,
      elevation: event.altitude,
      moonPhase: event.moonPhase || 0,
      accuracy:
        (event.accuracy as "perfect" | "excellent" | "good" | "fair") || "fair",
    };
  }
}
