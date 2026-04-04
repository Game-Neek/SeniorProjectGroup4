import { useEffect, useRef, useCallback } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { TransitRoute, TransitStop } from "@/hooks/useTransitData";

interface TransitMapProps {
  routes: TransitRoute[];
  stops: TransitStop[];
  selectedRouteId: string | null;
  onStopClick?: (stop: TransitStop) => void;
}

// Cache for OSRM route geometries to avoid repeated calls
const routeGeometryCache = new Map<string, [number, number][]>();

async function fetchRouteGeometry(
  coordinates: [number, number][]
): Promise<[number, number][]> {
  // Build cache key from coordinates
  const cacheKey = coordinates.map((c) => `${c[0].toFixed(5)},${c[1].toFixed(5)}`).join("|");
  if (routeGeometryCache.has(cacheKey)) {
    return routeGeometryCache.get(cacheKey)!;
  }

  try {
    // OSRM expects lng,lat pairs
    const coordStr = coordinates.map((c) => `${c[1]},${c[0]}`).join(";");
    const url = `https://router.project-osrm.org/route/v1/driving/${coordStr}?overview=full&geometries=geojson`;

    const res = await fetch(url);
    if (!res.ok) throw new Error(`OSRM error: ${res.status}`);

    const data = await res.json();
    if (data.code !== "Ok" || !data.routes?.[0]) {
      throw new Error("No route found");
    }

    // GeoJSON coordinates are [lng, lat], convert to [lat, lng] for Leaflet
    const geom: [number, number][] = data.routes[0].geometry.coordinates.map(
      (c: [number, number]) => [c[1], c[0]] as [number, number]
    );

    routeGeometryCache.set(cacheKey, geom);
    return geom;
  } catch (e) {
    console.warn("OSRM routing failed, falling back to straight lines:", e);
    return coordinates;
  }
}

export const TransitMap = ({ routes, stops, selectedRouteId, onStopClick }: TransitMapProps) => {
  const mapRef = useRef<L.Map | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const layersRef = useRef<L.LayerGroup>(L.layerGroup());
  const abortRef = useRef(0);

  // Initialize map once
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: [38.9225, -77.0210],
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

  const drawMarkers = useCallback(
    (visibleStops: TransitStop[], routeMap: Map<string, TransitRoute>) => {
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
    },
    [onStopClick]
  );

  // Update markers and polylines when data changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const generation = ++abortRef.current;

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

    // Draw markers immediately
    drawMarkers(visibleStops, routeMap);

    // Fit bounds
    if (visibleStops.length > 0) {
      const bounds = L.latLngBounds(visibleStops.map((s) => [s.latitude, s.longitude]));
      map.fitBounds(bounds, { padding: [40, 40] });
    }

    // Fetch and draw road-following routes asynchronously
    const drawRoutes = async () => {
      const entries = Object.entries(stopsByRoute);
      for (const [routeId, routeStops] of entries) {
        if (generation !== abortRef.current) return; // stale

        const route = routeMap.get(routeId);
        if (!route) continue;
        if (selectedRouteId && routeId !== selectedRouteId) continue;

        const sorted = [...routeStops].sort((a, b) => a.stop_order - b.stop_order);
        const waypoints = sorted.map((s) => [s.latitude, s.longitude] as [number, number]);

        // Close the loop for shuttle routes
        if (route.route_type === "shuttle" && waypoints.length > 2) {
          waypoints.push(waypoints[0]);
        }

        // OSRM has a limit of ~100 waypoints per request, chunk if needed
        let fullGeometry: [number, number][] = [];

        // Process in segments of up to 25 waypoints (with overlap)
        const chunkSize = 25;
        for (let i = 0; i < waypoints.length - 1; i += chunkSize - 1) {
          const chunk = waypoints.slice(i, Math.min(i + chunkSize, waypoints.length));
          if (chunk.length < 2) break;

          const geom = await fetchRouteGeometry(chunk);
          if (generation !== abortRef.current) return;

          // Skip first point of subsequent chunks to avoid duplicates
          if (fullGeometry.length > 0 && geom.length > 0) {
            fullGeometry = fullGeometry.concat(geom.slice(1));
          } else {
            fullGeometry = fullGeometry.concat(geom);
          }
        }

        if (generation !== abortRef.current) return;

        if (fullGeometry.length > 0) {
          const polyline = L.polyline(fullGeometry, {
            color: route.color,
            weight: selectedRouteId === routeId ? 5 : 3,
            opacity: 0.8,
            smoothFactor: 1,
          });
          layersRef.current.addLayer(polyline);
        }
      }
    };

    drawRoutes();
  }, [routes, stops, selectedRouteId, drawMarkers]);

  return (
    <div
      ref={containerRef}
      className="w-full h-[400px] rounded-xl overflow-hidden border border-border shadow-sm z-0"
    />
  );
};
