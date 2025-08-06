import { Location, CreateLocationRequest } from "@skytree-photo-planner/types";
import { getComponentLogger } from "@skytree-photo-planner/utils";
import { PrismaClientManager } from "../database/prisma";
import { LocationRepository } from "./interfaces/LocationRepository";

const logger = getComponentLogger("PrismaLocationRepository");

/**
 * Prisma を使用した LocationRepository の実装
 * データアクセス層を抽象化し、具体的な実装を分離
 */
export class PrismaLocationRepository implements LocationRepository {
  private prisma = PrismaClientManager.getInstance();

  async findAll(): Promise<Location[]> {
    logger.debug("全撮影地点取得開始");

    const locations = await this.prisma.location.findMany({
      orderBy: {
        id: "asc",
      },
    });

    logger.info("全撮影地点取得成功", {
      locationCount: locations.length,
    });

    return locations.map(this.formatLocation);
  }

  async findById(id: number): Promise<Location | null> {
    logger.debug("撮影地点取得開始", { locationId: id });

    const location = await this.prisma.location.findUnique({
      where: { id },
      include: {
        events: {
          where: {
            eventDate: {
              gte: new Date(),
            },
          },
          orderBy: {
            eventDate: "asc",
          },
          take: 10,
        },
      },
    });

    if (!location) {
      logger.warn("撮影地点が見つかりません", { locationId: id });
      return null;
    }

    logger.info("撮影地点取得成功", {
      locationId: id,
      locationName: location.name,
      upcomingEvents: location.events.length,
    });

    return this.formatLocation(location);
  }

  async create(
    data: CreateLocationRequest & {
      azimuthToSkytree?: number;
      elevationToSkytree?: number;
      distanceToSkytree?: number;
      measurementNotes?: string;
      status?: 'active' | 'restricted';
    },
  ): Promise<Location> {
    logger.debug("撮影地点作成開始", { name: data.name });

    const location = await this.prisma.location.create({
      data: {
        name: data.name,
        prefecture: data.prefecture,
        accessInfo: data.accessInfo,
        latitude: data.latitude,
        longitude: data.longitude,
        elevation: data.elevation,
        description: data.description,
        measurementNotes: data.measurementNotes,
        parkingInfo: data.parkingInfo,
        azimuthToSkytree: data.azimuthToSkytree,
        elevationToSkytree: data.elevationToSkytree,
        distanceToSkytree: data.distanceToSkytree,
        status: (data.status as any) || 'active',
      },
    });

    logger.info("撮影地点作成成功", {
      locationId: location.id,
      locationName: location.name,
      accessInfo: location.accessInfo,
    });

    return this.formatLocation(location);
  }

  async update(
    id: number,
    data: Partial<CreateLocationRequest> & {
      azimuthToSkytree?: number;
      elevationToSkytree?: number;
      distanceToSkytree?: number;
      measurementNotes?: string;
    },
  ): Promise<Location> {
    logger.debug("撮影地点更新開始", { locationId: id });

    const location = await this.prisma.location.update({
      where: { id },
      data: {
        ...data,
        updatedAt: new Date(),
      },
    });

    logger.info("撮影地点更新成功", {
      locationId: id,
      locationName: location.name,
    });

    return this.formatLocation(location);
  }

  async delete(id: number): Promise<void> {
    logger.debug("撮影地点削除開始", { locationId: id });

    await this.prisma.location.delete({
      where: { id },
    });

    logger.info("撮影地点削除成功", { locationId: id });
  }

  async updateSkytreeMetrics(
    id: number,
    metrics: {
      azimuthToSkytree: number;
      elevationToSkytree: number;
      distanceToSkytree: number;
    },
  ): Promise<void> {
    logger.debug("スカイツリーメトリクス更新開始", { locationId: id });

    await this.prisma.location.update({
      where: { id },
      data: {
        azimuthToSkytree: metrics.azimuthToSkytree,
        elevationToSkytree: metrics.elevationToSkytree,
        distanceToSkytree: metrics.distanceToSkytree,
        updatedAt: new Date(),
      },
    });

    logger.info("スカイツリーメトリクス更新成功", {
      locationId: id,
      metrics,
    });
  }

  async findByCondition(condition: {
    prefecture?: string;
    minElevation?: number;
    maxElevation?: number;
  }): Promise<Location[]> {
    logger.debug("条件検索開始", { condition });

    const where: Record<string, unknown> = {};

    if (condition.prefecture) {
      where.address = { contains: condition.prefecture };
    }

    if (
      condition.minElevation !== undefined ||
      condition.maxElevation !== undefined
    ) {
      where.elevation = {} as any;
      if (condition.minElevation !== undefined) {
        (where.elevation as any).gte = condition.minElevation;
      }
      if (condition.maxElevation !== undefined) {
        (where.elevation as any).lte = condition.maxElevation;
      }
    }

    const locations = await this.prisma.location.findMany({
      where,
      orderBy: {
        id: "asc",
      },
    });

    logger.info("条件検索成功", {
      condition,
      locationCount: locations.length,
    });

    return locations.map(this.formatLocation);
  }

  /**
   * Prisma の Location オブジェクトを型安全な Location オブジェクトに変換
   */
  private formatLocation(prismaLocation: {
    id: number;
    name: string;
    prefecture: string;
    latitude: number;
    longitude: number;
    elevation: number;
    description?: string | null;
    accessInfo?: string | null;
    measurementNotes?: string | null;
    parkingInfo?: string | null;
    azimuthToSkytree: number;
    elevationToSkytree: number;
    distanceToSkytree: number;
    status: string;
    createdAt: Date;
    updatedAt: Date;
  }): Location {
    return {
      id: prismaLocation.id,
      name: prismaLocation.name,
      prefecture: prismaLocation.prefecture,
      accessInfo: prismaLocation.accessInfo,
      latitude: prismaLocation.latitude,
      longitude: prismaLocation.longitude,
      elevation: prismaLocation.elevation,
      description: prismaLocation.description,
      measurementNotes: prismaLocation.measurementNotes,
      parkingInfo: prismaLocation.parkingInfo,
      azimuthToSkytree: prismaLocation.azimuthToSkytree,
      elevationToSkytree: prismaLocation.elevationToSkytree,
      distanceToSkytree: prismaLocation.distanceToSkytree,
      status: prismaLocation.status as 'active' | 'restricted',
      createdAt: prismaLocation.createdAt,
      updatedAt: prismaLocation.updatedAt,
    };
  }
}
