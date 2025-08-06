import { mapLogger } from './logger';

/**
 * 座標から住所を取得する（逆ジオコーディング）
 */
export const reverseGeocode = async (latitude: number, longitude: number): Promise<string> => {
  try {
    // 国土地理院の逆ジオコーディングサービスを使用
    const response = await fetch(
      `https://mreversegeocoder.gsi.go.jp/reverse-geocoder/LonLatToAddress?lat=${latitude}&lon=${longitude}`
    );
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    
    if (data.results && data.results.length > 0) {
      const address = data.results[0].address;
      mapLogger.debug('住所取得成功', { latitude, longitude, address });
      return address;
    }
    
    // 代替案: おおよその地域名を返す
    const fallbackAddress = getFallbackAddress(latitude, longitude);
    mapLogger.warn('住所取得失敗 - 代替住所を使用', new Error('Address fetch failed'), { latitude, longitude, fallbackAddress });
    return fallbackAddress;
    
  } catch (error) {
    mapLogger.error('住所取得エラー', error as Error, { latitude, longitude });
    return getFallbackAddress(latitude, longitude);
  }
};

/**
 * 座標に基づく代替住所（大まかな地域名）
 */
const getFallbackAddress = (latitude: number, longitude: number): string => {
  // 東京都の大まかな区域判定
  if (latitude >= 35.5 && latitude <= 35.9 && longitude >= 139.3 && longitude <= 139.9) {
    if (latitude >= 35.7 && longitude >= 139.7) {
      return "東京都 台東区・墨田区付近";
    } else if (latitude >= 35.6 && longitude >= 139.6) {
      return "東京都 千代田区・中央区付近";
    } else if (latitude >= 35.6 && longitude <= 139.5) {
      return "東京都 新宿区・渋谷区付近";
    } else {
      return "東京都内";
    }
  }
  
  // 神奈川県
  if (latitude >= 35.2 && latitude <= 35.6 && longitude >= 139.3 && longitude <= 139.8) {
    return "神奈川県内";
  }
  
  // 埼玉県
  if (latitude >= 35.7 && latitude <= 36.3 && longitude >= 139.0 && longitude <= 139.8) {
    return "埼玉県内";
  }
  
  // 千葉県
  if (latitude >= 35.2 && latitude <= 36.1 && longitude >= 139.8 && longitude <= 140.9) {
    return "千葉県内";
  }
  
  return `緯度${latitude.toFixed(4)}°, 経度${longitude.toFixed(4)}°`;
};

/**
 * Google Maps のナビゲーション URL を生成
 */
export const generateGoogleMapsNavUrl = (latitude: number, longitude: number): string => {
  return `https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}`;
};

/**
 * Google Maps の表示 URL を生成
 */
export const generateGoogleMapsViewUrl = (latitude: number, longitude: number): string => {
  return `https://www.google.com/maps/@${latitude},${longitude},17z`;
};