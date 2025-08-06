import { Location, CreateLocationRequest, SKYTREE_COORDINATES } from "@skytree-photo-planner/types";
import { getComponentLogger } from "@skytree-photo-planner/utils";
import { LocationRepository } from "../repositories/interfaces/LocationRepository";
import { SkytreeAstronomicalCalculator } from "./SkytreeAstronomicalCalculator";
import { QueueService } from "./interfaces/QueueService";

const logger = getComponentLogger("LocationService");

// Fallback coordinates in case import fails
const FALLBACK_SKYTREE_COORDINATES = {
  latitude: 35.7100069,
  longitude: 139.8108103,
  elevation: 638,
} as const;

/**
 * Location ビジネスロジック層
 * Repository パターンでデータアクセス層と Controller 層を分離
 */
export class LocationService {
  constructor(
    private locationRepository: LocationRepository,
    private astronomicalCalculator: SkytreeAstronomicalCalculator,
    private queueService: QueueService,
  ) {}

  /**
   * 座標データから完全な Location オブジェクトを作成
   */
  private createLocationObject(params: {
    id?: number;
    name?: string;
    prefecture?: string;
    accessInfo?: string;
    latitude: number;
    longitude: number;
    elevation: number;
    description?: string | null;
    measurementNotes?: string | null;
    parkingInfo?: string | null;
    createdAt?: Date;
    updatedAt?: Date;
  }): Location {
    return {
      id: params.id ?? 0,
      name: params.name ?? '',
      prefecture: params.prefecture ?? '',
      latitude: params.latitude,
      longitude: params.longitude,
      elevation: params.elevation,
      description: params.description ?? null,
      accessInfo: params.accessInfo ?? null,
      measurementNotes: params.measurementNotes ?? null,
      parkingInfo: params.parkingInfo ?? null,
      azimuthToSkytree: 0, // 計算時は一時的に 0
      elevationToSkytree: 0, // 計算時は一時的に 0
      distanceToSkytree: 0, // 計算時は一時的に 0
      status: 'active',
      createdAt: params.createdAt ?? new Date(),
      updatedAt: params.updatedAt ?? new Date(),
    };
  }

  /**
   * スカイツリー仰角を安全に計算
   */
  private calculateSkytreeElevationSafely(
    locationData: Location,
    context: string
  ): number {
    logger.info(`仰角計算開始: ${context}`, {
      locationId: locationData.id,
      latitude: locationData.latitude,
      longitude: locationData.longitude,
      elevation: locationData.elevation,
    });

    try {
      const elevation = this.astronomicalCalculator.calculateElevationToSkytree(locationData);
      
      logger.info(`仰角計算成功: ${context}`, {
        locationId: locationData.id,
        latitude: locationData.latitude,
        longitude: locationData.longitude,
        elevation: locationData.elevation,
        calculatedElevation: elevation,
        isZero: elevation === 0,
        isNaN: isNaN(elevation),
        isFinite: isFinite(elevation),
      });
      
      return elevation;
    } catch (elevationError) {
      logger.error(`スカイツリー仰角計算エラー: ${context}`, elevationError, {
        locationId: locationData.id,
        latitude: locationData.latitude,
        longitude: locationData.longitude,
        elevation: locationData.elevation,
        errorMessage: elevationError instanceof Error ? elevationError.message : 'Unknown error',
        errorStack: elevationError instanceof Error ? elevationError.stack : undefined,
      });
      return 0; // エラー時は 0 を設定
    }
  }

  /**
   * 全地点の取得
   */
  async getAllLocations(): Promise<Location[]> {
    return await this.locationRepository.findAll();
  }

  /**
   * ID による地点の取得
   */
  async getLocationById(id: number): Promise<Location | null> {
    return await this.locationRepository.findById(id);
  }

  /**
   * 新しい地点の作成
   * ユーザー入力値を優先し、未入力の場合のみ自動計算
   */
  async createLocation(
    data: CreateLocationRequest & {
      azimuthToSkytree?: number;
      elevationToSkytree?: number;
      distanceToSkytree?: number;
      measurementNotes?: string;
    },
  ): Promise<Location> {
    logger.info("地点作成開始", {
      name: data.name,
      accessInfo: data.accessInfo,
    });

    // ユーザー入力値があるかチェック
    const hasUserInputs =
      data.azimuthToSkytree !== undefined ||
      data.elevationToSkytree !== undefined ||
      data.distanceToSkytree !== undefined;

    let finalAzimuthToSkytree: number;
    let finalElevationToSkytree: number;
    let finalDistanceToSkytree: number;

    if (hasUserInputs) {
      // ユーザー入力値を優先
      logger.info("ユーザー入力値を使用", {
        userAzimuthToSkytree: data.azimuthToSkytree,
        userElevationToSkytree: data.elevationToSkytree,
        userDistanceToSkytree: data.distanceToSkytree,
      });

      // 入力されていない項目のみ自動計算
      const calculatedMetrics = this.calculateSkytreeMetrics(
        data.latitude,
        data.longitude,
        data.elevation,
      );

      finalAzimuthToSkytree = data.azimuthToSkytree ?? calculatedMetrics.azimuth;
      finalDistanceToSkytree = data.distanceToSkytree ?? calculatedMetrics.distance;

      if (data.elevationToSkytree !== undefined) {
        finalElevationToSkytree = data.elevationToSkytree;
      } else {
        // 仰角を同期的に計算
        const locationObj = this.createLocationObject({
          latitude: data.latitude,
          longitude: data.longitude,
          elevation: data.elevation,
          prefecture: data.prefecture,
        });
        finalElevationToSkytree = this.calculateSkytreeElevationSafely(locationObj, "新規作成・ユーザー入力");
      }
    } else {
      // 従来通り全て自動計算
      logger.info("自動計算値を使用");
      const skytreeMetrics = this.calculateSkytreeMetrics(
        data.latitude,
        data.longitude,
        data.elevation,
      );

      finalAzimuthToSkytree = skytreeMetrics.azimuth;
      finalDistanceToSkytree = skytreeMetrics.distance;
      // 仰角を同期的に計算
      const locationObj = this.createLocationObject({
        latitude: data.latitude,
        longitude: data.longitude,
        elevation: data.elevation,
        prefecture: data.prefecture,
      });
      finalElevationToSkytree = this.calculateSkytreeElevationSafely(locationObj, "新規作成・自動計算");
    }

    // データベースに保存
    const locationData: CreateLocationRequest & {
      azimuthToSkytree?: number;
      elevationToSkytree?: number;
      distanceToSkytree?: number;
      measurementNotes?: string;
    } = {
      ...data,
      azimuthToSkytree: finalAzimuthToSkytree,
      elevationToSkytree: finalElevationToSkytree,
      distanceToSkytree: finalDistanceToSkytree,
    };

    const location = await this.locationRepository.create(locationData);

    // スカイツリー関連データの更新（既に同期的に計算済み）
    await this.locationRepository.updateSkytreeMetrics(location.id, {
      azimuthToSkytree: finalAzimuthToSkytree,
      elevationToSkytree: finalElevationToSkytree, // 同期的に計算済み
      distanceToSkytree: finalDistanceToSkytree,
    });

    // キューに天体計算ジョブを追加（当年・翌年の 2 年分）
    const currentYear = new Date().getFullYear();
    const nextYear = currentYear + 1;

    // 非同期でジョブを登録（レスポンスを待たない）
    this.queueService
      .scheduleLocationCalculation(
        location.id,
        currentYear,
        nextYear,
        "normal",
      )
      .then((jobId) => {
        if (jobId) {
          logger.info("天体計算ジョブ追加成功", {
            locationId: location.id,
            jobId,
            years: `${currentYear}-${nextYear}`,
          });
        } else {
          logger.warn("天体計算ジョブ追加失敗（キュー無効）", {
            locationId: location.id,
          });
        }
      })
      .catch((error) => {
        logger.error("天体計算ジョブ追加エラー", error, {
          locationId: location.id,
        });
      });

    logger.info("地点作成完了", {
      locationId: location.id,
      name: location.name,
      distanceToSkytree: location.distanceToSkytree,
      azimuthToSkytree: location.azimuthToSkytree,
      elevationToSkytree: location.elevationToSkytree,
    });

    return location;
  }

  /**
   * 地点の更新
   * ユーザー入力値を優先し、未入力の場合のみ自動計算
   */
  async updateLocation(
    id: number,
    data: Partial<CreateLocationRequest> & {
      azimuthToSkytree?: number | null;
      elevationToSkytree?: number | null;
      distanceToSkytree?: number | null;
      measurementNotes?: string;
    },
  ): Promise<Location | null> {
    logger.info("地点更新開始", { locationId: id });

    const currentLocation = await this.locationRepository.findById(id);
    if (!currentLocation) {
      return null;
    }

    // 位置情報または skytree*フィールドが変更された場合の処理
    const locationChanged =
      data.latitude !== undefined ||
      data.longitude !== undefined ||
      data.elevation !== undefined;
    const skytreeDataProvided =
      data.azimuthToSkytree !== undefined ||
      data.elevationToSkytree !== undefined ||
      data.distanceToSkytree !== undefined;

    let updateData = data;
    if (locationChanged || skytreeDataProvided) {
      const newLatitude = data.latitude ?? currentLocation.latitude;
      const newLongitude = data.longitude ?? currentLocation.longitude;
      const newElevation = data.elevation ?? currentLocation.elevation;

      // 値の検証
      if (typeof newLatitude !== 'number' || typeof newLongitude !== 'number' || typeof newElevation !== 'number') {
        throw new Error(`位置データが不正です: lat=${newLatitude}, lng=${newLongitude}, elv=${newElevation}`);
      }

      // ユーザー入力値を優先、null の場合は自動計算
      let finalAzimuthToSkytree: number;
      let finalElevationToSkytree: number;
      let finalDistanceToSkytree: number;

      if (skytreeDataProvided) {
        // ユーザー入力値を処理
        const calculatedMetrics = this.calculateSkytreeMetrics(
          newLatitude,
          newLongitude,
          newElevation,
        );

        // null の場合は自動計算値を使用、undefined の場合は現在値を保持
        if (data.azimuthToSkytree !== undefined) {
          finalAzimuthToSkytree = data.azimuthToSkytree ?? calculatedMetrics.azimuth;
        } else {
          finalAzimuthToSkytree =
            currentLocation.azimuthToSkytree ?? calculatedMetrics.azimuth;
        }

        if (data.distanceToSkytree !== undefined) {
          finalDistanceToSkytree = data.distanceToSkytree ?? calculatedMetrics.distance;
        } else {
          finalDistanceToSkytree =
            currentLocation.distanceToSkytree ?? calculatedMetrics.distance;
        }

        // 仰角を同期的に計算
        if (data.elevationToSkytree !== undefined) {
          if (data.elevationToSkytree === null) {
            // null の場合は自動計算
            const locationObj = this.createLocationObject({
              id: id,
              name: currentLocation.name,
              prefecture: currentLocation.prefecture,
              accessInfo: currentLocation.accessInfo,
              latitude: newLatitude,
              longitude: newLongitude,
              elevation: newElevation,
              description: currentLocation.description,
              measurementNotes: currentLocation.measurementNotes,
              parkingInfo: currentLocation.parkingInfo,
              createdAt: currentLocation.createdAt,
              updatedAt: new Date(),
            });
            finalElevationToSkytree = this.calculateSkytreeElevationSafely(locationObj, "更新・ null 指定");
          } else {
            // 値が指定されている場合はその値を使用
            finalElevationToSkytree = data.elevationToSkytree;
          }
        } else {
          // elevationToSkytree が undefined の場合は現在値を保持、または自動計算
          if (currentLocation.elevationToSkytree !== null) {
            finalElevationToSkytree = currentLocation.elevationToSkytree;
          } else {
            const locationObj = this.createLocationObject({
              id: id,
              name: currentLocation.name,
              prefecture: currentLocation.prefecture,
              accessInfo: currentLocation.accessInfo,
              latitude: newLatitude,
              longitude: newLongitude,
              elevation: newElevation,
              description: currentLocation.description,
              measurementNotes: currentLocation.measurementNotes,
              parkingInfo: currentLocation.parkingInfo,
              createdAt: currentLocation.createdAt,
              updatedAt: new Date(),
            });
            finalElevationToSkytree = this.calculateSkytreeElevationSafely(locationObj, "更新・既存値 null");
          }
        }

        logger.info("ユーザー入力値を更新に適用", {
          locationId: id,
          userAzimuthToSkytree: data.azimuthToSkytree,
          userElevationToSkytree: data.elevationToSkytree,
          userDistanceToSkytree: data.distanceToSkytree,
          finalAzimuthToSkytree,
          finalElevationToSkytree,
          finalDistanceToSkytree,
        });
      } else {
        // 位置情報のみ変更の場合は自動計算
        const skytreeMetrics = this.calculateSkytreeMetrics(
          newLatitude,
          newLongitude,
          newElevation,
        );

        finalAzimuthToSkytree = skytreeMetrics.azimuth;
        finalDistanceToSkytree = skytreeMetrics.distance;
        // 仰角を同期的に計算
        const locationObj = this.createLocationObject({
          id: id,
          name: currentLocation.name,
          prefecture: currentLocation.prefecture,
          accessInfo: currentLocation.accessInfo,
          latitude: newLatitude,
          longitude: newLongitude,
          elevation: newElevation,
          description: currentLocation.description,
          measurementNotes: currentLocation.measurementNotes,
          parkingInfo: currentLocation.parkingInfo,
          createdAt: currentLocation.createdAt,
          updatedAt: new Date(),
        });
        finalElevationToSkytree = this.calculateSkytreeElevationSafely(locationObj, "位置変更");

        logger.info("位置変更によりスカイツリー関連データを自動計算", {
          locationId: id,
          calculatedAzimuthToSkytree: finalAzimuthToSkytree,
          calculatedElevationToSkytree: finalElevationToSkytree,
          calculatedDistanceToSkytree: finalDistanceToSkytree,
        });
      }

      // スカイツリー関連データを更新データに追加
      updateData = {
        ...data,
        azimuthToSkytree: finalAzimuthToSkytree,
        elevationToSkytree: finalElevationToSkytree,
        distanceToSkytree: finalDistanceToSkytree,
      };
    }

    const updatedLocation = await this.locationRepository.update(id, updateData);

    if (updatedLocation) {
      logger.info("地点更新完了", { locationId: id });

      // 仰角は既に同期的に計算済み

      // 位置情報が変更された場合は天体計算を再実行（当年・翌年の 2 年分）
      logger.debug("地点更新チェック", {
        locationId: id,
        hasLatitude: data.latitude !== undefined,
        hasLongitude: data.longitude !== undefined,
        hasElevation: data.elevation !== undefined,
        hasQueueService: !!this.queueService,
      });

      if (
        data.latitude !== undefined ||
        data.longitude !== undefined ||
        data.elevation !== undefined
      ) {
        const currentYear = new Date().getFullYear();
        const nextYear = currentYear + 1;

        logger.info("位置情報変更を検出 - 天体計算ジョブを登録", {
          locationId: id,
          years: `${currentYear}-${nextYear}`,
          queueServiceExists: !!this.queueService,
        });

        // 非同期でジョブを登録（レスポンスを待たない）
        this.queueService
          .scheduleLocationCalculation(
            id,
            currentYear,
            nextYear,
            "high", // 更新時は高優先度
          )
          .then((jobId) => {
            if (jobId) {
              logger.info("位置変更による天体計算ジョブ追加成功", {
                locationId: id,
                jobId,
                years: `${currentYear}-${nextYear}`,
              });
            } else {
              logger.warn("天体計算ジョブ追加失敗（キュー無効）", {
                locationId: id,
              });
            }
          })
          .catch((error) => {
            logger.error("天体計算ジョブ追加エラー", error, { locationId: id });
          });
      }
    }

    return updatedLocation;
  }

  /**
   * ID がある場合は更新、ない場合は新規作成（アップサート）
   */
  async upsertLocation(
    data: CreateLocationRequest & {
      id?: number;
      azimuthToSkytree?: number | null;
      elevationToSkytree?: number | null;
      distanceToSkytree?: number | null;
      measurementNotes?: string;
    },
  ): Promise<{ location: Location; isNew: boolean }> {
    const { id, ...locationData } = data;

    if (id) {
      // ID がある場合は更新
      logger.info("地点アップサート - 更新モード", { locationId: id });
      const existingLocation = await this.locationRepository.findById(id);
      
      if (existingLocation) {
        const updatedLocation = await this.updateLocation(id, locationData);
        if (updatedLocation) {
          return { location: updatedLocation, isNew: false };
        } else {
          throw new Error(`地点 ID ${id} の更新に失敗しました`);
        }
      } else {
        // ID が指定されているが存在しない場合はエラー
        throw new Error(`指定された ID ${id} の地点が見つかりません`);
      }
    } else {
      // ID がない場合は新規作成
      logger.info("地点アップサート - 新規作成モード");
      const newLocation = await this.createLocation(locationData);
      return { location: newLocation, isNew: true };
    }
  }

  /**
   * 地点の削除
   */
  async deleteLocation(id: number): Promise<boolean> {
    logger.info("地点削除開始", { locationId: id });

    await this.locationRepository.delete(id);
    logger.info("地点削除完了", { locationId: id });

    return true;
  }

  /**
   * 条件による地点の検索
   */
  async searchLocations(condition: {
    prefecture?: string;
    minElevation?: number;
    maxElevation?: number;
  }): Promise<Location[]> {
    return await this.locationRepository.findByCondition(condition);
  }

  /**
   * スカイツリーへの距離・方位角を計算
   */
  private calculateSkytreeMetrics(
    latitude: number,
    longitude: number,
    _elevation: number,
  ): {
    distance: number;
    azimuth: number;
  } {
    // SKYTREE_COORDINATES 定数を使用して座標の整合性を保つ
    const coords = SKYTREE_COORDINATES || FALLBACK_SKYTREE_COORDINATES;
    const SKYTREE_LAT = coords.latitude;
    const SKYTREE_LON = coords.longitude;

    // Haversine 公式で距離を計算
    const R = 6371000; // 地球の半径（メートル）
    const dLat = this.toRadians(SKYTREE_LAT - latitude);
    const dLon = this.toRadians(SKYTREE_LON - longitude);

    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRadians(latitude)) *
        Math.cos(this.toRadians(SKYTREE_LAT)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = R * c;

    // 方位角を計算
    const y =
      Math.sin(this.toRadians(SKYTREE_LON - longitude)) *
      Math.cos(this.toRadians(SKYTREE_LAT));
    const x =
      Math.cos(this.toRadians(latitude)) * Math.sin(this.toRadians(SKYTREE_LAT)) -
      Math.sin(this.toRadians(latitude)) *
        Math.cos(this.toRadians(SKYTREE_LAT)) *
        Math.cos(this.toRadians(SKYTREE_LON - longitude));

    let azimuth = Math.atan2(y, x);
    azimuth = this.toDegrees(azimuth);
    azimuth = (azimuth + 360) % 360; // 0-360 度に正規化

    return {
      distance: Math.round(distance), // メートル単位で保存（精度保持）
      azimuth: Math.round(azimuth * 100) / 100, // 小数点以下 2 桁
    };
  }

  /**
   * 度をラジアンに変換
   */
  private toRadians(degrees: number): number {
    return degrees * (Math.PI / 180);
  }

  /**
   * ラジアンを度に変換
   */
  private toDegrees(radians: number): number {
    return radians * (180 / Math.PI);
  }
}
