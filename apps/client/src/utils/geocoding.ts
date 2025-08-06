import { getComponentLogger } from "@skytree-photo-planner/utils";

const logger = getComponentLogger("geocoding");

interface ReverseGeocodingResult {
  address: string;
  prefecture: string;
  city: string;
  error?: string;
}

/**
 * 緯度経度から住所情報を取得（逆ジオコーディング）
 * OpenStreetMap Nominatim API を使用
 */
export async function reverseGeocode(
  latitude: number,
  longitude: number
): Promise<ReverseGeocodingResult> {
  try {
    // Nominatim API のエンドポイント（日本語対応）
    const url = `https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json&addressdetails=1&accept-language=ja`;
    
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'SkytreePhotoPlanner/1.0 (Contact: your-email@example.com)'
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    
    if (!data || !data.address) {
      throw new Error("No address data found");
    }

    const address = data.address;
    
    // 日本の住所構造に合わせて解析
    const prefecture = address.state || address.prefecture || address.county || "";
    const city = address.city || address.town || address.village || address.municipality || "";
    const district = address.suburb || address.district || address.neighbourhood || "";
    const hamlet = address.hamlet || "";
    
    // 住所文字列を構築（詳細な地名から順に）
    let addressParts: string[] = [];
    
    if (hamlet) addressParts.push(hamlet);
    if (district && district !== hamlet) addressParts.push(district);
    if (city && city !== district) addressParts.push(city);
    if (prefecture && prefecture !== city) addressParts.push(prefecture);
    
    // 空の場合は display_name をフォールバック
    if (addressParts.length === 0) {
      const displayName = data.display_name || "";
      const parts = displayName.split(",").map((part: string) => part.trim());
      if (parts.length > 0) {
        addressParts = parts.slice(0, 2); // 最初の 2 つの部分を使用
      }
    }
    
    const finalAddress = addressParts.length > 0 ? addressParts[0] : "不明な地点";
    
    logger.debug("逆ジオコーディング成功", {
      latitude,
      longitude,
      prefecture,
      city,
      district,
      hamlet,
      finalAddress,
      rawData: data
    });

    return {
      address: finalAddress,
      prefecture: prefecture || "不明",
      city: city || "不明"
    };

  } catch (error) {
    logger.warn("逆ジオコーディング失敗", {
      error: error as Error,
      latitude,
      longitude
    });

    return {
      address: "不明な地点",
      prefecture: "不明",
      city: "不明",
      error: (error as Error).message
    };
  }
}

/**
 * 計算地点用の簡潔な住所表示を取得
 */
export async function getLocationNearby(
  latitude: number,
  longitude: number
): Promise<string> {
  const result = await reverseGeocode(latitude, longitude);
  
  if (result.error) {
    return "不明な地点付近";
  }
  
  return `${result.address}付近`;
}