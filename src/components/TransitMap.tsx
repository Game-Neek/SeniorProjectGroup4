import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { TransitRoute, TransitStop } from "@/hooks/useTransitData";

interface TransitMapProps {
  routes: TransitRoute[];
  stops: TransitStop[];
  selectedRouteId: string | null;
  onStopClick?: (stop: TransitStop) => void;
}

export const TransitMap = ({ routes, stops, selectedRouteId, onStopClick }: TransitMapProps) => {
  const mapRef = useRef<L.Map | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const layersRef = useRef<L.LayerGroup>(L.layerGroup());

  // Initialize map once
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: [40.7580, -73.9855],
      zoom: 14,
      scrollWheelZoom: true,
    });

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map);

    layersRef.current.addTo(map);
    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Update markers and polylines when data changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    layersRef.current.clearLayers();

    const routeMap = new Map(routes.map((r) => [r.id, r]));

    // Group stops by route
    const stopsByRoute: Record<string, TransitStop[]> = {};
    stops.forEach((s) => {
      if (!stopsByRoute[s.route_id]) stopsByRoute[s.route_id] = [];
      stopsByRoute[s.route_id].push(s);
    });

    const visibleStops: TransitStop[] = selectedRouteId
      ? stops.filter((s) => s.route_id === selectedRouteId)
      : stops;

    // Draw polylines
    Object.entries(stopsByRoute).forEach(([routeId, routeStops]) => {
      const route = routeMap.get(routeId);
      if (!route) return;
      if (selectedRouteId && routeId !== selectedRouteId) return;

      const positions = routeStops
        .sort((a, b) => a.stop_order - b.stop_order)
        .map((s) => [s.latitude, s.longitude] as [number, number]);

      const polyline = L.polyline(positions, {
        color: route.color,
        weight: selectedRouteId === routeId ? 5 : 3,
        opacity: 0.8,
      });
      layersRef.current.addLayer(polyline);
    });

    // Draw stop markers
    visibleStops.forEach((stop) => {
      const route = routeMap.get(stop.route_id);
      const color = route?.color || "#6B7280";

      const icon = L.divIcon({
        className: "custom-marker",
        html: `<div style="width:14px;height:14px;border-radius:50%;background:${color};border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,0.3);"></div>`,
        iconSize: [14, 14],
        iconAnchor: [7, 7],
      });

      const marker = L.marker([stop.latitude, stop.longitude], { icon });
      marker.bindPopup(
        `<div style="font-size:13px"><strong>${stop.stop_name}</strong><br/><span style="color:#888">${route?.route_name || ""} · +${stop.arrival_offset_minutes} min</span></div>`
      );
      if (onStopClick) {
        marker.on("click", () => onStopClick(stop));
      }
      layersRef.current.addLayer(marker);
    });

    // Fit bounds
    if (visibleStops.length > 0) {
      const bounds = L.latLngBounds(visibleStops.map((s) => [s.latitude, s.longitude]));
      map.fitBounds(bounds, { padding: [40, 40] });
    }
  }, [routes, stops, selectedRouteId, onStopClick]);

  return (
    <div
      ref={containerRef}
      className="w-full h-[400px] rounded-xl overflow-hidden border border-border shadow-sm z-0"
    />
  );
};
