import { useState, useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Bus, TrainFront, Clock, MapPin, ArrowLeft, ChevronRight } from "lucide-react";
import { useTransitRoutes, useAllTransitStops, type TransitRoute } from "@/hooks/useTransitData";
import { TransitMap } from "@/components/TransitMap";
import { Skeleton } from "@/components/ui/skeleton";
import { useNavigate } from "react-router-dom";

const RouteCard = ({
  route,
  isSelected,
  onClick,
  stopCount,
}: {
  route: TransitRoute;
  isSelected: boolean;
  onClick: () => void;
  stopCount: number;
}) => {
  const today = new Date().toLocaleDateString("en-US", { weekday: "long" });
  const isRunningToday = route.days_of_week.includes(today);

  return (
    <Card
      className={`p-4 cursor-pointer transition-all hover:shadow-md ${
        isSelected ? "ring-2 ring-primary shadow-md" : ""
      }`}
      onClick={onClick}
    >
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div
            className="w-3 h-3 rounded-full shrink-0"
            style={{ backgroundColor: route.color }}
          />
          <div>
            <h3 className="font-semibold text-sm text-foreground">{route.route_name}</h3>
            <div className="flex items-center gap-2 mt-1">
              <Badge
                variant={route.route_type === "shuttle" ? "secondary" : "outline"}
                className="text-[10px] px-1.5 py-0"
              >
                {route.route_type === "shuttle" ? (
                  <Bus className="w-3 h-3 mr-1" />
                ) : (
                  <TrainFront className="w-3 h-3 mr-1" />
                )}
                {route.route_type}
              </Badge>
              {isRunningToday ? (
                <Badge variant="default" className="text-[10px] px-1.5 py-0 bg-emerald-500/90">
                  Running
                </Badge>
              ) : (
                <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
                  Not today
                </Badge>
              )}
            </div>
          </div>
        </div>
        <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0 mt-1" />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
        <div className="flex items-center gap-1">
          <Clock className="w-3 h-3" />
          Every {route.frequency_minutes} min
        </div>
        <div className="flex items-center gap-1">
          <MapPin className="w-3 h-3" />
          {stopCount} stops
        </div>
      </div>
      <p className="text-[11px] text-muted-foreground mt-2">{route.operating_hours}</p>
    </Card>
  );
};

const SchedulePanel = ({
  route,
  stops,
}: {
  route: TransitRoute;
  stops: { stop_name: string; arrival_offset_minutes: number; stop_order: number }[];
}) => {
  const routeStops = stops.sort((a, b) => a.stop_order - b.stop_order);

  // Generate next departures based on frequency
  const now = new Date();
  const nextDepartures = Array.from({ length: 5 }, (_, i) => {
    const d = new Date(now.getTime() + route.frequency_minutes * 60000 * i);
    return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  });

  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 mb-4">
        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: route.color }} />
        <h3 className="font-semibold text-foreground">{route.route_name}</h3>
      </div>

      {/* Next departures */}
      <div className="mb-4">
        <p className="text-xs font-medium text-muted-foreground mb-2">NEXT DEPARTURES</p>
        <div className="flex flex-wrap gap-2">
          {nextDepartures.map((time, i) => (
            <Badge key={i} variant={i === 0 ? "default" : "outline"} className="text-xs">
              {time}
            </Badge>
          ))}
        </div>
      </div>

      {/* Stop timeline */}
      <div className="space-y-0">
        <p className="text-xs font-medium text-muted-foreground mb-2">ROUTE STOPS</p>
        {routeStops.map((stop, i) => (
          <div key={i} className="flex items-start gap-3">
            <div className="flex flex-col items-center">
              <div
                className="w-3 h-3 rounded-full border-2 shrink-0"
                style={{ borderColor: route.color, backgroundColor: i === 0 ? route.color : "transparent" }}
              />
              {i < routeStops.length - 1 && (
                <div className="w-0.5 h-6" style={{ backgroundColor: route.color, opacity: 0.3 }} />
              )}
            </div>
            <div className="pb-4">
              <p className="text-sm font-medium text-foreground leading-none">{stop.stop_name}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                +{stop.arrival_offset_minutes} min from start
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* Operating info */}
      <div className="mt-2 pt-3 border-t border-border text-xs text-muted-foreground space-y-1">
        <p>
          <span className="font-medium">Hours:</span> {route.operating_hours}
        </p>
        <p>
          <span className="font-medium">Days:</span> {route.days_of_week.join(", ")}
        </p>
        <p>
          <span className="font-medium">Frequency:</span> Every {route.frequency_minutes} minutes
        </p>
      </div>
    </Card>
  );
};

export const TransitDashboard = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<"shuttle" | "metro">("shuttle");
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);

  const { data: routes = [], isLoading: routesLoading } = useTransitRoutes();
  const routeIds = useMemo(() => routes.map((r) => r.id), [routes]);
  const { data: allStops = [], isLoading: stopsLoading } = useAllTransitStops(routeIds);

  const filteredRoutes = routes.filter((r) => r.route_type === activeTab);
  const selectedRoute = routes.find((r) => r.id === selectedRouteId);
  const selectedStops = allStops.filter((s) => s.route_id === selectedRouteId);

  const stopCountByRoute = useMemo(() => {
    const map: Record<string, number> = {};
    allStops.forEach((s) => {
      map[s.route_id] = (map[s.route_id] || 0) + 1;
    });
    return map;
  }, [allStops]);

  const isLoading = routesLoading || stopsLoading;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b border-border px-4 py-3">
        <div className="max-w-5xl mx-auto flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/")}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-lg font-bold text-foreground">Transit & Shuttles</h1>
            <p className="text-xs text-muted-foreground">Campus & public transit schedules</p>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        {/* Toggle tabs */}
        <Tabs value={activeTab} onValueChange={(v) => { setActiveTab(v as "shuttle" | "metro"); setSelectedRouteId(null); }}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="shuttle" className="flex items-center gap-2">
              <Bus className="w-4 h-4" /> Campus Shuttles
            </TabsTrigger>
            <TabsTrigger value="metro" className="flex items-center gap-2">
              <TrainFront className="w-4 h-4" /> Public Metro
            </TabsTrigger>
          </TabsList>

          <TabsContent value={activeTab} className="mt-4 space-y-6">
            {/* Map */}
            {isLoading ? (
              <Skeleton className="w-full h-[400px] rounded-xl" />
            ) : (
              <TransitMap
                routes={filteredRoutes}
                stops={allStops.filter((s) => filteredRoutes.some((r) => r.id === s.route_id))}
                selectedRouteId={selectedRouteId}
              />
            )}

            {/* Content grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Route list */}
              <div className="space-y-3">
                <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                  {activeTab === "shuttle" ? "Shuttle Routes" : "Metro Lines"}
                </h2>
                {isLoading
                  ? Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-lg" />)
                  : filteredRoutes.map((route) => (
                      <RouteCard
                        key={route.id}
                        route={route}
                        isSelected={selectedRouteId === route.id}
                        onClick={() => setSelectedRouteId(selectedRouteId === route.id ? null : route.id)}
                        stopCount={stopCountByRoute[route.id] || 0}
                      />
                    ))}
                {!isLoading && filteredRoutes.length === 0 && (
                  <Card className="p-8 text-center text-muted-foreground text-sm">
                    No {activeTab} routes available
                  </Card>
                )}
              </div>

              {/* Schedule panel */}
              <div>
                {selectedRoute ? (
                  <SchedulePanel route={selectedRoute} stops={selectedStops} />
                ) : (
                  <Card className="p-8 text-center text-muted-foreground text-sm">
                    <MapPin className="w-8 h-8 mx-auto mb-3 opacity-40" />
                    Select a route to view schedules and stops
                  </Card>
                )}
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};
