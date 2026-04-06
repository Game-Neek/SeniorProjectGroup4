const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Validate JWT and get user
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader || "" } },
    });
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const targetDate = body.date ? new Date(body.date) : new Date();
    const className = body.class_name || null;

    // Fetch learning events for the target date
    const startOfDay = new Date(targetDate);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(targetDate);
    endOfDay.setHours(23, 59, 59, 999);

    let query = supabase
      .from("learning_events")
      .select("*")
      .eq("user_id", user.id)
      .gte("created_at", startOfDay.toISOString())
      .lte("created_at", endOfDay.toISOString());

    if (className) {
      query = query.eq("class_name", className);
    }

    const { data: events, error: eventsError } = await query;
    if (eventsError) throw eventsError;

    if (!events || events.length === 0) {
      return new Response(JSON.stringify({ message: "No events for this date", rows: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Group by class_name
    const grouped: Record<string, any[]> = {};
    events.forEach((e: any) => {
      if (!grouped[e.class_name]) grouped[e.class_name] = [];
      grouped[e.class_name].push(e);
    });

    let totalRows = 0;

    for (const [cls, classEvents] of Object.entries(grouped)) {
      const quizEvents = classEvents.filter(e =>
        e.event_type === "quiz_attempt" || e.event_type === "quiz_completed"
      );
      const scores = quizEvents.filter(e => e.score != null && e.total != null && e.total > 0);
      const avgScore = scores.length
        ? scores.reduce((a, e) => a + (e.score / e.total) * 100, 0) / scores.length
        : 0;

      const exerciseEvents = classEvents.filter(e => e.event_type === "exercise_completed");
      const moduleEvents = classEvents.filter(e => e.event_type === "module_completed");

      const bloomDist: Record<string, number> = {};
      classEvents.forEach(e => {
        if (e.bloom_level) bloomDist[e.bloom_level] = (bloomDist[e.bloom_level] || 0) + 1;
      });

      const topics = [...new Set(classEvents.filter(e => e.topic).map(e => e.topic))];

      const completedCount = classEvents.filter(e =>
        e.event_type?.includes("completed") || e.outcome === "correct" || e.outcome === "pass"
      ).length;
      const completionRate = classEvents.length > 0 ? (completedCount / classEvents.length) * 100 : 0;

      const latencies = classEvents.filter(e => e.latency_ms != null);
      const avgLatency = latencies.length
        ? Math.round(latencies.reduce((a, e) => a + e.latency_ms, 0) / latencies.length)
        : 0;

      const dateStr = startOfDay.toISOString().split("T")[0];

      const { error: upsertError } = await supabase
        .from("daily_metrics")
        .upsert({
          user_id: user.id,
          class_name: cls,
          metric_date: dateStr,
          events_count: classEvents.length,
          quizzes_taken: quizEvents.length,
          avg_score: Math.round(avgScore * 100) / 100,
          exercises_completed: exerciseEvents.length,
          modules_completed: moduleEvents.length,
          bloom_distribution: bloomDist,
          topics,
          completion_rate: Math.round(completionRate * 100) / 100,
          avg_latency_ms: avgLatency,
        }, { onConflict: "user_id,class_name,metric_date" });

      if (upsertError) {
        console.error(`Upsert error for ${cls}:`, upsertError);
      } else {
        totalRows++;
      }
    }

    return new Response(JSON.stringify({ success: true, rows: totalRows }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Aggregation error:", err);
    return new Response(JSON.stringify({ error: "Aggregation failed" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
