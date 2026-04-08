import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.76.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/*
 * Predictive Coaching Engine
 *
 * Rules & Heuristics:
 * ────────────────────
 * 1. DECLINING PERFORMANCE  — avg score dropped ≥15% over last 2 weeks → suggest review coaching
 * 2. STAGNATION             — no activity in 3+ days on an unlocked topic → nudge to resume
 * 3. APPROACHING DEADLINE   — exam/test within 7 days + mastery <70% on related topic → cram coaching
 * 4. KNOWLEDGE GAP CASCADE  — topic with <50% mastery blocks 2+ downstream topics → priority alert
 * 5. STRENGTH ACCELERATION  — topic at 70-89% mastery with high attempt count → push to mastery
 * 6. BLOOM LEVEL PLATEAU    — student only operates at Remember/Understand → suggest higher-order practice
 * 7. STREAK AT RISK         — active streak but no activity today by evening → gentle nudge
 * 8. READY-TO-ADVANCE       — all prerequisites met for next topic → proactive unlock suggestion
 */

interface Recommendation {
  rule: string;
  priority: "high" | "medium" | "low";
  title: string;
  body: string;
  className: string;
  topic?: string;
  actionType: "review" | "practice" | "coaching" | "advance" | "cram" | "nudge";
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) throw new Error("Missing config");

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Can be called for a specific user or for all users (cron)
    const body = await req.json().catch(() => ({}));
    const targetUserId = body.userId || null;

    // Get users to process
    let userIds: string[] = [];
    if (targetUserId) {
      userIds = [targetUserId];
    } else {
      // Cron mode: get all active users (had events in last 30 days)
      const { data: activeUsers } = await supabase
        .from("learning_events")
        .select("user_id")
        .gte("created_at", new Date(Date.now() - 30 * 86400000).toISOString());

      if (activeUsers) {
        userIds = [...new Set(activeUsers.map((u: any) => u.user_id))];
      }
    }

    let totalRecs = 0;

    for (const userId of userIds) {
      const recommendations: Recommendation[] = [];

      // Fetch user data in parallel
      const [classesRes, focusAreasRes, dailyMetricsRes, eventsRes, calendarRes, masteryRes] = await Promise.all([
        supabase.from("user_classes").select("class_name").eq("user_id", userId).eq("is_archived", false),
        supabase.from("study_focus_areas").select("*").eq("user_id", userId),
        supabase.from("daily_metrics").select("*").eq("user_id", userId)
          .gte("metric_date", new Date(Date.now() - 14 * 86400000).toISOString().split("T")[0])
          .order("metric_date", { ascending: true }),
        supabase.from("learning_events").select("created_at, class_name, topic, bloom_level, score, total")
          .eq("user_id", userId)
          .gte("created_at", new Date(Date.now() - 14 * 86400000).toISOString())
          .order("created_at", { ascending: false }),
        supabase.from("calendar_events").select("title, event_date, event_type")
          .eq("user_id", userId)
          .gte("event_date", new Date().toISOString().split("T")[0])
          .lte("event_date", new Date(Date.now() + 7 * 86400000).toISOString().split("T")[0]),
        supabase.from("knowledge_mastery").select("mastery_score, mastery_level, component_id, attempts, updated_at")
          .eq("user_id", userId),
      ]);

      const classes = (classesRes.data || []).map((c: any) => c.class_name);
      const focusAreas = focusAreasRes.data || [];
      const dailyMetrics = dailyMetricsRes.data || [];
      const events = eventsRes.data || [];
      const calendar = calendarRes.data || [];
      const mastery = masteryRes.data || [];

      for (const className of classes) {
        const classMetrics = dailyMetrics.filter((m: any) => m.class_name === className);
        const classFocusAreas = focusAreas.filter((a: any) => a.class_name === className);
        const classEvents = events.filter((e: any) => e.class_name === className);

        // ── RULE 1: DECLINING PERFORMANCE ──
        if (classMetrics.length >= 4) {
          const half = Math.floor(classMetrics.length / 2);
          const firstHalf = classMetrics.slice(0, half);
          const secondHalf = classMetrics.slice(half);
          const avgFirst = firstHalf.reduce((s: number, m: any) => s + (m.avg_score || 0), 0) / firstHalf.length;
          const avgSecond = secondHalf.reduce((s: number, m: any) => s + (m.avg_score || 0), 0) / secondHalf.length;

          if (avgFirst - avgSecond >= 15) {
            const weakTopics = classMetrics.slice(-3)
              .flatMap((m: any) => m.topics || [])
              .filter((t: string, i: number, a: string[]) => a.indexOf(t) === i)
              .slice(0, 3);

            recommendations.push({
              rule: "declining_performance",
              priority: "high",
              title: `📉 Performance Declining in ${className}`,
              body: `Your average score dropped from ${Math.round(avgFirst)}% to ${Math.round(avgSecond)}% over the past two weeks.${
                weakTopics.length > 0 ? ` Focus on: ${weakTopics.join(", ")}.` : ""
              } Consider reviewing recent material.`,
              className,
              actionType: "review",
            });
          }
        }

        // ── RULE 2: STAGNATION ──
        const unlockedNotPassed = classFocusAreas.filter((a: any) => a.is_unlocked && !a.quiz_passed);
        for (const area of unlockedNotPassed) {
          const areaEvents = classEvents.filter((e: any) =>
            e.topic && e.topic.toLowerCase().includes(area.topic.toLowerCase())
          );
          const lastActivity = areaEvents.length > 0
            ? new Date(areaEvents[0].created_at).getTime()
            : new Date(area.updated_at || area.created_at).getTime();
          const daysSince = (Date.now() - lastActivity) / 86400000;

          if (daysSince >= 3) {
            recommendations.push({
              rule: "stagnation",
              priority: daysSince >= 7 ? "high" : "medium",
              title: `⏸️ Resume "${area.topic}" in ${className}`,
              body: `It's been ${Math.round(daysSince)} days since you last worked on "${area.topic}". ${
                daysSince >= 7 ? "Don't let this topic slip — pick up where you left off!" : "A quick 15-minute session can keep the momentum going."
              }`,
              className,
              topic: area.topic,
              actionType: "nudge",
            });
          }
        }

        // ── RULE 3: APPROACHING DEADLINE ──
        const testTypes = ["exam", "test", "midterm", "final", "quiz"];
        const upcomingTests = calendar.filter((e: any) =>
          e.event_type && testTypes.some(t => e.event_type.toLowerCase().includes(t)) &&
          e.title?.toLowerCase().includes(className.toLowerCase().split(" ")[0])
        );

        for (const test of upcomingTests) {
          const daysUntil = Math.ceil((new Date(test.event_date).getTime() - Date.now()) / 86400000);
          // Find related focus areas not mastered
          const notMastered = classFocusAreas.filter((a: any) => !a.quiz_passed);
          if (notMastered.length > 0 && daysUntil <= 7) {
            const topicNames = notMastered.slice(0, 3).map((a: any) => a.topic).join(", ");
            recommendations.push({
              rule: "approaching_deadline",
              priority: daysUntil <= 2 ? "high" : "medium",
              title: `🚨 ${test.title} in ${daysUntil} day${daysUntil !== 1 ? "s" : ""}`,
              body: `You have ${notMastered.length} topic${notMastered.length !== 1 ? "s" : ""} not yet mastered: ${topicNames}. Start intensive review now.`,
              className,
              actionType: "cram",
            });
          }
        }

        // ── RULE 4: KNOWLEDGE GAP CASCADE ──
        const gapAreas = classFocusAreas
          .filter((a: any) => !a.quiz_passed && a.quiz_score !== null && a.quiz_score < 50)
          .sort((a: any, b: any) => a.topic_order - b.topic_order);

        for (const gap of gapAreas) {
          const downstream = classFocusAreas.filter((a: any) =>
            a.topic_order > gap.topic_order && !a.is_unlocked
          );
          if (downstream.length >= 2) {
            recommendations.push({
              rule: "knowledge_gap_cascade",
              priority: "high",
              title: `🔗 Knowledge Gap Blocking Progress in ${className}`,
              body: `"${gap.topic}" (${gap.quiz_score}%) is blocking ${downstream.length} downstream topics. Master this foundational topic to unlock further content.`,
              className,
              topic: gap.topic,
              actionType: "coaching",
            });
          }
        }

        // ── RULE 5: STRENGTH ACCELERATION ──
        const nearMastery = classFocusAreas.filter((a: any) =>
          a.quiz_passed && a.quiz_score !== null && a.quiz_score >= 70 && a.quiz_score < 90
        );
        for (const area of nearMastery.slice(0, 2)) {
          recommendations.push({
            rule: "strength_acceleration",
            priority: "low",
            title: `🚀 Push "${area.topic}" to Mastery`,
            body: `You're at ${area.quiz_score}% on "${area.topic}". A few more practice sessions could push you to full mastery!`,
            className,
            topic: area.topic,
            actionType: "practice",
          });
        }

        // ── RULE 6: BLOOM LEVEL PLATEAU ──
        const bloomLevels = classEvents
          .map((e: any) => e.bloom_level)
          .filter(Boolean);
        const lowerBloom = bloomLevels.filter((b: string) =>
          ["remember", "understand"].includes(b.toLowerCase())
        );
        if (bloomLevels.length >= 5 && lowerBloom.length / bloomLevels.length > 0.8) {
          recommendations.push({
            rule: "bloom_plateau",
            priority: "medium",
            title: `🧠 Challenge Yourself in ${className}`,
            body: `${Math.round(lowerBloom.length / bloomLevels.length * 100)}% of your recent work is at Remember/Understand level. Try Apply, Analyze, or Evaluate-level exercises to deepen understanding.`,
            className,
            actionType: "coaching",
          });
        }

        // ── RULE 8: READY-TO-ADVANCE ──
        const readyAreas = classFocusAreas.filter((a: any) => {
          if (a.is_unlocked || a.topic_order === 0) return false;
          const prev = classFocusAreas.find((p: any) => p.topic_order === a.topic_order - 1);
          return prev && prev.quiz_passed && !a.is_unlocked;
        });
        for (const area of readyAreas) {
          recommendations.push({
            rule: "ready_to_advance",
            priority: "medium",
            title: `✅ Ready for "${area.topic}" in ${className}`,
            body: `You've completed the prerequisite! Start learning "${area.topic}" to continue your progress.`,
            className,
            topic: area.topic,
            actionType: "advance",
          });
        }
      }

      // ── RULE 7: STREAK AT RISK ── (cross-class)
      const todayStr = new Date().toISOString().split("T")[0];
      const todayEvents = events.filter((e: any) => e.created_at.startsWith(todayStr));
      const yesterdayStr = new Date(Date.now() - 86400000).toISOString().split("T")[0];
      const yesterdayEvents = events.filter((e: any) => e.created_at.startsWith(yesterdayStr));
      const hour = new Date().getUTCHours();

      if (todayEvents.length === 0 && yesterdayEvents.length > 0 && hour >= 18) {
        recommendations.push({
          rule: "streak_at_risk",
          priority: "medium",
          title: "🔥 Your Study Streak is at Risk!",
          body: "You haven't studied today yet. Even a quick 10-minute session will keep your streak alive!",
          className: classes[0] || "",
          actionType: "nudge",
        });
      }

      // Deduplicate by rule+class+topic
      const seen = new Set<string>();
      const uniqueRecs = recommendations.filter(r => {
        const key = `${r.rule}:${r.className}:${r.topic || ""}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      // Sort by priority
      const priorityOrder: Record<string, number> = { high: 0, medium: 1, low: 2 };
      uniqueRecs.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

      // Limit to top 5 recommendations
      const topRecs = uniqueRecs.slice(0, 5);

      // Check notification preferences
      const { data: prefs } = await supabase
        .from("notification_preferences")
        .select("*")
        .eq("user_id", userId)
        .maybeSingle();

      // Skip if study_plan notifications are disabled
      if (prefs && !prefs.study_plan) continue;

      // Check quiet hours
      if (prefs?.quiet_hours_enabled && prefs.quiet_hours_start && prefs.quiet_hours_end) {
        const now = new Date();
        const currentMin = now.getHours() * 60 + now.getMinutes();
        const [sh, sm] = prefs.quiet_hours_start.split(":").map(Number);
        const [eh, em] = prefs.quiet_hours_end.split(":").map(Number);
        const startMin = sh * 60 + sm;
        const endMin = eh * 60 + em;
        const isQuiet = startMin <= endMin
          ? currentMin >= startMin && currentMin < endMin
          : currentMin >= startMin || currentMin < endMin;
        if (isQuiet) continue;
      }

      // Insert as notifications
      if (topRecs.length > 0) {
        const rows = topRecs.map(r => ({
          user_id: userId,
          title: r.title,
          body: r.body,
          category: "study_plan",
          source_type: `predictive_${r.actionType}`,
          source_id: r.topic || null,
        }));

        await supabase.from("notifications").insert(rows);
        totalRecs += rows.length;
      }
    }

    return new Response(
      JSON.stringify({ success: true, users: userIds.length, recommendations: totalRecs }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Predictive coaching error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
