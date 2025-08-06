import {
  FavoriteLocation,
  FavoriteEvent,
  Favorites,
  Location,
  FujiEvent,
} from "@skytree-photo-planner/types";
import { uiLogger } from "../utils/logger";

const STORAGE_KEY = "skytree-photo-planner-favorites";

/**
 * ローカルストレージベースのお気に入り管理サービス
 */
export class FavoritesService {
  private storage: Storage;

  constructor(storage: Storage = localStorage) {
    this.storage = storage;
  }

  /**
   * お気に入りデータを取得
   */
  getFavorites(): Favorites {
    try {
      const data = this.storage.getItem(STORAGE_KEY);

      if (!data) {
        return { locations: [], events: [] };
      }

      const parsed = JSON.parse(data) as Favorites;

      // データ構造の検証
      if (!parsed.locations || !Array.isArray(parsed.locations)) {
        parsed.locations = [];
      }
      if (!parsed.events || !Array.isArray(parsed.events)) {
        parsed.events = [];
      }

      return parsed;
    } catch (error) {
      // ローカルストレージのエラーは通常の動作であり、ログ出力不要
      return { locations: [], events: [] };
    }
  }

  /**
   * お気に入りデータを保存
   */
  private saveFavorites(favorites: Favorites): boolean {
    try {
      const jsonString = JSON.stringify(favorites);

      this.storage.setItem(STORAGE_KEY, jsonString);

      // 保存確認
      const saved = this.storage.getItem(STORAGE_KEY);
      const saveSuccess = saved === jsonString;

      return saveSuccess;
    } catch (error) {
      // ローカルストレージの保存エラーは通常の動作であり、ログ出力不要
      return false;
    }
  }

  /**
   * 撮影地点をお気に入りに追加
   */
  addLocationToFavorites(location: Location): boolean {
    const favorites = this.getFavorites();

    // 既に登録済みかチェック
    if (favorites.locations.some((fav) => fav.id === location.id)) {
      return false; // 既に登録済み
    }

    const favoriteLocation: FavoriteLocation = {
      id: location.id,
      name: location.name,
      accessInfo: location.accessInfo,
      latitude: location.latitude,
      longitude: location.longitude,
      addedAt: new Date().toISOString(),
    };

    favorites.locations.push(favoriteLocation);

    const result = this.saveFavorites(favorites);

    return result;
  }

  /**
   * 撮影地点をお気に入りから削除
   */
  removeLocationFromFavorites(locationId: number): boolean {
    const favorites = this.getFavorites();
    const initialLength = favorites.locations.length;

    favorites.locations = favorites.locations.filter(
      (fav) => fav.id !== locationId,
    );

    if (favorites.locations.length === initialLength) {
      return false; // 削除対象が見つからなかった
    }

    return this.saveFavorites(favorites);
  }

  /**
   * 撮影地点がお気に入りに登録されているかチェック
   */
  isLocationFavorite(locationId: number): boolean {
    const favorites = this.getFavorites();
    return favorites.locations.some((fav) => fav.id === locationId);
  }

  /**
   * イベントをお気に入りに追加
   */
  addEventToFavorites(event: FujiEvent): boolean {
    const favorites = this.getFavorites();

    // 既に登録済みかチェック
    uiLogger.debug('イベント追加試行:', {
      eventId: event.id,
      existingEventsCount: favorites.events.length,
      existingEventIds: favorites.events.map(e => e.id)
    });
    
    const isDuplicate = favorites.events.some((fav) => fav.id === event.id);
    uiLogger.debug('重複判定結果:', { isDuplicate });
    
    if (isDuplicate) {
      uiLogger.debug('既に登録済みのため追加をスキップ');
      return false; // 既に登録済み
    }

    const favoriteEvent: FavoriteEvent = {
      id: event.id,
      type: event.type,
      subType: event.subType,
      time: event.time.toISOString(),
      locationId: event.location.id,
      locationName: event.location.name,
      locationLatitude: event.location.latitude,
      locationLongitude: event.location.longitude,
      azimuth: event.azimuth,
      elevation: event.elevation || 0,
      addedAt: new Date().toISOString(),
    };

    favorites.events.push(favoriteEvent);
    return this.saveFavorites(favorites);
  }

  /**
   * イベントをお気に入りから削除
   */
  removeEventFromFavorites(eventId: string): boolean {
    const favorites = this.getFavorites();
    const initialLength = favorites.events.length;

    favorites.events = favorites.events.filter((fav) => fav.id !== eventId);

    if (favorites.events.length === initialLength) {
      return false; // 削除対象が見つからなかった
    }

    return this.saveFavorites(favorites);
  }

  /**
   * イベントがお気に入りに登録されているかチェック
   */
  isEventFavorite(eventId: string): boolean {
    const favorites = this.getFavorites();
    return favorites.events.some((fav) => fav.id === eventId);
  }

  /**
   * お気に入り撮影地点一覧を取得（追加日時順）
   */
  getFavoriteLocations(): FavoriteLocation[] {
    const favorites = this.getFavorites();
    return favorites.locations
      .slice()
      .sort(
        (a, b) => new Date(b.addedAt).getTime() - new Date(a.addedAt).getTime(),
      );
  }

  /**
   * お気に入りイベント一覧を取得（イベント時刻順）
   */
  getFavoriteEvents(): FavoriteEvent[] {
    const favorites = this.getFavorites();
    return favorites.events
      .slice()
      .sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
  }

  /**
   * 今後のお気に入りイベント一覧を取得
   */
  getUpcomingFavoriteEvents(): FavoriteEvent[] {
    const now = new Date();
    return this.getFavoriteEvents().filter(
      (event) => new Date(event.time) > now,
    );
  }

  /**
   * 過去のお気に入りイベント一覧を取得
   */
  getPastFavoriteEvents(): FavoriteEvent[] {
    const now = new Date();
    return this.getFavoriteEvents()
      .filter((event) => new Date(event.time) <= now)
      .reverse(); // 最新から順番に
  }

  /**
   * お気に入りデータをクリア
   */
  clearFavorites(): boolean {
    try {
      this.storage.removeItem(STORAGE_KEY);
      return true;
    } catch (error) {
      // ローカルストレージのクリアエラーは通常の動作であり、ログ出力不要
      return false;
    }
  }

  /**
   * お気に入りデータをエクスポート（JSON 形式）
   */
  exportFavorites(): void {
    const favorites = this.getFavorites();
    const jsonString = JSON.stringify(favorites, null, 2);
    
    // JSON ファイルとしてダウンロード
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement('a');
    link.href = url;
    link.download = `skytree-favorites-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    // メモリ解放
    URL.revokeObjectURL(url);
  }

  /**
   * お気に入りデータをインポート（JSON 形式）
   */
  importFavorites(jsonData: string): boolean {
    try {
      const imported = JSON.parse(jsonData) as Favorites;

      // データ構造の検証
      if (
        typeof imported !== "object" ||
        !imported.locations ||
        !imported.events
      ) {
        throw new Error("Invalid favorites data structure");
      }

      if (
        !Array.isArray(imported.locations) ||
        !Array.isArray(imported.events)
      ) {
        throw new Error("Invalid favorites data arrays");
      }

      return this.saveFavorites(imported);
    } catch (error) {
      // インポートエラーは通常の動作であり、ログ出力不要
      return false;
    }
  }

  /**
   * ストレージ使用状況を取得
   */
  getStorageInfo(): { used: number; total: number; available: number } {
    try {
      const favoritesData = this.storage.getItem(STORAGE_KEY) || "";
      const used = new Blob([favoritesData]).size;

      // ローカルストレージの概算容量（5MB）
      const total = 5 * 1024 * 1024;
      const available = total - used;

      return { used, total, available };
    } catch (error) {
      return { used: 0, total: 0, available: 0 };
    }
  }

  /**
   * お気に入り統計情報を取得
   */
  getFavoritesStats(): {
    totalLocations: number;
    totalEvents: number;
    diamondEvents: number;
    pearlEvents: number;
    upcomingEvents: number;
    pastEvents: number;
  } {
    const favorites = this.getFavorites();
    const now = new Date();

    const upcomingEvents = favorites.events.filter(
      (event) => new Date(event.time) > now,
    );
    const pastEvents = favorites.events.filter(
      (event) => new Date(event.time) <= now,
    );
    const diamondEvents = favorites.events.filter(
      (event) => event.type === "diamond",
    );
    const pearlEvents = favorites.events.filter(
      (event) => event.type === "pearl",
    );

    const stats = {
      totalLocations: favorites.locations.length,
      totalEvents: favorites.events.length,
      diamondEvents: diamondEvents.length,
      pearlEvents: pearlEvents.length,
      upcomingEvents: upcomingEvents.length,
      pastEvents: pastEvents.length,
    };

    return stats;
  }
}

// シングルトンインスタンス
export const favoritesService = new FavoritesService();
