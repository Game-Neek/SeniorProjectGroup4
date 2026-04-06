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
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Auth: user-scoped client ensures RLS
    const supabase = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader || "" } },
    });

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const url = new URL(req.url);
    const reportType = url.searchParams.get("type") || "daily"; // daily | weekly | summary
    const className = url.searchParams.get("class") || null;
    const startDate = url.searchParams.get("start") || null;
    const endDate = url.searchParams.get("end") || null;
    const page = parseInt(url.searchParams.get("page") || "1", 10);
    const pageSize = Math.min(parseInt(url.searchParams.get("page_size") || "50", 10), 200);
    const exportFormat = url.searchParams.get("export") || null; // "csv" or null

    const offset = (page - 1) * pageSize;

    if (reportType === "daily") {
      // Time-series daily metrics
      let query = supabase
        .from("daily_metrics")
        .select("*", { count: "exact" })
        .eq("user_id", user.id)
        .order("metric_date", { ascending: false })
        .range(offset, offset + pageSize - 1);

      if (className) query = query.eq("class_name", className);
      if (startDate) query = query.gte("metric_date", startDate);
      if (endDate) query = query.lte("metric_date", endDate);

      const { data, count, error } = await query;
      if (error) throw error;

      if (exportFormat === "csv") {
        return respondCSV(data || [], [
          "metric_date", "class_name", "events_count", "quizzes_taken",
          "avg_score", "exercises_completed", "modules_completed",
          "completion_rate", "avg_latency_ms", "topics"
        ]);
      }

      return jsonResponse({
        data,
        pagination: { page, page_size: pageSize, total: count || 0, total_pages: Math.ceil((count || 0) / pageSize) },
      });

    } else if (reportType === "weekly") {
      // Weekly performance snapshots
      let query = supabase
        .from("weekly_performance_snapshots")
        .select("*", { count: "exact" })
        .eq("user_id", user.id)
        .order("week_start", { ascending: false })
        .range(offset, offset + pageSize - 1);

      if (className) query = query.eq("class_name", className);
      if (startDate) query = query.gte("week_start", startDate);
      if (endDate) query = query.lte("week_start", endDate);

      const { data, count, error } = await query;
      if (error) throw error;

      if (exportFormat === "csv") {
        return respondCSV(data || [], [
          "week_start", "class_name", "quizzes_taken", "avg_score",
          "exercises_completed", "modules_completed", "mastery_pct", "topics_studied"
        ]);
      }

      return jsonResponse({
        data,
        pagination: { page, page_size: pageSize, total: count || 0, total_pages: Math.ceil((count || 0) / pageSize) },
      });

    } else if (reportType === "summary") {
      // Aggregated summary across all classes or a single class
      let query = supabase
        .from("daily_metrics")
        .select("*")
        .eq("user_id", user.id);

      if (className) query = query.eq("class_name", className);
      if (startDate) query = query.gte("metric_date", startDate);
      if (endDate) query = query.lte("metric_date", endDate);

      const { data, error } = await query;
      if (error) throw error;

      const rows = data || [];
      const totalEvents = rows.reduce((a, r) => a + (r.events_count || 0), 0);
      const totalQuizzes = rows.reduce((a, r) => a + (r.quizzes_taken || 0), 0);
      const scoredRows = rows.filter(r => r.quizzes_taken > 0);
      const avgScore = scoredRows.length
        ? Math.round(scoredRows.reduce((a, r) => a + (r.avg_score || 0), 0) / scoredRows.length)
        : 0;
      const totalExercises = rows.reduce((a, r) => a + (r.exercises_completed || 0), 0);
      const totalModules = rows.reduce((a, r) => a + (r.modules_completed || 0), 0);
      const allTopics = new Set<string>();
      rows.forEach(r => (r.topics || []).forEach((t: string) => allTopics.add(t)));
      const avgCompletion = rows.length
        ? Math.round(rows.reduce((a, r) => a + (r.completion_rate || 0), 0) / rows.length)
        : 0;

      // Per-class breakdown
      const byClass: Record<string, any> = {};
      rows.forEach(r => {
        if (!byClass[r.class_name]) {
          byClass[r.class_name] = { events: 0, quizzes: 0, scoreSum: 0, scoreCount: 0, exercises: 0, modules: 0, days: 0 };
        }
        const c = byClass[r.class_name];
        c.events += r.events_count || 0;
        c.quizzes += r.quizzes_taken || 0;
        if (r.quizzes_taken > 0) { c.scoreSum += r.avg_score || 0; c.scoreCount++; }
        c.exercises += r.exercises_completed || 0;
        c.modules += r.modules_completed || 0;
        c.days++;
      });

      const classBreakdown = Object.entries(byClass).map(([name, c]: [string, any]) => ({
        class_name: name,
        total_events: c.events,
        total_quizzes: c.quizzes,
        avg_score: c.scoreCount > 0 ? Math.round(c.scoreSum / c.scoreCount) : 0,
        total_exercises: c.exercises,
        total_modules: c.modules,
        active_days: c.days,
      }));

      return jsonResponse({
        summary: {
          total_events: totalEvents,
          total_quizzes: totalQuizzes,
          avg_score: avgScore,
          total_exercises: totalExercises,
          total_modules: totalModules,
          unique_topics: allTopics.size,
          avg_completion_rate: avgCompletion,
          active_days: rows.length,
        },
        class_breakdown: classBreakdown,
      });
    }

    return new Response(JSON.stringify({ error: "Invalid report type. Use: daily, weekly, summary" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Report error:", err);
    return new Response(JSON.stringify({ error: "Report generation failed" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

function jsonResponse(data: any) {
  return new Response(JSON.stringify(data), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function respondCSV(rows: any[], columns: string[]) {
  const header = columns.join(",");
  const lines = rows.map(row =>
    columns.map(col => {
      const val = row[col];
      if (val == null) return "";
      if (Array.isArray(val)) return `"${val.join("; ")}"`;
      if (typeof val === "object") return `"${JSON.stringify(val).replace(/"/g, '""')}"`;
      return String(val).includes(",") ? `"${val}"` : String(val);
    }).join(",")
  );
  const csv = [header, ...lines].join("\n");

  return new Response(csv, {
    headers: {
      ...corsHeaders,
      "Content-Type": "text/csv",
      "Content-Disposition": "attachment; filename=performance-report.csv",
    },
  });
}
