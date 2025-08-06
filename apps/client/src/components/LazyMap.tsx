import React, { Suspense, lazy } from "react";
import { Location, FujiEvent } from "@skytree-photo-planner/types";
import { CameraSettings } from "./CameraPanel";

// Lazy load the heavy map component containing Leaflet
const SimpleMap = lazy(() => import("./SimpleMap"));

interface LazyMapProps {
  locations: Location[];
  events: FujiEvent[];
  selectedLocationId?: number;
  selectedEventId?: string;
  onLocationSelect: (locationId: number) => void;
  onEventSelect: (eventId: string) => void;
  cameraSettings?: CameraSettings;
}

// Optimized loading fallback for map
const MapLoadingFallback = () => (
  <div className="h-64 md:h-80 lg:h-96 bg-gray-100 rounded-lg flex items-center justify-center">
    <div className="text-center">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2"></div>
      <p className="text-gray-600 text-sm">地図を読み込み中...</p>
    </div>
  </div>
);

const LazyMap: React.FC<LazyMapProps> = ({
  locations,
  events,
  selectedLocationId,
  selectedEventId,
  onLocationSelect,
  onEventSelect: _onEventSelect,
  cameraSettings
}) => {
  // Convert onLocationSelect callback to match SimpleMap interface
  const handleLocationSelect = (location: Location) => {
    onLocationSelect(location.id);
  };

  // Convert onEventSelect callback to match SimpleMap interface
  const handleEventSelect = (eventId: string) => {
    _onEventSelect(eventId);
  };

  return (
    <Suspense fallback={<MapLoadingFallback />}>
      <SimpleMap
        locations={locations}
        selectedEvents={events}
        selectedLocationId={selectedLocationId}
        selectedEventId={selectedEventId}
        onLocationSelect={handleLocationSelect}
        onEventSelect={handleEventSelect}
        cameraSettings={cameraSettings || {
          showAngles: false,
          focalLength: 50,
          sensorType: "fullframe",
          aspectRatio: "3:2",
          orientation: "landscape",
        }}
      />
    </Suspense>
  );
};

export default LazyMap;