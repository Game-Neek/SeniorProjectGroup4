import { useEffect } from "react";
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { TransitRoute, TransitStop } from "@/hooks/useTransitData";

// Fix default marker icons
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
  iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
});

const createColorIcon = (color: string) =>
  L.divIcon({
    className: "custom-marker",
    html: `<div style="width:14px;height:14px;border-radius:50%;background:${color};border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,0.3);"></div>`,
    iconSize: [14, 14],
    iconAnchor: [7, 7],
  });

function FitBounds({ stops }: { stops: TransitStop[] }) {
  const map = useMap();
  useEffect(() => {
    if (stops.length > 0) {
      const bounds = L.latLngBounds(stops.map((s) => [s.latitude, s.longitude]));
      map.fitBounds(bounds, { padding: [40, 40] });
    }
  }, [stops, map]);
  return null;
}

interface TransitMapProps {
  routes: TransitRoute[];
  stops: TransitStop[];
  selectedRouteId: string | null;
  onStopClick?: (stop: TransitStop) => void;
}

export const TransitMap = ({ routes, stops, selectedRouteId, onStopClick }: TransitMapProps) => {
  const routeMap = new Map(routes.map((r) => [r.id, r]));

  // Group stops by route
  const stopsByRoute = stops.reduce<Record<string, TransitStop[]>>((acc, stop) => {
    if (!acc[stop.route_id]) acc[stop.route_id] = [];
    acc[stop.route_id].push(stop);
    return acc;
  }, {});

  const visibleStops = selectedRouteId
    ? stops.filter((s) => s.route_id === selectedRouteId)
    : stops;

  return (
    <div className="w-full h-[400px] rounded-xl overflow-hidden border border-border shadow-sm">
      <MapContainer
        center={[40.7580, -73.9855]}
        zoom={14}
        className="w-full h-full z-0"
        scrollWheelZoom
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <FitBounds stops={visibleStops} />

        {/* Route polylines */}
        {Object.entries(stopsByRoute).map(([routeId, routeStops]) => {
          const route = routeMap.get(routeId);
          if (!route) return null;
          if (selectedRouteId && routeId !== selectedRouteId) return null;
          const positions = routeStops
            .sort((a, b) => a.stop_order - b.stop_order)
            .map((s) => [s.latitude, s.longitude] as [number, number]);

          return (
            <Polyline
              key={routeId}
              positions={positions}
              pathOptions={{
                color: route.color,
                weight: selectedRouteId === routeId ? 5 : 3,
                opacity: selectedRouteId && selectedRouteId !== routeId ? 0.3 : 0.8,
              }}
            />
          );
        })}

        {/* Stop markers */}
        {visibleStops.map((stop) => {
          const route = routeMap.get(stop.route_id);
          return (
            <Marker
              key={stop.id}
              position={[stop.latitude, stop.longitude]}
              icon={createColorIcon(route?.color || "#6B7280")}
              eventHandlers={{ click: () => onStopClick?.(stop) }}
            >
              <Popup>
                <div className="text-sm">
                  <p className="font-semibold">{stop.stop_name}</p>
                  <p className="text-muted-foreground text-xs">
                    {route?.route_name} · +{stop.arrival_offset_minutes} min
                  </p>
                </div>
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>
    </div>
  );
};
