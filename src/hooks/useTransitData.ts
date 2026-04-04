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
  data_source: "wmata" | "simulated";
  vehicle_id: string | null;
  status: string;
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
    refetchInterval: 30000, // fallback polling every 30s
  });

  // Realtime subscription
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
