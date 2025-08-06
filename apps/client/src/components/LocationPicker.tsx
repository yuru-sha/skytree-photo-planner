import React, { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import styles from "./LocationPicker.module.css";
import { Icon } from "@skytree-photo-planner/ui";
import { mapLogger } from "../utils/logger";

interface LocationPickerProps {
  onLocationSelect: (lat: number, lng: number) => void;
  initialLat?: number;
  initialLng?: number;
  onClose: () => void;
}

const LocationPicker: React.FC<LocationPickerProps> = ({
  onLocationSelect,
  initialLat = 35.7100069,
  initialLng = 139.8108103,
  onClose,
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  
  // 住所検索用の状態
  const [addressSearchQuery, setAddressSearchQuery] = useState("");
  const [isSearchingAddress, setIsSearchingAddress] = useState(false);

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    // 地図を初期化
    const map = L.map(mapContainerRef.current).setView(
      [initialLat, initialLng],
      10,
    );
    mapRef.current = map;

    // 国土地理院の淡色地図タイルを使用
    L.tileLayer("https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png", {
      attribution:
        '<a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank">国土地理院</a>',
      maxZoom: 18,
    }).addTo(map);

    // 初期マーカーを配置
    const marker = L.marker([initialLat, initialLng], {
      draggable: true,
    }).addTo(map);
    markerRef.current = marker;

    // マーカーのドラッグイベント
    marker.on("dragend", () => {
      const pos = marker.getLatLng();
      onLocationSelect(Number(pos.lat.toFixed(6)), Number(pos.lng.toFixed(6)));
    });

    // 地図クリックイベント
    map.on("click", (e: L.LeafletMouseEvent) => {
      const { lat, lng } = e.latlng;
      marker.setLatLng([lat, lng]);
      onLocationSelect(Number(lat.toFixed(6)), Number(lng.toFixed(6)));
    });

    // クリーンアップ
    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [initialLat, initialLng, onLocationSelect]);

  // 座標が外部から変更された場合にマーカーを更新
  useEffect(() => {
    if (markerRef.current && mapRef.current) {
      markerRef.current.setLatLng([initialLat, initialLng]);
      mapRef.current.setView(
        [initialLat, initialLng],
        mapRef.current.getZoom(),
      );
    }
  }, [initialLat, initialLng]);

  // 住所検索処理
  const handleAddressSearch = async () => {
    if (!addressSearchQuery.trim()) return;
    
    try {
      setIsSearchingAddress(true);
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(addressSearchQuery + " 日本")}&limit=1&addressdetails=1`
      );
      
      if (!response.ok) {
        throw new Error('検索に失敗しました');
      }
      
      const results = await response.json();
      
      if (results.length === 0) {
        alert('住所が見つかりませんでした。別の住所を試してください。');
        return;
      }
      
      const result = results[0];
      const lat = parseFloat(result.lat);
      const lng = parseFloat(result.lon);
      
      // 精度チェック
      const displayName = result.display_name || '';
      const searchTerms = addressSearchQuery.toLowerCase().split(/[\s、。,，]+/).filter(term => term.length > 0);
      const matchingTerms = searchTerms.filter(term => 
        displayName.toLowerCase().includes(term)
      );
      
      const accuracy = matchingTerms.length / searchTerms.length;
      
      if (accuracy < 0.3) {
        const confirmed = confirm(
          `検索結果の精度が低い可能性があります。\n\n` +
          `検索: ${addressSearchQuery}\n` +
          `結果: ${displayName}\n\n` +
          `この場所を使用しますか？`
        );
        
        if (!confirmed) {
          return;
        }
      }
      
      // 地図とマーカーを更新（地図は閉じない）
      if (mapRef.current && markerRef.current) {
        mapRef.current.setView([lat, lng], 15);
        markerRef.current.setLatLng([lat, lng]);
        
        // 標高も取得して表示
        try {
          const elevationResponse = await fetch(
            `https://cyberjapandata2.gsi.go.jp/general/dem/scripts/getelevation.php?lon=${lng}&lat=${lat}&outtype=JSON`
          );
          
          if (elevationResponse.ok) {
            const elevationData = await elevationResponse.json();
            const elevation = elevationData.elevation;
            
            if (elevation !== null && elevation !== undefined) {
              // ポップアップで標高情報を表示
              markerRef.current.bindPopup(
                `<div style="text-align: center; font-size: 12px;">
                  <strong>検索結果</strong><br/>
                  緯度: ${lat.toFixed(6)}<br/>
                  経度: ${lng.toFixed(6)}<br/>
                  <strong>標高: ${Math.round(elevation)}m</strong><br/>
                  <small style="color: #666;">クリックやドラッグで微調整可能</small>
                </div>`,
                { autoClose: false, closeOnClick: false }
              ).openPopup();
            }
          }
        } catch (elevationError) {
          mapLogger.warn('標高取得エラー', elevationError as Error);
          // 標高取得に失敗しても位置情報は表示
          markerRef.current.bindPopup(
            `<div style="text-align: center; font-size: 12px;">
              <strong>検索結果</strong><br/>
              緯度: ${lat.toFixed(6)}<br/>
              経度: ${lng.toFixed(6)}<br/>
              <small style="color: #666;">クリックやドラッグで微調整可能</small>
            </div>`,
            { autoClose: false, closeOnClick: false }
          ).openPopup();
        }
        
        // onLocationSelect は呼ばない（ユーザーが手動で細かい調整をできるように）
      }
      
    } catch (error) {
      mapLogger.error('住所検索エラー', error as Error);
      alert('住所検索中にエラーが発生しました。');
    } finally {
      setIsSearchingAddress(false);
    }
  };

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h3>
            <Icon name="mapPin" size={18} className="inline mr-2" />{" "}
            地図から座標を選択
          </h3>
          <button className={styles.closeButton} onClick={onClose}>
            ✕
          </button>
        </div>
        {/* 住所検索バー */}
        <div className={styles.searchBar}>
          <div className={styles.searchInputGroup}>
            <input
              type="text"
              value={addressSearchQuery}
              onChange={(e) => setAddressSearchQuery(e.target.value)}
              placeholder="住所を入力（例：東京都墨田区押上 1-1-2）"
              className={styles.searchInput}
              disabled={isSearchingAddress}
            />
            <button
              onClick={handleAddressSearch}
              disabled={isSearchingAddress || !addressSearchQuery.trim()}
              className={styles.searchButton}
            >
              {isSearchingAddress ? (
                <>
                  <div className={styles.spinner}></div>
                  検索中
                </>
              ) : (
                <>
                  <Icon name="search" size={16} />
                  住所検索
                </>
              )}
            </button>
          </div>
        </div>
        <div className={styles.instructions}>
          📍 住所検索でおおまかな位置を特定した後、地図上でクリックやマーカードラッグで細かい位置調整ができます
        </div>
        <div ref={mapContainerRef} className={styles.mapContainer} />
        <div className={styles.coordinates}>
          緯度: {initialLat.toFixed(6)}, 経度: {initialLng.toFixed(6)}
        </div>
      </div>
    </div>
  );
};

export default LocationPicker;
