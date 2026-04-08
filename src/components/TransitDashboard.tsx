import { useState, useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Bus, TrainFront, Clock, MapPin, ArrowLeft, ChevronRight, Wifi, WifiOff, TrendingUp, AlertTriangle, BarChart3, ShieldCheck } from "lucide-react";
import { useTransitRoutes, useAllTransitStops, useTransitArrivals, useDelayPatterns, type TransitRoute, type TransitArrival, type DelayPattern } from "@/hooks/useTransitData";
import { TransitMap } from "@/components/TransitMap";
import { Skeleton } from "@/components/ui/skeleton";
import { useNavigate } from "react-router-dom";
import { useProfile } from "@/hooks/useProfile";
import { cn } from "@/lib/utils";

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

const PredictiveInsightsPanel = ({
  patterns,
  stops,
  route,
}: {
  patterns: DelayPattern[];
  stops: { stop_name: string; id: string }[];
  route: TransitRoute;
}) => {
  if (patterns.length === 0) {
    return (
      <Card className="p-4 border-border">
        <div className="flex items-center gap-2 mb-2">
          <BarChart3 className="w-4 h-4 text-primary" aria-hidden="true" />
          <h4 className="text-sm font-semibold text-foreground">Predictive Insights</h4>
        </div>
        <p className="text-xs text-muted-foreground">
          No historical data yet for this route at this time. Predictions will improve as more trips are recorded.
        </p>
      </Card>
    );
  }

  const stopMap = new Map(stops.map(s => [s.id, s.stop_name]));
  const overallAvgDelay = patterns.reduce((s, p) => s + p.avg_delay, 0) / patterns.length;
  const overallDelayProb = patterns.reduce((s, p) => s + p.delay_probability, 0) / patterns.length;
  const highRiskStops = patterns.filter(p => p.delay_probability > 40).sort((a, b) => b.delay_probability - a.delay_probability);
  const reliableStops = patterns.filter(p => p.delay_probability <= 20 && p.sample_count >= 3);

  const overallRisk = overallDelayProb > 50 ? "high" : overallDelayProb > 25 ? "moderate" : "low";
  const riskConfig = {
    low: { color: "text-green-600 dark:text-green-400", bg: "bg-green-500/10", border: "border-green-500/20", label: "Low Risk" },
    moderate: { color: "text-amber-600 dark:text-amber-400", bg: "bg-amber-500/10", border: "border-amber-500/20", label: "Moderate Risk" },
    high: { color: "text-destructive", bg: "bg-destructive/10", border: "border-destructive/20", label: "High Risk" },
  }[overallRisk];

  return (
    <Card className="p-4 border-border space-y-4" role="region" aria-label={`Predictive insights for ${route.route_name}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-primary" aria-hidden="true" />
          <h4 className="text-sm font-semibold text-foreground">Predictive Insights</h4>
        </div>
        <Badge variant="outline" className={cn("text-[10px] gap-1", riskConfig.color, riskConfig.border)}>
          {overallRisk === "low" ? <ShieldCheck className="w-3 h-3" /> : <AlertTriangle className="w-3 h-3" />}
          {riskConfig.label}
        </Badge>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-3 gap-2">
        <div className={cn("rounded-lg p-2.5 text-center border", riskConfig.bg, riskConfig.border)}>
          <p className={cn("text-lg font-bold", riskConfig.color)}>
            {overallAvgDelay > 0 ? `+${overallAvgDelay.toFixed(1)}` : overallAvgDelay.toFixed(1)}
          </p>
          <p className="text-[10px] text-muted-foreground">Avg Delay (min)</p>
        </div>
        <div className="rounded-lg bg-muted/50 border border-border p-2.5 text-center">
          <p className="text-lg font-bold text-foreground">{Math.round(overallDelayProb)}%</p>
          <p className="text-[10px] text-muted-foreground">Delay Chance</p>
        </div>
        <div className="rounded-lg bg-muted/50 border border-border p-2.5 text-center">
          <p className="text-lg font-bold text-foreground">{patterns.reduce((s, p) => s + p.sample_count, 0)}</p>
          <p className="text-[10px] text-muted-foreground">Data Points</p>
        </div>
      </div>

      {/* Confidence bar */}
      <div className="space-y-1">
        <div className="flex justify-between text-xs">
          <span className="text-muted-foreground font-medium">Prediction Confidence</span>
          <span className="font-semibold text-primary">
            {Math.min(95, Math.round(patterns.reduce((s, p) => s + Math.min(25, p.sample_count), 0) / patterns.length * 4))}%
          </span>
        </div>
        <Progress
          value={Math.min(95, Math.round(patterns.reduce((s, p) => s + Math.min(25, p.sample_count), 0) / patterns.length * 4))}
          className="h-1.5"
        />
        <p className="text-[10px] text-muted-foreground">Based on same day-of-week and time-of-day patterns</p>
      </div>

      {/* High-risk stops */}
      {highRiskStops.length > 0 && (
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-1.5 flex items-center gap-1">
            <AlertTriangle className="w-3 h-3 text-amber-500" aria-hidden="true" />
            Frequently Delayed Stops
          </p>
          <div className="space-y-1.5">
            {highRiskStops.slice(0, 3).map(p => (
              <div key={p.stop_id} className="flex items-center justify-between px-2 py-1.5 rounded bg-amber-500/5 border border-amber-500/10">
                <span className="text-xs text-foreground truncate">{stopMap.get(p.stop_id) || "Unknown"}</span>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-amber-600 dark:text-amber-400 font-medium">{p.delay_probability}% delayed</span>
                  <span className="text-[10px] text-muted-foreground">avg +{p.avg_delay.toFixed(1)}m</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Reliable stops */}
      {reliableStops.length > 0 && (
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-1.5 flex items-center gap-1">
            <ShieldCheck className="w-3 h-3 text-green-500" aria-hidden="true" />
            Most Reliable Stops
          </p>
          <div className="flex flex-wrap gap-1.5">
            {reliableStops.slice(0, 4).map(p => (
              <Badge key={p.stop_id} variant="outline" className="text-[10px] text-green-600 border-green-500/20 bg-green-500/5">
                {stopMap.get(p.stop_id) || "Unknown"}
              </Badge>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
};

const SchedulePanel = ({
  route,
  stops,
  arrivals,
  patterns,
}: {
  route: TransitRoute;
  stops: { stop_name: string; arrival_offset_minutes: number; stop_order: number; id: string }[];
  arrivals: TransitArrival[];
  patterns: DelayPattern[];
}) => {
  const routeStops = stops.sort((a, b) => a.stop_order - b.stop_order);
  const patternMap = new Map(patterns.map(p => [p.stop_id, p]));

  // Group arrivals by stop
  const arrivalsByStop = useMemo(() => {
    const map: Record<string, TransitArrival[]> = {};
    arrivals.forEach((a) => {
      if (!map[a.stop_id]) map[a.stop_id] = [];
      map[a.stop_id].push(a);
    });
    Object.values(map).forEach((arr) =>
      arr.sort((a, b) => new Date(a.predicted_arrival_time).getTime() - new Date(b.predicted_arrival_time).getTime())
    );
    return map;
  }, [arrivals]);

  const hasLiveData = arrivals.length > 0;
  const hasPredictions = arrivals.some(a => a.data_source === "predicted");

  const now = new Date();
  const nextDepartures = hasLiveData
    ? (arrivalsByStop[routeStops[0]?.id] || []).slice(0, 5).map((a) => ({
        time: new Date(a.predicted_arrival_time).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }),
        status: a.status,
        source: a.data_source,
      }))
    : Array.from({ length: 5 }, (_, i) => ({
        time: new Date(now.getTime() + route.frequency_minutes * 60000 * i).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }),
        status: "scheduled" as string,
        source: "schedule" as string,
      }));

  const statusColor = (status: string) => {
    switch (status) {
      case "on_time": case "early": return "bg-emerald-500/90";
      case "delayed": return "bg-amber-500";
      case "arriving": case "boarding": return "bg-primary";
      default: return "";
    }
  };

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: route.color }} aria-hidden="true" />
            <h3 className="font-semibold text-foreground">{route.route_name}</h3>
          </div>
          <div className="flex items-center gap-1.5">
            {hasPredictions && (
              <Badge variant="outline" className="text-[10px] gap-1 text-primary border-primary/30">
                <TrendingUp className="w-3 h-3" aria-hidden="true" /> Predicted
              </Badge>
            )}
            {hasLiveData ? (
              <Badge variant="outline" className="text-[10px] gap-1 text-emerald-600 border-emerald-300">
                <Wifi className="w-3 h-3" aria-hidden="true" /> Live
              </Badge>
            ) : (
              <Badge variant="outline" className="text-[10px] gap-1 text-muted-foreground">
                <WifiOff className="w-3 h-3" aria-hidden="true" /> Scheduled
              </Badge>
            )}
          </div>
        </div>

        {/* Next departures */}
        <div className="mb-4">
          <p className="text-xs font-medium text-muted-foreground mb-2">NEXT DEPARTURES</p>
          <div className="flex flex-wrap gap-2">
            {nextDepartures.map((dep, i) => (
              <Badge key={i} variant={i === 0 ? "default" : "outline"} className={`text-xs ${i === 0 && hasLiveData ? statusColor(dep.status) : ""}`}>
                {dep.time}
                {dep.status === "delayed" && " ⚠"}
                {dep.status === "arriving" && " 🚌"}
                {dep.status === "boarding" && " 🚇"}
              </Badge>
            ))}
          </div>
        </div>

        {/* Stop timeline with live ETAs and delay indicators */}
        <div className="space-y-0">
          <p className="text-xs font-medium text-muted-foreground mb-2">ROUTE STOPS</p>
          {routeStops.map((stop, i) => {
            const stopArrivals = arrivalsByStop[stop.id] || [];
            const nextArrival = stopArrivals[0];
            const stopPattern = patternMap.get(stop.id);

            return (
              <div key={i} className="flex items-start gap-3">
                <div className="flex flex-col items-center">
                  <div
                    className="w-3 h-3 rounded-full border-2 shrink-0"
                    style={{ borderColor: route.color, backgroundColor: i === 0 ? route.color : "transparent" }}
                    aria-hidden="true"
                  />
                  {i < routeStops.length - 1 && (
                    <div className="w-0.5 h-6" style={{ backgroundColor: route.color, opacity: 0.3 }} aria-hidden="true" />
                  )}
                </div>
                <div className="pb-4 flex-1">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <p className="text-sm font-medium text-foreground leading-none">{stop.stop_name}</p>
                      {stopPattern && stopPattern.delay_probability > 40 && (
                        <AlertTriangle className="w-3 h-3 text-amber-500" aria-label={`${stopPattern.delay_probability}% chance of delay`} />
                      )}
                    </div>
                    {nextArrival && (
                      <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${statusColor(nextArrival.status)} ${nextArrival.status !== "on_time" ? "text-white" : ""}`}>
                        {nextArrival.estimated_minutes <= 0 ? "Now" : `${nextArrival.estimated_minutes} min`}
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <p className="text-xs text-muted-foreground">
                      {nextArrival
                        ? `Next: ${new Date(nextArrival.predicted_arrival_time).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })} · ${nextArrival.data_source === "wmata" ? "WMATA" : nextArrival.data_source === "predicted" ? "AI Predicted" : "Est."}`
                        : `+${stop.arrival_offset_minutes} min from start`}
                    </p>
                    {stopPattern && stopPattern.sample_count >= 3 && (
                      <span className={cn(
                        "text-[10px] font-medium",
                        stopPattern.delay_probability > 40 ? "text-amber-600 dark:text-amber-400" : "text-green-600 dark:text-green-400"
                      )}>
                        {stopPattern.delay_probability > 40
                          ? `~${stopPattern.avg_delay.toFixed(0)}m avg delay`
                          : "On-time"}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
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
          {hasLiveData && (
            <p className="text-emerald-600">
              <span className="font-medium">🔴 Live data</span> · Updates automatically
            </p>
          )}
        </div>
      </Card>

      {/* Predictive insights card */}
      <PredictiveInsightsPanel
        patterns={patterns}
        stops={stops.map(s => ({ id: s.id, stop_name: s.stop_name }))}
        route={route}
      />
    </div>
  );
};

export const TransitDashboard = () => {
  const navigate = useNavigate();
  const { profile } = useProfile();
  const [activeTab, setActiveTab] = useState<"shuttle" | "metro">("shuttle");
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);

  const { data: routes = [], isLoading: routesLoading } = useTransitRoutes(profile.university_id);
  const routeIds = useMemo(() => routes.map((r) => r.id), [routes]);
  const { data: allStops = [], isLoading: stopsLoading } = useAllTransitStops(routeIds);
  const { data: arrivals = [] } = useTransitArrivals(selectedRouteId);
  const { data: delayPatterns = [] } = useDelayPatterns(selectedRouteId);

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
                  <SchedulePanel route={selectedRoute} stops={selectedStops} arrivals={arrivals} patterns={delayPatterns} />
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
