import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface WmataPrediction {
  LocationName: string;
  DestinationName: string;
  Line: string;
  Min: string;
  Group: string;
  Car: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const wmataKey = Deno.env.get("WMATA_API_KEY");

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  try {
    // 1. Fetch all active routes and their stops
    const { data: routes } = await supabase
      .from("transit_routes")
      .select("id, route_name, route_type, frequency_minutes")
      .eq("is_active", true);

    const { data: stops } = await supabase
      .from("transit_stops")
      .select("id, route_id, stop_name, stop_order, arrival_offset_minutes");

    if (!routes || !stops) {
      throw new Error("Failed to fetch routes/stops");
    }

    const now = new Date();
    const arrivals: Array<{
      route_id: string;
      stop_id: string;
      predicted_arrival_time: string;
      estimated_minutes: number;
      data_source: string;
      vehicle_id: string | null;
      status: string;
    }> = [];

    // 2. WMATA real-time data for metro routes
    if (wmataKey) {
      const metroRoutes = routes.filter((r) => r.route_type === "metro");
      // Shaw-Howard = E02, U Street = E03
      const stationCodes = ["E02", "E03"];

      for (const stationCode of stationCodes) {
        try {
          const res = await fetch(
            `https://api.wmata.com/StationPrediction.svc/json/GetPrediction/${stationCode}`,
            { headers: { api_key: wmataKey } }
          );

          if (res.ok) {
            const data = await res.json();
            const predictions: WmataPrediction[] = data.Trains || [];

            for (const pred of predictions) {
              const minutes =
                pred.Min === "ARR" || pred.Min === "BRD"
                  ? 0
                  : parseInt(pred.Min) || 0;

              // Match to our metro route/stops
              for (const metroRoute of metroRoutes) {
                const routeStops = stops.filter(
                  (s) => s.route_id === metroRoute.id
                );
                const matchingStop = routeStops.find(
                  (s) =>
                    (stationCode === "E02" &&
                      s.stop_name.includes("Shaw")) ||
                    (stationCode === "E03" &&
                      s.stop_name.includes("U Street"))
                );

                if (matchingStop) {
                  const arrivalTime = new Date(
                    now.getTime() + minutes * 60000
                  );
                  arrivals.push({
                    route_id: metroRoute.id,
                    stop_id: matchingStop.id,
                    predicted_arrival_time: arrivalTime.toISOString(),
                    estimated_minutes: minutes,
                    data_source: "wmata",
                    vehicle_id: pred.Car ? `${pred.Car}-car` : null,
                    status:
                      pred.Min === "ARR"
                        ? "arriving"
                        : pred.Min === "BRD"
                        ? "boarding"
                        : "on_time",
                  });
                }
              }
            }
          }
        } catch (e) {
          console.error(`WMATA fetch failed for ${stationCode}:`, e);
        }
      }
    }

    // 3. Simulated shuttle arrivals
    const shuttleRoutes = routes.filter((r) => r.route_type === "shuttle");

    for (const route of shuttleRoutes) {
      const routeStops = stops
        .filter((s) => s.route_id === route.id)
        .sort((a, b) => a.stop_order - b.stop_order);

      if (routeStops.length === 0) continue;

      const freq = route.frequency_minutes || 20;

      // Generate next 3 departures from first stop
      for (let dep = 0; dep < 3; dep++) {
        // Add some realistic variance: -2 to +5 min random delay
        const jitter = Math.floor(Math.random() * 8) - 2;
        const baseMinutes = dep * freq + Math.max(0, jitter);

        for (const stop of routeStops) {
          const totalMinutes =
            baseMinutes + stop.arrival_offset_minutes;
          const arrivalTime = new Date(
            now.getTime() + totalMinutes * 60000
          );

          // Determine status based on jitter
          let status = "on_time";
          if (jitter > 3) status = "delayed";
          else if (jitter < 0) status = "early";

          arrivals.push({
            route_id: route.id,
            stop_id: stop.id,
            predicted_arrival_time: arrivalTime.toISOString(),
            estimated_minutes: totalMinutes,
            data_source: "simulated",
            vehicle_id: `SH-${route.route_name
              .substring(0, 3)
              .toUpperCase()}-${dep + 1}`,
            status,
          });
        }
      }
    }

    // 4. Clear old arrivals and insert fresh data
    await supabase
      .from("transit_arrivals")
      .delete()
      .lt("predicted_arrival_time", new Date(now.getTime() - 5 * 60000).toISOString());

    if (arrivals.length > 0) {
      // Delete all current arrivals and replace with fresh ones
      await supabase
        .from("transit_arrivals")
        .delete()
        .gte("predicted_arrival_time", new Date(0).toISOString());

      const { error } = await supabase
        .from("transit_arrivals")
        .insert(arrivals);

      if (error) {
        console.error("Insert error:", error);
        throw error;
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        arrivals_count: arrivals.length,
        wmata_enabled: !!wmataKey,
        timestamp: now.toISOString(),
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Transit feed error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
