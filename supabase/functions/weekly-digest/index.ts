import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.76.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("Missing server configuration");
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Get the start of the current week (Monday)
    const now = new Date();
    const dayOfWeek = now.getDay();
    const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() + mondayOffset);
    weekStart.setHours(0, 0, 0, 0);
    const weekStartStr = weekStart.toISOString().split("T")[0];

    // Find snapshots for this week
    const { data: snapshots, error } = await supabase
      .from("weekly_performance_snapshots")
      .select("*")
      .eq("week_start", weekStartStr);

    if (error) {
      console.error("Failed to fetch snapshots:", error);
      throw error;
    }

    if (!snapshots || snapshots.length === 0) {
      return new Response(
        JSON.stringify({ message: "No snapshots for this week" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Group by user
    const userSnapshots = new Map<string, typeof snapshots>();
    for (const s of snapshots) {
      if (!userSnapshots.has(s.user_id)) userSnapshots.set(s.user_id, []);
      userSnapshots.get(s.user_id)!.push(s);
    }

    let notificationCount = 0;

    for (const [userId, userSnaps] of userSnapshots) {
      // Check user preferences
      const { data: prefs } = await supabase
        .from("notification_preferences")
        .select("study_plan, frequency")
        .eq("user_id", userId)
        .maybeSingle();

      // Skip if user has disabled study_plan notifications
      if (prefs && !prefs.study_plan) continue;
      // Only send digest if user has weekly frequency or it's end of week
      if (prefs?.frequency === "daily" && now.getDay() !== 0) continue;

      // Aggregate stats across classes
      let totalQuizzes = 0;
      let totalModules = 0;
      let totalExercises = 0;
      let scoreSum = 0;
      let scoreCount = 0;
      let masterySum = 0;
      let masteryCount = 0;
      const allTopics: string[] = [];
      const classNames: string[] = [];

      for (const s of userSnaps) {
        totalQuizzes += s.quizzes_taken || 0;
        totalModules += s.modules_completed || 0;
        totalExercises += s.exercises_completed || 0;
        if (s.avg_score != null) {
          scoreSum += Number(s.avg_score);
          scoreCount++;
        }
        if (s.mastery_pct != null) {
          masterySum += Number(s.mastery_pct);
          masteryCount++;
        }
        if (s.topics_studied) allTopics.push(...s.topics_studied);
        if (!classNames.includes(s.class_name)) classNames.push(s.class_name);
      }

      const avgScore = scoreCount > 0 ? Math.round(scoreSum / scoreCount) : null;
      const avgMastery = masteryCount > 0 ? Math.round(masterySum / masteryCount) : null;

      // Build digest notification body
      let body = `📅 Week of ${weekStartStr}\n`;
      if (classNames.length > 0) body += `📖 Classes: ${classNames.join(", ")}\n\n`;
      body += `• Quizzes taken: ${totalQuizzes}\n`;
      if (avgScore != null) body += `• Average score: ${avgScore}%\n`;
      body += `• Modules completed: ${totalModules}\n`;
      body += `• Exercises completed: ${totalExercises}\n`;
      if (avgMastery != null) body += `• Overall mastery: ${avgMastery}%\n`;
      if (allTopics.length > 0) {
        const unique = [...new Set(allTopics)].slice(0, 5);
        body += `• Topics studied: ${unique.join(", ")}`;
      }

      // Insert notification
      await supabase.from("notifications").insert({
        user_id: userId,
        title: "📊 Your Weekly Performance Digest",
        body: body.trim(),
        category: "study_plan",
        source_type: "weekly_digest",
      });

      notificationCount++;
    }

    return new Response(
      JSON.stringify({ success: true, notificationsSent: notificationCount }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Weekly digest error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
