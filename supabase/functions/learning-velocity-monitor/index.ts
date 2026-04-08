import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.76.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

/**
 * Learning Velocity Monitor
 *
 * Analyses learning_events to compute:
 *  1. VELOCITY  — events/day over rolling 7-day windows
 *  2. DISENGAGEMENT — no activity for 3+ days on any active class
 *  3. VELOCITY DROP — ≥40% drop in 7-day velocity vs previous 7 days
 *  4. SCORE DECLINE — avg score dropped ≥15 points in last 7 days vs prior 7
 *  5. GAP STALL — topic with <50% mastery and no practice in 5+ days
 *
 * Creates notifications for each flagged condition (max 1 per rule per day).
 */

interface VelocityAlert {
  rule: string;
  title: string;
  body: string;
  category: string;
  className: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY)
      throw new Error("Missing config");

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const body = await req.json().catch(() => ({}));
    const targetUserId: string | null = body.userId || null;

    // Determine users to process
    let userIds: string[] = [];
    if (targetUserId) {
      userIds = [targetUserId];
    } else {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id")
        .limit(500);
      userIds = (profiles || []).map((p: any) => p.id);
    }

    const now = new Date();
    const msPerDay = 86_400_000;
    const day7Ago = new Date(now.getTime() - 7 * msPerDay).toISOString();
    const day14Ago = new Date(now.getTime() - 14 * msPerDay).toISOString();
    const day3Ago = new Date(now.getTime() - 3 * msPerDay).toISOString();
    const day5Ago = new Date(now.getTime() - 5 * msPerDay).toISOString();
    const todayStr = now.toISOString().split("T")[0];

    let totalAlerts = 0;

    for (const userId of userIds) {
      const alerts: VelocityAlert[] = [];

      // Fetch last 14 days of events
      const { data: events } = await supabase
        .from("learning_events")
        .select("created_at, event_type, class_name, topic, score, total")
        .eq("user_id", userId)
        .gte("created_at", day14Ago)
        .order("created_at", { ascending: false })
        .limit(1000);

      if (!events || events.length === 0) continue;

      // Get user's active classes
      const { data: classes } = await supabase
        .from("user_classes")
        .select("class_name")
        .eq("user_id", userId)
        .eq("is_archived", false);

      const activeClasses = new Set((classes || []).map((c: any) => c.class_name));

      // Group events by class
      const byClass = new Map<string, any[]>();
      for (const e of events) {
        if (!activeClasses.has(e.class_name)) continue;
        if (!byClass.has(e.class_name)) byClass.set(e.class_name, []);
        byClass.get(e.class_name)!.push(e);
      }

      for (const [className, classEvents] of byClass) {
        const recent7 = classEvents.filter(
          (e: any) => e.created_at >= day7Ago
        );
        const prior7 = classEvents.filter(
          (e: any) => e.created_at < day7Ago && e.created_at >= day14Ago
        );

        const velocity7 = recent7.length / 7;
        const velocityPrior = prior7.length / 7;

        // ── Rule 1: DISENGAGEMENT — no events in 3+ days ──
        const lastEventDate = classEvents[0]?.created_at;
        if (lastEventDate && lastEventDate < day3Ago) {
          const daysSince = Math.floor(
            (now.getTime() - new Date(lastEventDate).getTime()) / msPerDay
          );
          alerts.push({
            rule: "disengagement",
            title: `📉 No activity in ${className}`,
            body: `It's been ${daysSince} days since your last study session. A quick 10-minute review can keep concepts fresh.`,
            category: "study_plan",
            className,
          });
        }

        // ── Rule 2: VELOCITY DROP — ≥40% drop ──
        if (velocityPrior > 0.5 && velocity7 < velocityPrior * 0.6) {
          const dropPct = Math.round(
            ((velocityPrior - velocity7) / velocityPrior) * 100
          );
          alerts.push({
            rule: "velocity_drop",
            title: `⚠️ Learning pace dropped ${dropPct}% in ${className}`,
            body: `Your study velocity went from ${velocityPrior.toFixed(1)} to ${velocity7.toFixed(1)} sessions/day. Try scheduling short daily study blocks to rebuild momentum.`,
            category: "study_plan",
            className,
          });
        }

        // ── Rule 3: SCORE DECLINE — avg score dropped ≥15pts ──
        const scoredRecent = recent7.filter(
          (e: any) => e.score != null && e.total != null && e.total > 0
        );
        const scoredPrior = prior7.filter(
          (e: any) => e.score != null && e.total != null && e.total > 0
        );

        if (scoredRecent.length >= 2 && scoredPrior.length >= 2) {
          const avgRecent =
            scoredRecent.reduce(
              (s: number, e: any) => s + (e.score / e.total) * 100,
              0
            ) / scoredRecent.length;
          const avgPrior =
            scoredPrior.reduce(
              (s: number, e: any) => s + (e.score / e.total) * 100,
              0
            ) / scoredPrior.length;

          if (avgPrior - avgRecent >= 15) {
            alerts.push({
              rule: "score_decline",
              title: `📊 Scores declining in ${className}`,
              body: `Your average dropped from ${Math.round(avgPrior)}% to ${Math.round(avgRecent)}%. Consider revisiting foundational topics or using the AI tutor for targeted practice.`,
              category: "quiz_results",
              className,
            });
          }
        }

        // ── Rule 4: GAP STALL — low mastery + no recent practice ──
        const { data: mastery } = await supabase
          .from("knowledge_mastery")
          .select("mastery_score, last_practiced_at, component_id")
          .eq("user_id", userId)
          .lt("mastery_score", 50);

        if (mastery) {
          // Filter to components in this class
          const { data: components } = await supabase
            .from("knowledge_components")
            .select("id, objective, parent_topic")
            .eq("user_id", userId)
            .eq("class_name", className);

          const componentIds = new Set(
            (components || []).map((c: any) => c.id)
          );
          const componentMap = new Map(
            (components || []).map((c: any) => [c.id, c])
          );

          const stalledGaps = mastery.filter(
            (m: any) =>
              componentIds.has(m.component_id) &&
              (!m.last_practiced_at || m.last_practiced_at < day5Ago)
          );

          if (stalledGaps.length > 0) {
            const topicNames = stalledGaps
              .slice(0, 3)
              .map((g: any) => {
                const comp = componentMap.get(g.component_id);
                return comp?.parent_topic || comp?.objective || "Unknown";
              })
              .join(", ");

            alerts.push({
              rule: "gap_stall",
              title: `🔴 ${stalledGaps.length} knowledge gap${stalledGaps.length > 1 ? "s" : ""} stalling in ${className}`,
              body: `Topics like ${topicNames} have low mastery and haven't been practiced recently. Targeted review can prevent these gaps from widening.`,
              category: "study_plan",
              className,
            });
          }
        }
      }

      // Deduplicate: don't send if same rule+class already notified today
      for (const alert of alerts) {
        const { data: existing } = await supabase
          .from("notifications")
          .select("id")
          .eq("user_id", userId)
          .eq("source_type", `velocity_${alert.rule}`)
          .gte("created_at", todayStr)
          .limit(1);

        if (existing && existing.length > 0) continue;

        await supabase.from("notifications").insert({
          user_id: userId,
          title: alert.title,
          body: alert.body,
          category: alert.category,
          source_type: `velocity_${alert.rule}`,
          source_id: alert.className,
        });
        totalAlerts++;
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        usersProcessed: userIds.length,
        alertsCreated: totalAlerts,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Learning velocity monitor error:", err);
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
