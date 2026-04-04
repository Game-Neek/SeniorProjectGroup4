import { useQuery } from "@tanstack/react-query";
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

export const useTransitRoutes = (type?: "shuttle" | "metro") => {
  return useQuery({
    queryKey: ["transit-routes", type],
    queryFn: async () => {
      let query = supabase
        .from("transit_routes")
        .select("*")
        .eq("is_active", true)
        .order("route_name");

      if (type) {
        query = query.eq("route_type", type);
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
