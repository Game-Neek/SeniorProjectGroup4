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

interface HistoricalPattern {
  avg_delay: number;
  std_delay: number;
  sample_count: number;
  max_delay: number;
  delay_probability: number; // % of arrivals that were delayed
}

interface PredictionResult {
  predicted_minutes: number;
  confidence: number; // 0-100
  delay_risk: "low" | "moderate" | "high";
  expected_delay: number;
  pattern_source: string;
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
    const currentDow = now.getDay(); // 0=Sunday
    const currentHour = now.getHours();

    // 2. Load historical patterns for prediction
    const historicalPatterns = await loadHistoricalPatterns(supabase, routes.map(r => r.id), currentDow, currentHour);

    const arrivals: Array<{
      route_id: string;
      stop_id: string;
      predicted_arrival_time: string;
      estimated_minutes: number;
      data_source: string;
      vehicle_id: string | null;
      status: string;
    }> = [];

    // Records to log into history for future predictions
    const historyRecords: Array<{
      route_id: string;
      stop_id: string;
      scheduled_minutes: number;
      actual_minutes: number;
      delay_minutes: number;
      day_of_week: number;
      hour_of_day: number;
      data_source: string;
    }> = [];

    // 3. WMATA real-time data for metro routes
    if (wmataKey) {
      const metroRoutes = routes.filter((r) => r.route_type === "metro");
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

              for (const metroRoute of metroRoutes) {
                const routeStops = stops.filter(
                  (s) => s.route_id === metroRoute.id
                );
                const matchingStop = routeStops.find(
                  (s) =>
                    (stationCode === "E02" && s.stop_name.includes("Shaw")) ||
                    (stationCode === "E03" && s.stop_name.includes("U Street"))
                );

                if (matchingStop) {
                  // Apply predictive adjustment from historical patterns
                  const pattern = getPattern(historicalPatterns, metroRoute.id, matchingStop.id);
                  const prediction = computePrediction(minutes, matchingStop.arrival_offset_minutes, pattern);

                  const arrivalTime = new Date(now.getTime() + prediction.predicted_minutes * 60000);
                  arrivals.push({
                    route_id: metroRoute.id,
                    stop_id: matchingStop.id,
                    predicted_arrival_time: arrivalTime.toISOString(),
                    estimated_minutes: prediction.predicted_minutes,
                    data_source: "wmata",
                    vehicle_id: pred.Car ? `${pred.Car}-car` : null,
                    status:
                      pred.Min === "ARR" ? "arriving" :
                      pred.Min === "BRD" ? "boarding" :
                      prediction.delay_risk === "high" ? "delayed" :
                      "on_time",
                  });

                  // Log for history
                  historyRecords.push({
                    route_id: metroRoute.id,
                    stop_id: matchingStop.id,
                    scheduled_minutes: matchingStop.arrival_offset_minutes,
                    actual_minutes: minutes,
                    delay_minutes: Math.max(0, minutes - matchingStop.arrival_offset_minutes),
                    day_of_week: currentDow,
                    hour_of_day: currentHour,
                    data_source: "wmata",
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

    // 4. Simulated shuttle arrivals with predictive analytics
    const shuttleRoutes = routes.filter((r) => r.route_type === "shuttle");

    for (const route of shuttleRoutes) {
      const routeStops = stops
        .filter((s) => s.route_id === route.id)
        .sort((a, b) => a.stop_order - b.stop_order);

      if (routeStops.length === 0) continue;

      const freq = route.frequency_minutes || 20;

      for (let dep = 0; dep < 3; dep++) {
        // Base jitter simulates real-world variance
        const baseJitter = Math.floor(Math.random() * 8) - 2;
        const baseMinutes = dep * freq + Math.max(0, baseJitter);

        for (const stop of routeStops) {
          const scheduledMinutes = baseMinutes + stop.arrival_offset_minutes;

          // Apply historical pattern prediction
          const pattern = getPattern(historicalPatterns, route.id, stop.id);
          const prediction = computePrediction(scheduledMinutes, stop.arrival_offset_minutes, pattern);

          const arrivalTime = new Date(now.getTime() + prediction.predicted_minutes * 60000);

          let status = "on_time";
          if (prediction.delay_risk === "high") status = "delayed";
          else if (prediction.expected_delay < -1) status = "early";
          else if (prediction.delay_risk === "moderate") status = "delayed";

          arrivals.push({
            route_id: route.id,
            stop_id: stop.id,
            predicted_arrival_time: arrivalTime.toISOString(),
            estimated_minutes: prediction.predicted_minutes,
            data_source: "predicted",
            vehicle_id: `SH-${route.route_name.substring(0, 3).toUpperCase()}-${dep + 1}`,
            status,
          });

          // Log for history
          historyRecords.push({
            route_id: route.id,
            stop_id: stop.id,
            scheduled_minutes: stop.arrival_offset_minutes,
            actual_minutes: prediction.predicted_minutes,
            delay_minutes: Math.max(0, prediction.expected_delay),
            day_of_week: currentDow,
            hour_of_day: currentHour,
            data_source: "simulated",
          });
        }
      }
    }

    // 5. Clear old arrivals and insert fresh data
    await supabase
      .from("transit_arrivals")
      .delete()
      .lt("predicted_arrival_time", new Date(now.getTime() - 5 * 60000).toISOString());

    if (arrivals.length > 0) {
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

    // 6. Log history records (sample — keep 1 in 3 to avoid table bloat)
    const sampledHistory = historyRecords.filter(() => Math.random() < 0.33);
    if (sampledHistory.length > 0) {
      await supabase
        .from("transit_arrival_history")
        .insert(sampledHistory);
    }

    // 7. Prune history older than 90 days
    const pruneDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString();
    await supabase
      .from("transit_arrival_history")
      .delete()
      .lt("recorded_at", pruneDate);

    return new Response(
      JSON.stringify({
        success: true,
        arrivals_count: arrivals.length,
        history_logged: sampledHistory.length,
        wmata_enabled: !!wmataKey,
        predictions_enabled: true,
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

/* ─── Predictive Analytics Helpers ─── */

async function loadHistoricalPatterns(
  supabase: ReturnType<typeof createClient>,
  routeIds: string[],
  dayOfWeek: number,
  hourOfDay: number,
): Promise<Map<string, HistoricalPattern>> {
  const patterns = new Map<string, HistoricalPattern>();

  if (routeIds.length === 0) return patterns;

  // Query: avg delay grouped by route+stop for same day-of-week and ±1 hour window
  const hourRange = [
    (hourOfDay - 1 + 24) % 24,
    hourOfDay,
    (hourOfDay + 1) % 24,
  ];

  const { data } = await supabase
    .from("transit_arrival_history")
    .select("route_id, stop_id, delay_minutes, actual_minutes, scheduled_minutes")
    .in("route_id", routeIds)
    .eq("day_of_week", dayOfWeek)
    .in("hour_of_day", hourRange)
    .order("recorded_at", { ascending: false })
    .limit(500);

  if (!data || data.length === 0) return patterns;

  // Group by route+stop
  const groups = new Map<string, number[]>();
  for (const row of data) {
    const key = `${row.route_id}:${row.stop_id}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(row.delay_minutes);
  }

  for (const [key, delays] of groups) {
    const n = delays.length;
    const avg = delays.reduce((s, d) => s + d, 0) / n;
    const variance = delays.reduce((s, d) => s + (d - avg) ** 2, 0) / n;
    const std = Math.sqrt(variance);
    const maxDelay = Math.max(...delays);
    const delayedCount = delays.filter(d => d > 2).length; // >2 min is "delayed"

    patterns.set(key, {
      avg_delay: Math.round(avg * 10) / 10,
      std_delay: Math.round(std * 10) / 10,
      sample_count: n,
      max_delay: maxDelay,
      delay_probability: Math.round((delayedCount / n) * 100),
    });
  }

  return patterns;
}

function getPattern(
  patterns: Map<string, HistoricalPattern>,
  routeId: string,
  stopId: string,
): HistoricalPattern | null {
  return patterns.get(`${routeId}:${stopId}`) || null;
}

function computePrediction(
  scheduledMinutes: number,
  _offsetMinutes: number,
  pattern: HistoricalPattern | null,
): PredictionResult {
  // No historical data — return scheduled with low confidence
  if (!pattern || pattern.sample_count < 3) {
    return {
      predicted_minutes: scheduledMinutes,
      confidence: 30,
      delay_risk: "low",
      expected_delay: 0,
      pattern_source: "schedule",
    };
  }

  // Apply historical average delay as adjustment
  const adjustedMinutes = Math.max(0, Math.round(scheduledMinutes + pattern.avg_delay));

  // Confidence: higher with more samples and lower variance
  const sampleConfidence = Math.min(50, pattern.sample_count * 2); // max 50 from samples
  const varianceConfidence = Math.max(0, 50 - pattern.std_delay * 10); // max 50 from low variance
  const confidence = Math.min(95, Math.round(sampleConfidence + varianceConfidence));

  // Delay risk classification
  let delay_risk: "low" | "moderate" | "high" = "low";
  if (pattern.delay_probability > 60 || pattern.avg_delay > 5) {
    delay_risk = "high";
  } else if (pattern.delay_probability > 30 || pattern.avg_delay > 2) {
    delay_risk = "moderate";
  }

  return {
    predicted_minutes: adjustedMinutes,
    confidence,
    delay_risk,
    expected_delay: pattern.avg_delay,
    pattern_source: `${pattern.sample_count} observations`,
  };
}
