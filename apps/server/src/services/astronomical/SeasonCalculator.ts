import { Location as LocationType } from "@skytree-photo-planner/types";

/**
 * スカイツリー撮影シーズン判定クラス
 * 
 * ダイヤモンドスカイツリー・パールスカイツリーは年中撮影可能
 * （高層建築物のため季節的制約なし）
 */
export class SeasonCalculator {
  /**
   * ダイヤモンドスカイツリーの撮影可能性を判定
   * 
   * @param _date 撮影予定日（未使用 - 年中撮影可能のため）
   * @param _location 撮影地点（未使用 - 全地点で年中可能）
   * @returns 常に true（年中撮影可能）
   */
  isDiamondSkytreeSeason(_date: Date, _location: LocationType): boolean {
    // スカイツリーは年中撮影可能（高層建築物のため季節的制約なし）
    return true;
  }

  /**
   * ダイヤモンドスカイツリーの撮影可能性を判定（後方互換用）
   * 
   * @param date 撮影予定日
   * @param _location 撮影地点（富士山は共通のため未使用）
   * @returns 撮影可能性の判定結果（boolean で返す）
   */
  isDiamondFujiSeason(date: Date, _location?: LocationType): boolean {
    const result = this.getDiamondFujiSeasonInfo(date);
    return result.isInSeason;
  }

  /**
   * ダイヤモンド富士シーズンメッセージを取得（後方互換用）
   * 
   * @param date 撮影予定日
   * @param _location 撮影地点（未使用）
   * @returns シーズンメッセージまたは null
   */
  getDiamondFujiSeasonMessage(date: Date, _location?: LocationType): string | null {
    const result = this.getDiamondFujiSeasonInfo(date);
    return result.reason;
  }

  /**
   * ダイヤモンドスカイツリーシーズンメッセージを取得
   * 
   * @param _date 撮影予定日（未使用）
   * @param _location 撮影地点（未使用）
   * @returns 常に null（年中撮影可能のためメッセージなし）
   */
  getDiamondSkytreeSeasonMessage(_date: Date, _location?: LocationType): string | null {
    // スカイツリーは年中撮影可能のため、特別なメッセージは不要
    return null;
  }

  /**
   * スカイツリー全般のシーズンメッセージを取得
   * 
   * @param _date 撮影予定日（未使用）
   * @param _location 撮影地点（未使用）
   * @returns 常に「年中撮影可能」メッセージ
   */
  getSeasonMessage(_date: Date, _location: LocationType): string | null {
    return "スカイツリーは年中撮影可能です";
  }

  /**
   * 富士山との撮影可能性を判定（詳細情報付き）
   * 
   * @param date 撮影予定日
   * @returns 撮影可能性の判定結果
   */
  private getDiamondFujiSeasonInfo(date: Date): {
    isInSeason: boolean;
    reason: string;
    nextSeasonStart?: Date;
  } {
    const month = date.getMonth() + 1; // 1-12
    const day = date.getDate();

    // ダイヤモンド富士の一般的なシーズン
    // 12 月中旬〜1 月上旬、2 月中旬〜4 月末頃が一般的
    const isWinterSeason = 
      (month === 12 && day >= 15) || 
      (month === 1 && day <= 10);
    
    const isSprinSeason = 
      (month === 2 && day >= 15) || 
      (month === 3) || 
      (month === 4);

    const isInSeason = isWinterSeason || isSprinSeason;

    if (isInSeason) {
      return {
        isInSeason: true,
        reason: "ダイヤモンドスカイツリーの撮影シーズンです"
      };
    }

    // 次のシーズン開始日を計算
    let nextSeasonStart: Date;
    if (month < 2 || (month === 2 && day < 15)) {
      nextSeasonStart = new Date(date.getFullYear(), 1, 15); // 2 月 15 日
    } else if (month >= 5 && month < 12) {
      nextSeasonStart = new Date(date.getFullYear(), 11, 15); // 12 月 15 日
    } else {
      nextSeasonStart = new Date(date.getFullYear() + 1, 1, 15); // 翌年 2 月 15 日
    }

    return {
      isInSeason: false,
      reason: "ダイヤモンドスカイツリーの撮影シーズンではありません（12 月中旬〜1 月上旬、2 月中旬〜4 月末が最適）",
      nextSeasonStart
    };
  }
}
