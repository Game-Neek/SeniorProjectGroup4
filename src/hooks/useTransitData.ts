import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

export type TransitRoute = {
  id: string;
  university_id: string | null;
  route_name: string;
  route_type: "shuttle" | "metro";
  color: string;
  operating_hours: string;
  frequency_minutes: number;
  days_of_week: string[];
  is_active: boolean;
};

export type TransitStop = {
  id: string;
  route_id: string;
  stop_name: string;
  latitude: number;
  longitude: number;
  stop_order: number;
  arrival_offset_minutes: number;
};

export type TransitArrival = {
  id: string;
  route_id: string;
  stop_id: string;
  predicted_arrival_time: string;
  estimated_minutes: number;
  data_source: "wmata" | "simulated" | "predicted";
  vehicle_id: string | null;
  status: string;
};

export type DelayPattern = {
  route_id: string;
  stop_id: string;
  avg_delay: number;
  sample_count: number;
  delay_probability: number;
  max_delay: number;
};

export const useTransitRoutes = (universityId?: string | null) => {
  return useQuery({
    queryKey: ["transit-routes", universityId],
    queryFn: async () => {
      let query = supabase
        .from("transit_routes")
        .select("*")
        .eq("is_active", true)
        .order("route_name");

      if (universityId) {
        query = query.or(`university_id.eq.${universityId},university_id.is.null`);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as TransitRoute[];
    },
  });
};

export const useTransitStops = (routeId?: string) => {
  return useQuery({
    queryKey: ["transit-stops", routeId],
    enabled: !!routeId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transit_stops")
        .select("*")
        .eq("route_id", routeId!)
        .order("stop_order");

      if (error) throw error;
      return (data || []) as TransitStop[];
    },
  });
};

export const useAllTransitStops = (routeIds: string[]) => {
  return useQuery({
    queryKey: ["transit-stops-all", routeIds],
    enabled: routeIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transit_stops")
        .select("*")
        .in("route_id", routeIds)
        .order("stop_order");

      if (error) throw error;
      return (data || []) as TransitStop[];
    },
  });
};

export const useTransitArrivals = (routeId?: string | null) => {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["transit-arrivals", routeId],
    queryFn: async () => {
      let q = supabase
        .from("transit_arrivals")
        .select("*")
        .gte("predicted_arrival_time", new Date().toISOString())
        .order("predicted_arrival_time");

      if (routeId) {
        q = q.eq("route_id", routeId);
      }

      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as TransitArrival[];
    },
    refetchInterval: 30000,
  });

  useEffect(() => {
    const channel = supabase
      .channel("transit-arrivals-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "transit_arrivals" },
        () => {
          queryClient.invalidateQueries({ queryKey: ["transit-arrivals"] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  return query;
};

/** Fetch historical delay patterns for a route to show predictive insights */
export const useDelayPatterns = (routeId?: string | null) => {
  return useQuery({
    queryKey: ["delay-patterns", routeId],
    enabled: !!routeId,
    staleTime: 5 * 60 * 1000, // cache 5 min
    queryFn: async () => {
      const now = new Date();
      const dow = now.getDay();
      const hour = now.getHours();
      const hourRange = [(hour - 1 + 24) % 24, hour, (hour + 1) % 24];

      const { data, error } = await supabase
        .from("transit_arrival_history")
        .select("route_id, stop_id, delay_minutes")
        .eq("route_id", routeId!)
        .eq("day_of_week", dow)
        .in("hour_of_day", hourRange)
        .order("recorded_at", { ascending: false })
        .limit(200);

      if (error) throw error;

      // Aggregate by stop
      const groups = new Map<string, number[]>();
      for (const row of (data || [])) {
        const key = row.stop_id;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push(row.delay_minutes);
      }

      const patterns: DelayPattern[] = [];
      for (const [stopId, delays] of groups) {
        const n = delays.length;
        const avg = delays.reduce((s, d) => s + d, 0) / n;
        const maxDelay = Math.max(...delays);
        const delayedCount = delays.filter(d => d > 2).length;

        patterns.push({
          route_id: routeId!,
          stop_id: stopId,
          avg_delay: Math.round(avg * 10) / 10,
          sample_count: n,
          delay_probability: Math.round((delayedCount / n) * 100),
          max_delay: maxDelay,
        });
      }

      return patterns;
    },
  });
};
