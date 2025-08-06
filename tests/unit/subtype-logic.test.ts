import { describe, it, expect } from 'vitest';

/**
 * SubType 判定ロジックのテストケース
 * 
 * 理論:
 * - スカイツリーが東に見える (0-180 度) → 天体も東側 → 昇る (rising/sunrise)
 * - スカイツリーが西に見える (180-360 度) → 天体も西側 → 沈む (setting/sunset)
 */

describe('SubType 判定ロジック', () => {
  // テスト用の判定関数（実際のロジックを再現）
  function determineSubType(
    skytreeAzimuth: number,
    eventType: 'diamond' | 'pearl'
  ): 'sunrise' | 'sunset' | 'rising' | 'setting' {
    if (eventType === 'diamond') {
      // ダイヤモンドスカイツリー（太陽）
      if (skytreeAzimuth < 180) {
        return 'sunrise'; // 東側 → 昇る
      } else {
        return 'sunset';  // 西側 → 沈む
      }
    } else {
      // パールスカイツリー（月）
      // シンプルにスカイツリーより東か西かで判定
      if (skytreeAzimuth < 180) {
        return 'rising';  // 東側 → 昇る
      } else {
        return 'setting'; // 西側 → 沈む
      }
    }
  }

  describe('ダイヤモンドスカイツリー（太陽）', () => {
    it('東側（0 度）→ sunrise', () => {
      expect(determineSubType(0, 'diamond')).toBe('sunrise');
    });

    it('東南東（105 度）→ sunrise', () => {
      expect(determineSubType(105, 'diamond')).toBe('sunrise');
    });

    it('南（180 度）→ sunset', () => {
      expect(determineSubType(180, 'diamond')).toBe('sunset');
    });

    it('西南西（255 度）→ sunset', () => {
      expect(determineSubType(255, 'diamond')).toBe('sunset');
    });
  });

  describe('パールスカイツリー（月）', () => {
    it('東側（0 度）→ rising', () => {
      expect(determineSubType(0, 'pearl')).toBe('rising');
    });

    it('東南東（105 度）→ rising ⭐️', () => {
      // サンシャイン 60 のケース
      expect(determineSubType(105, 'pearl')).toBe('rising');
    });

    it('南東（135 度）→ rising', () => {
      expect(determineSubType(135, 'pearl')).toBe('rising');
    });

    it('南（180 度）→ setting', () => {
      expect(determineSubType(180, 'pearl')).toBe('setting');
    });

    it('西南西（255 度）→ setting', () => {
      expect(determineSubType(255, 'pearl')).toBe('setting');
    });
  });

  describe('境界値テスト', () => {
    it('179.9 度 → rising（東側ギリギリ）', () => {
      expect(determineSubType(179.9, 'pearl')).toBe('rising');
    });

    it('180.1 度 → setting（西側ギリギリ）', () => {
      expect(determineSubType(180.1, 'pearl')).toBe('setting');
    });
  });

  describe('実際の地点データ', () => {
    const testLocations = [
      { name: 'サンシャイン 60', azimuth: 105, expected: 'rising' }, // 105 度は東側なので昇る
      { name: '横浜ランドマークタワー', azimuth: 45, expected: 'rising' },
      { name: '富士山頂', azimuth: 280, expected: 'setting' },
      { name: '東京タワー', azimuth: 90, expected: 'rising' },
    ];

    testLocations.forEach(location => {
      it(`${location.name}（${location.azimuth}度）→ ${location.expected}`, () => {
        expect(determineSubType(location.azimuth, 'pearl')).toBe(location.expected);
      });
    });
  });
});

/**
 * 表示ロジックのテスト
 * subType → 日本語表示の変換
 */
describe('表示ロジック', () => {
  function getDisplayText(subType: 'sunrise' | 'sunset' | 'rising' | 'setting'): string {
    switch (subType) {
      case 'sunrise':
      case 'rising':
        return '昇る';
      case 'sunset':
      case 'setting':
        return '沈む';
    }
  }

  it('rising → 昇る', () => {
    expect(getDisplayText('rising')).toBe('昇る');
  });

  it('setting → 沈む', () => {
    expect(getDisplayText('setting')).toBe('沈む');
  });

  it('サンシャイン 60 ケース: 105 度 → rising → 昇る', () => {
    const subType = determineSubType(105, 'pearl');
    const displayText = getDisplayText(subType);
    
    expect(subType).toBe('rising');
    expect(displayText).toBe('昇る');
    // シンプル判定: 105 度は東側なので「昇るパールスカイツリー」
  });
});