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

    const { type, userId, className, data } = await req.json();

    if (!type || !userId) {
      return new Response(JSON.stringify({ error: "type and userId required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check user's notification preferences
    const { data: prefs } = await supabase
      .from("notification_preferences")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();

    const notifications: { title: string; body: string; category: string; source_type?: string; source_id?: string }[] = [];

    switch (type) {
      case "chapter_complete": {
        if (prefs && !prefs.course_updates) break;
        if (prefs?.disabled_classes?.includes(className)) break;

        const topicName = data?.topic || "a chapter";
        const score = data?.score;
        notifications.push({
          title: `🎉 Chapter Complete: ${topicName}`,
          body: score
            ? `Congratulations! You completed "${topicName}" with a score of ${score}%. Keep up the great work!`
            : `Congratulations! You've completed "${topicName}". Onwards to the next chapter!`,
          category: "course_updates",
          source_type: "chapter",
          source_id: data?.chapterId,
        });
        break;
      }

      case "badge_earned": {
        if (prefs && !prefs.course_updates) break;

        const badgeName = data?.badge || "a new badge";
        const badgeDesc = data?.description || "You've unlocked an achievement!";
        notifications.push({
          title: `🏆 Badge Earned: ${badgeName}`,
          body: badgeDesc,
          category: "course_updates",
          source_type: "badge",
        });
        break;
      }

      case "streak": {
        if (prefs && !prefs.study_plan) break;

        const days = data?.days || 0;
        let emoji = "🔥";
        let message = `You've studied ${days} days in a row!`;
        if (days >= 30) {
          emoji = "💎";
          message = `Incredible! ${days}-day study streak! You're unstoppable!`;
        } else if (days >= 14) {
          emoji = "⭐";
          message = `Amazing! ${days}-day study streak! Keep the momentum going!`;
        } else if (days >= 7) {
          emoji = "🔥";
          message = `Great job! ${days}-day study streak! You're on fire!`;
        } else if (days >= 3) {
          emoji = "✨";
          message = `Nice! ${days}-day study streak! Keep it up!`;
        }

        notifications.push({
          title: `${emoji} ${days}-Day Study Streak!`,
          body: message,
          category: "study_plan",
          source_type: "streak",
        });
        break;
      }

      case "weekly_digest": {
        if (prefs && !prefs.study_plan) break;

        const stats = data || {};
        const quizzes = stats.quizzes_taken || 0;
        const avgScore = stats.avg_score != null ? Math.round(stats.avg_score) : null;
        const modules = stats.modules_completed || 0;
        const mastery = stats.mastery_pct != null ? Math.round(stats.mastery_pct) : null;
        const topicsStudied = stats.topics_studied || [];

        let body = "Here's your weekly learning summary:\n";
        if (quizzes > 0) body += `• ${quizzes} quiz${quizzes > 1 ? "zes" : ""} taken`;
        if (avgScore != null) body += ` (avg: ${avgScore}%)`;
        body += "\n";
        if (modules > 0) body += `• ${modules} module${modules > 1 ? "s" : ""} completed\n`;
        if (mastery != null) body += `• Overall mastery: ${mastery}%\n`;
        if (topicsStudied.length > 0) body += `• Topics covered: ${topicsStudied.slice(0, 5).join(", ")}`;

        // Improvement areas
        if (stats.weak_areas && stats.weak_areas.length > 0) {
          body += `\n\n📌 Focus areas: ${stats.weak_areas.slice(0, 3).join(", ")}`;
        }

        notifications.push({
          title: `📊 Weekly Performance Digest${className ? ` — ${className}` : ""}`,
          body: body.trim(),
          category: "study_plan",
          source_type: "weekly_digest",
        });
        break;
      }

      case "campus_event": {
        if (prefs && !prefs.system_alerts) break;

        const eventTitle = data?.title || "Campus Event";
        const eventDate = data?.date || "";
        notifications.push({
          title: `📅 ${eventTitle}`,
          body: eventDate ? `Happening on ${eventDate}. Don't miss it!` : "Check your calendar for details.",
          category: "system_alerts",
          source_type: "campus_event",
          source_id: data?.eventId,
        });
        break;
      }

      case "mastery_milestone": {
        if (prefs && !prefs.quiz_results) break;
        if (prefs?.disabled_classes?.includes(className)) break;

        const topicName = data?.topic || "a topic";
        const level = data?.level || "mastered";
        const emojis: Record<string, string> = {
          familiar: "📗",
          proficient: "📘",
          mastered: "🌟",
        };

        notifications.push({
          title: `${emojis[level] || "🌟"} Mastery Milestone: ${topicName}`,
          body: `You've reached "${level}" level in "${topicName}". ${
            level === "mastered"
              ? "Outstanding work! 🎓"
              : "Keep practicing to reach full mastery!"
          }`,
          category: "quiz_results",
          source_type: "mastery",
        });
        break;
      }

      default:
        return new Response(JSON.stringify({ error: `Unknown type: ${type}` }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }

    // Check quiet hours
    if (prefs?.quiet_hours_enabled && prefs.quiet_hours_start && prefs.quiet_hours_end) {
      const now = new Date();
      const hours = now.getHours();
      const minutes = now.getMinutes();
      const currentMinutes = hours * 60 + minutes;

      const [startH, startM] = prefs.quiet_hours_start.split(":").map(Number);
      const [endH, endM] = prefs.quiet_hours_end.split(":").map(Number);
      const startMinutes = startH * 60 + startM;
      const endMinutes = endH * 60 + endM;

      let isQuiet = false;
      if (startMinutes <= endMinutes) {
        isQuiet = currentMinutes >= startMinutes && currentMinutes < endMinutes;
      } else {
        // Overnight range (e.g. 22:00 to 07:00)
        isQuiet = currentMinutes >= startMinutes || currentMinutes < endMinutes;
      }

      if (isQuiet) {
        // During quiet hours, skip in-app but could queue for later
        return new Response(JSON.stringify({ queued: true, message: "Quiet hours active" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Insert notifications
    if (notifications.length > 0) {
      const rows = notifications.map((n) => ({
        user_id: userId,
        title: n.title,
        body: n.body,
        category: n.category,
        source_type: n.source_type || null,
        source_id: n.source_id || null,
      }));

      const { error } = await supabase.from("notifications").insert(rows);
      if (error) {
        console.error("Failed to insert notifications:", error);
        return new Response(JSON.stringify({ error: "Failed to create notifications" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    return new Response(
      JSON.stringify({ success: true, count: notifications.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Milestone notification error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
