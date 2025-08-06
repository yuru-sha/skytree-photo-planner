import React, { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

import { Location, FujiEvent, SKYTREE_COORDINATES } from "@skytree-photo-planner/types";
import { CameraSettings } from "./CameraPanel";

// Leaflet のアイコン設定を修正
delete (L.Icon.Default.prototype as unknown as { _getIconUrl: unknown })
  ._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl:
    "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

// 画角計算ヘルパー関数
const getFieldOfViewAngle = (
  focalLength: number,
  sensorType: string,
  aspectRatio: string = "3:2",
  orientation: string = "landscape",
): number => {
  const sensorDimensions = {
    fullframe: { width: 36, height: 24 }, // mm
    apsc: { width: 23.5, height: 15.6 }, // mm (Canon APS-C)
    micro43: { width: 17.3, height: 13 }, // mm
  };

  const sensor =
    sensorDimensions[sensorType as keyof typeof sensorDimensions] ||
    sensorDimensions.fullframe;

  const aspectRatios = {
    "3:2": 3 / 2,
    "4:3": 4 / 3,
    "16:9": 16 / 9,
    "1:1": 1 / 1,
  };

  const ratio =
    aspectRatios[aspectRatio as keyof typeof aspectRatios] ||
    aspectRatios["3:2"];

  let actualWidth = sensor.width;
  let actualHeight = sensor.height;

  if (ratio > sensor.width / sensor.height) {
    actualHeight = sensor.width / ratio;
  } else {
    actualWidth = sensor.height * ratio;
  }

  // 撮影向きに応じて水平画角を計算（地図表示用）
  if (orientation === "portrait") {
    [actualWidth, actualHeight] = [actualHeight, actualWidth];
  }

  return 2 * Math.atan(actualWidth / (2 * focalLength)) * (180 / Math.PI);
};

// 指定した方位角と距離の地点を計算
const getPointAtDistance = (
  lat: number,
  lng: number,
  bearing: number,
  distance: number,
): [number, number] => {
  const R = 6371000; // 地球の半径（メートル）
  const bearingRad = bearing * (Math.PI / 180);
  const latRad = lat * (Math.PI / 180);
  const lngRad = lng * (Math.PI / 180);

  const newLatRad = Math.asin(
    Math.sin(latRad) * Math.cos(distance / R) +
      Math.cos(latRad) * Math.sin(distance / R) * Math.cos(bearingRad),
  );

  const newLngRad =
    lngRad +
    Math.atan2(
      Math.sin(bearingRad) * Math.sin(distance / R) * Math.cos(latRad),
      Math.cos(distance / R) - Math.sin(latRad) * Math.sin(newLatRad),
    );

  return [newLatRad * (180 / Math.PI), newLngRad * (180 / Math.PI)];
};

// 使用されていない関数を削除（コメントアウト）
// const calculateSunPosition = (
//   date: Date,
//   latitude: number,
//   longitude: number,
//   elevation: number = 0,
// ): { azimuth: number; elevation: number } => {
//   const observer = new Astronomy.Observer(latitude, longitude, elevation);
//   const sunEquatorial = Astronomy.Equator(
//     Astronomy.Body.Sun,
//     date,
//     observer,
//     true,
//     true,
//   );
//   const sunHorizontal = Astronomy.Horizon(
//     date,
//     observer,
//     sunEquatorial.ra,
//     sunEquatorial.dec,
//     "normal",
//   );

//   return {
//     azimuth: sunHorizontal.azimuth,
//     elevation: sunHorizontal.altitude,
//   };
// };

// const calculateMoonPosition = (
//   date: Date,
//   latitude: number,
//   longitude: number,
//   elevation: number = 0,
// ): { azimuth: number; elevation: number } => {
//   const observer = new Astronomy.Observer(latitude, longitude, elevation);
//   const moonEquatorial = Astronomy.Equator(
//     Astronomy.Body.Moon,
//     date,
//     observer,
//     true,
//     true,
//   );
//   const moonHorizontal = Astronomy.Horizon(
//     date,
//     observer,
//     moonEquatorial.ra,
//     moonEquatorial.dec,
//     "normal",
//   );

//   return {
//     azimuth: moonHorizontal.azimuth,
//     elevation: moonHorizontal.altitude,
//   };
// };

interface SimpleMapProps {
  locations: Location[];
  selectedDate?: Date;
  selectedEvents?: FujiEvent[];
  selectedLocationId?: number;
  selectedEventId?: string;
  onLocationSelect?: (location: Location) => void;
  onEventSelect?: (eventId: string) => void;
  cameraSettings: CameraSettings;
  mapStyle?: React.CSSProperties;
}

const SimpleMap: React.FC<SimpleMapProps> = ({
  locations,
  selectedEvents,
  selectedLocationId,
  selectedEventId,
  onLocationSelect,
  onEventSelect,
  cameraSettings,
  mapStyle,
}) => {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markersLayerRef = useRef<L.LayerGroup | null>(null);
  const linesLayerRef = useRef<L.LayerGroup | null>(null);

  // 地図の初期化
  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;

    const map = L.map(mapRef.current).setView([35.3606, 138.7274], 7);

    L.tileLayer("https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png", {
      attribution:
        '<a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank">国土地理院</a>',
    }).addTo(map);

    // レイヤーグループを作成
    const markersLayer = L.layerGroup().addTo(map);
    const linesLayer = L.layerGroup().addTo(map);
    
    markersLayerRef.current = markersLayer;
    linesLayerRef.current = linesLayer;
    mapInstanceRef.current = map;

    return () => {
      if (markersLayerRef.current) {
        markersLayerRef.current = null;
      }
      if (linesLayerRef.current) {
        linesLayerRef.current = null;
      }
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  // マーカーの更新
  useEffect(() => {
    if (!mapInstanceRef.current || !markersLayerRef.current || !linesLayerRef.current) return;

    const map = mapInstanceRef.current;
    const markersLayer = markersLayerRef.current;
    const linesLayer = linesLayerRef.current;
    


    // 既存のマーカーとラインをクリア
    markersLayer.clearLayers();
    linesLayer.clearLayers();

    // スカイツリーマーカー（赤色）
    const skytreeIcon = L.icon({
      iconUrl:
        "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png",
      shadowUrl:
        "https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png",
      iconSize: [25, 41],
      iconAnchor: [12, 41],
      popupAnchor: [1, -34],
      shadowSize: [41, 41],
    });

    markersLayer.addLayer(
      L.marker([SKYTREE_COORDINATES.latitude, SKYTREE_COORDINATES.longitude], {
        icon: skytreeIcon,
      })
    );

    // イベントがある地点 + locations props で直接指定された地点を表示
    const eventLocations = selectedEvents?.map((event) => event.location).filter(Boolean) || [];
    const allLocations = [...eventLocations, ...locations];
    const uniqueEventLocations = allLocations.filter(
      (location, index, self) =>
        location && index === self.findIndex((l) => l && l.id === location.id),
    );


    uniqueEventLocations.forEach((location) => {
      const isSelected = selectedLocationId === location.id;
      const locationEvents =
        selectedEvents?.filter((event) => event.location && event.location.id === location.id) ||
        [];
      const hasEvents = locationEvents.length > 0;

      // マーカーの色を決定（精度ベース）
      let markerColor = "#6b7280"; // デフォルト: グレー

      if (isSelected) {
        markerColor = "#10b981"; // 選択: 緑
      } else {
        // その地点でのイベントの最高精度を取得
        const locationAccuracies = locationEvents
          .map(event => event.accuracy)
          .filter(accuracy => accuracy); // undefined を除外
        
        if (locationAccuracies.length > 0) {
          // 精度の優先順位に基づいて最高精度を決定
          const accuracyOrder = ["perfect", "excellent", "good", "fair"];
          const bestAccuracy = accuracyOrder.find(accuracy => 
            locationAccuracies.includes(accuracy as FujiEvent['accuracy'])
          ) || "fair";
          
          // 精度に応じた色分け
          switch (bestAccuracy) {
            case "perfect":
              markerColor = "#059669"; // 完全一致: エメラルドグリーン
              break;
            case "excellent":
              markerColor = "#0891b2"; // 非常に高精度: シアン
              break;
            case "good":
              markerColor = "#2563eb"; // 高精度: ブルー
              break;
            case "fair":
              markerColor = "#7c2d12"; // 標準精度: ブラウン
              break;
            default:
              markerColor = "#6b7280"; // デフォルト: グレー
          }
        } else {
          // 精度情報がない場合は距離ベースにフォールバック
          const distance = (location.distanceToSkytree || 0) / 1000;
          if (distance <= 100) {
            markerColor = "#6b7280"; // 近距離: グレー
          } else {
            markerColor = "#9ca3af"; // 遠距離: ライトグレー
          }
        }
      }

      // イベントタイプによる境界線の色を決定
      const hasDiamond = locationEvents.some((e) => e.type === "diamond");
      const hasPearl = locationEvents.some((e) => e.type === "pearl");
      let borderColor = "white";
      let borderWidth = "2px";

      if (hasDiamond && hasPearl) {
        borderColor = "#fbbf24"; // 両方: 金色
        borderWidth = "3px";
      } else if (hasDiamond) {
        borderColor = "#fcd34d"; // ダイヤモンド: 黄色
        borderWidth = "3px";
      } else if (hasPearl) {
        borderColor = "#e5e7eb"; // パール: 薄グレー
        borderWidth = "3px";
      }

      // 選択された地点がある場合、他の地点を大幅に半透明にし、選択地点は強調
      const opacity = selectedLocationId && !isSelected ? 0.5 : isSelected ? 1.0 : 0.8;

      // 選択された地点はより大きく表示
      const markerSize = isSelected ? 32 : 26;
      const fontSize = isSelected ? "14px" : "12px";
      const shadow = isSelected ? "0 4px 12px rgba(0,0,0,0.6)" : "0 2px 6px rgba(0,0,0,0.4)";
      
      const markerIcon = L.divIcon({
        html: `<div style="
          width: ${markerSize}px; 
          height: ${markerSize}px; 
          background: ${markerColor}; 
          border: ${borderWidth} solid ${borderColor}; 
          border-radius: 50%; 
          display: flex; 
          align-items: center; 
          justify-content: center; 
          font-size: ${fontSize};
          color: white;
          font-weight: bold;
          box-shadow: ${shadow};
          opacity: ${opacity};
          transform: ${isSelected ? 'scale(1.1)' : 'scale(1.0)'};
          transition: all 0.2s ease;
        ">📷</div>`,
        className: "",
        iconSize: [markerSize, markerSize],
        iconAnchor: [markerSize / 2, markerSize / 2],
      });

      const marker = L.marker([location.latitude, location.longitude], {
        icon: markerIcon,
      });
      markersLayer.addLayer(marker);

      if (onLocationSelect) {
        marker.on("click", () => {
          onLocationSelect(location);
        });
      }

      // 選択された地点の方位角ラインを表示
      if (isSelected) {
        // ライン描画条件のチェック
        // 選択された地点のイベントは全て表示（ダイヤモンドとパール両方）
        const eventsToShow = locationEvents;

        // まず撮影地→スカイツリーの線を 1 本だけ描画（赤色、より目立つように改善）
        const skytreeLine = L.polyline(
          [
            [location.latitude, location.longitude],
            [SKYTREE_COORDINATES.latitude, SKYTREE_COORDINATES.longitude],
          ],
          {
            color: "#dc2626", // より濃い赤色
            weight: 5, // 太くした
            opacity: 1.0, // 完全不透明
            dashArray: "15, 8", // より目立つダッシュパターン
            className: "skytree-line", // CSS クラスを追加
            interactive: false, // インタラクティブ要素として扱わない
          },
        );
        linesLayer.addLayer(skytreeLine);

        // イベントがある場合のみ太陽・月への線を描画
        if (hasEvents) {
          // 各イベントごとに太陽・月への線を描画
          eventsToShow.forEach((event, _index) => {
          // イベントデータに含まれる正確な方位角を使用（これが一致する時の方位角）
          const celestialAzimuth = event.azimuth;
          const celestialDistance = 350000; // 撮影地点から 350km 先まで

          const celestialPoint = getPointAtDistance(
            location.latitude,
            location.longitude,
            celestialAzimuth,
            celestialDistance,
          );

          // 太陽の場合はゴールド、月の場合は青紫
          const celestialColor =
            event.type === "diamond" ? "#fbbf24" : "#c084fc";

          const celestialLine = L.polyline(
            [[location.latitude, location.longitude], celestialPoint],
            {
              color: celestialColor,
              weight: 5, // 太くした
              opacity: 1.0, // 完全不透明に変更
              dashArray: event.type === "diamond" ? "20, 8" : "12, 6", // より目立つパターン
              className: "celestial-line", // CSS クラスを追加
              interactive: true, // インタラクティブ要素として扱う
            },
          );
          
          // イベント選択のクリックハンドラーを追加
          if (onEventSelect) {
            celestialLine.on("click", () => {
              onEventSelect(event.id);
            });
          }
          
          linesLayer.addLayer(celestialLine);
          });
        }

        // 画角表示
        if (cameraSettings.showAngles && location.azimuthToSkytree) {
          const angle = getFieldOfViewAngle(
            cameraSettings.focalLength,
            cameraSettings.sensorType,
            cameraSettings.aspectRatio,
            cameraSettings.orientation,
          );
          const distance = location.distanceToSkytree
            ? location.distanceToSkytree
            : 50000; // meters (既にメートル単位)

          const startAzimuth = (location.azimuthToSkytree! - angle / 2) % 360;
          const endAzimuth = (location.azimuthToSkytree! + angle / 2) % 360;

          const startPoint = getPointAtDistance(
            location.latitude,
            location.longitude,
            startAzimuth,
            distance,
          );
          const endPoint = getPointAtDistance(
            location.latitude,
            location.longitude,
            endAzimuth,
            distance,
          );

          const anglePolygon = L.polygon(
            [[location.latitude, location.longitude], startPoint, endPoint],
            {
              color: "#3b82f6",
              weight: 3,
              opacity: 0.9,
              fillOpacity: 0.3,
            },
          );
          linesLayer.addLayer(anglePolygon);
        }
      }
    });



    // 地図の表示範囲とズームレベルを調整
    if (uniqueEventLocations.length > 0) {
      if (selectedLocationId) {
        // 特定の地点が選択されている場合
        const selectedLocation = uniqueEventLocations.find(
          (loc) => loc.id === selectedLocationId,
        );
        if (selectedLocation) {
          // スカイツリーと撮影地点の両方が入るように fitBounds を使用
          const bounds = L.latLngBounds([]);
          bounds.extend([
            SKYTREE_COORDINATES.latitude,
            SKYTREE_COORDINATES.longitude,
          ]);
          bounds.extend([
            selectedLocation.latitude,
            selectedLocation.longitude,
          ]);

          // 距離に応じて適切なズームレベルを決定
          const distance = L.latLng(
            selectedLocation.latitude,
            selectedLocation.longitude
          ).distanceTo(
            L.latLng(
              SKYTREE_COORDINATES.latitude,
              SKYTREE_COORDINATES.longitude
            )
          );

          // 距離に応じてパディングとズームを調整
          let padding: [number, number] = [80, 80];
          let maxZoom = 15;
          
          if (distance < 5000) { // 5km 以内の近い地点
            padding = [100, 100];
            maxZoom = 16;
          } else if (distance < 10000) { // 10km 以内
            padding = [80, 80];
            maxZoom = 15;
          } else { // それ以上の遠い地点
            padding = [60, 60];
            maxZoom = 14;
          }

          // 適切なズームレベルで表示
          map.fitBounds(bounds, {
            padding: padding,
            maxZoom: maxZoom,
            animate: true, // アニメーション付きでズーム
            duration: 0.5, // アニメーション時間
          });
        }
      } else {
        // 地点が選択されていない場合は全体を表示
        const bounds = L.latLngBounds([]);

        // スカイツリーも含める
        bounds.extend([SKYTREE_COORDINATES.latitude, SKYTREE_COORDINATES.longitude]);

        // イベントがある撮影地点を含める
        uniqueEventLocations.forEach((location) => {
          bounds.extend([location.latitude, location.longitude]);
        });

        // 適切なズームレベルで表示（パディングを追加）
        map.fitBounds(bounds, { padding: [20, 20] });
      }
    }
  }, [
    locations,
    selectedLocationId,
    selectedEventId,
    selectedEvents, // 直接依存関係として追加
    onLocationSelect,
    cameraSettings.showAngles,
    cameraSettings.focalLength,
    cameraSettings.sensorType,
    cameraSettings.aspectRatio,
    cameraSettings.orientation,
  ]);

  return (
    <div
      style={{
        backgroundColor: "white",
        borderRadius: "8px",
        overflow: "hidden",
        boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
      }}
    >
      <div
        style={{
          padding: "0.75rem 1rem",
          borderBottom: "1px solid #e5e7eb",
          backgroundColor: "#f9fafb",
        }}
      >
        <h3 style={{ margin: 0, fontSize: "1.125rem", fontWeight: "600" }}>
          撮影地点
        </h3>
      </div>

      <div
        ref={mapRef}
        style={{
          width: "100%",
          aspectRatio: mapStyle?.aspectRatio || "3 / 2",
          ...mapStyle,
        }}
      />

      <div
        style={{
          padding: "0.75rem",
          backgroundColor: "#f9fafb",
          borderTop: "1px solid #e5e7eb",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "1rem",
            fontSize: "0.875rem",
            flexWrap: "wrap",
          }}
        >
          <div
            style={{ display: "flex", alignItems: "center", gap: "0.25rem" }}
          >
            <div
              style={{
                width: "12px",
                height: "2px",
                backgroundColor: "#ef4444",
                border: "1px dashed #ef4444",
                borderStyle: "dashed",
              }}
            ></div>
            <span>撮影地点→スカイツリー</span>
          </div>
          <div
            style={{ display: "flex", alignItems: "center", gap: "0.25rem" }}
          >
            <div
              style={{
                width: "12px",
                height: "2px",
                backgroundColor: "#fbbf24",
                border: "1px dashed #fbbf24",
                borderStyle: "dashed",
              }}
            ></div>
            <span>撮影地点→太陽</span>
          </div>
          <div
            style={{ display: "flex", alignItems: "center", gap: "0.25rem" }}
          >
            <div
              style={{
                width: "12px",
                height: "2px",
                backgroundColor: "#a855f7",
                border: "1px dashed #a855f7",
                borderStyle: "dashed",
              }}
            ></div>
            <span>撮影地点→月</span>
          </div>
          <div
            style={{ display: "flex", alignItems: "center", gap: "0.25rem" }}
          >
            <div
              style={{
                width: "12px",
                height: "12px",
                backgroundColor: "#059669",
                borderRadius: "50%",
              }}
            ></div>
            <span>完全一致</span>
          </div>
          <div
            style={{ display: "flex", alignItems: "center", gap: "0.25rem" }}
          >
            <div
              style={{
                width: "12px",
                height: "12px",
                backgroundColor: "#0891b2",
                borderRadius: "50%",
              }}
            ></div>
            <span>非常に高精度</span>
          </div>
          <div
            style={{ display: "flex", alignItems: "center", gap: "0.25rem" }}
          >
            <div
              style={{
                width: "12px",
                height: "12px",
                backgroundColor: "#2563eb",
                borderRadius: "50%",
              }}
            ></div>
            <span>高精度</span>
          </div>
          <div
            style={{ display: "flex", alignItems: "center", gap: "0.25rem" }}
          >
            <div
              style={{
                width: "12px",
                height: "12px",
                backgroundColor: "#7c2d12",
                borderRadius: "50%",
              }}
            ></div>
            <span>標準精度</span>
          </div>
          <div
            style={{ display: "flex", alignItems: "center", gap: "0.25rem" }}
          >
            <div
              style={{
                width: "12px",
                height: "12px",
                backgroundColor: "#6b7280",
                borderRadius: "50%",
              }}
            ></div>
            <span>精度情報なし</span>
          </div>
          <div
            style={{ display: "flex", alignItems: "center", gap: "0.25rem" }}
          >
            <div
              style={{
                width: "12px",
                height: "12px",
                backgroundColor: "#6b7280",
                border: "2px solid #fcd34d",
                borderRadius: "50%",
              }}
            ></div>
            <span>ダイヤモンドスカイツリー</span>
          </div>
          <div
            style={{ display: "flex", alignItems: "center", gap: "0.25rem" }}
          >
            <div
              style={{
                width: "12px",
                height: "12px",
                backgroundColor: "#6b7280",
                border: "2px solid #e5e7eb",
                borderRadius: "50%",
              }}
            ></div>
            <span>パールスカイツリー</span>
          </div>
          {cameraSettings.showAngles && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.25rem",
              }}
            >
              <div
                style={{
                  width: "12px",
                  height: "12px",
                  backgroundColor: "#3b82f6",
                  opacity: 0.3,
                }}
              ></div>
              <span>画角範囲 ({cameraSettings.focalLength}mm)</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SimpleMap;
