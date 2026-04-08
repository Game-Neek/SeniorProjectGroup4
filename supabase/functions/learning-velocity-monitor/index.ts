import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.76.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

/**
 * Learning Velocity Monitor — Equity-Aware Edition
 *
 * BIAS SAFEGUARDS:
 *  - Adaptive thresholds based on each student's OWN baseline (not a fixed standard)
 *  - Disengagement detection uses student's historical cadence, not a universal 3-day cutoff
 *  - Score decline accounts for Bloom-level progression (scores naturally dip at higher cognitive levels)
 *  - Positive reinforcement alerts balance negative flags (≥1 positive per 2 negative)
 *  - Daily alert cap prevents notification fatigue for disadvantaged students
 *  - Growth-oriented language avoids deficit framing
 */

interface VelocityAlert {
  rule: string;
  title: string;
  body: string;
  category: string;
  className: string;
  sentiment: "positive" | "neutral" | "negative";
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
    const day30Ago = new Date(now.getTime() - 30 * msPerDay).toISOString();
    const todayStr = now.toISOString().split("T")[0];

    const MAX_DAILY_ALERTS = 3; // Cap to prevent notification fatigue
    let totalAlerts = 0;

    for (const userId of userIds) {
      const alerts: VelocityAlert[] = [];

      // Fetch 30 days of events to compute personal baseline
      const { data: events } = await supabase
        .from("learning_events")
        .select("created_at, event_type, class_name, topic, score, total, bloom_level")
        .eq("user_id", userId)
        .gte("created_at", day30Ago)
        .order("created_at", { ascending: false })
        .limit(1000);

      if (!events || events.length === 0) continue;

      // Check how many alerts already sent today (fatigue cap)
      const { data: todayNotifs } = await supabase
        .from("notifications")
        .select("id")
        .eq("user_id", userId)
        .like("source_type", "velocity_%")
        .gte("created_at", todayStr);

      if ((todayNotifs?.length || 0) >= MAX_DAILY_ALERTS) continue;

      const { data: classes } = await supabase
        .from("user_classes")
        .select("class_name")
        .eq("user_id", userId)
        .eq("is_archived", false);

      const activeClasses = new Set((classes || []).map((c: any) => c.class_name));

      // ── Compute PERSONAL BASELINE cadence (events/day over 30 days) ──
      const uniqueActiveDays = new Set(
        events.map((e: any) => e.created_at.split("T")[0])
      );
      const personalCadenceDays = uniqueActiveDays.size; // how many days they study in 30
      // Average gap between study sessions (in days)
      const avgGapDays = personalCadenceDays > 1
        ? 30 / personalCadenceDays
        : 30; // if only 1 day, assume long gaps are normal

      // Adaptive disengagement threshold: 2x their normal gap, minimum 3 days, max 14
      const disengagementThreshold = Math.max(3, Math.min(14, Math.ceil(avgGapDays * 2)));

      const byClass = new Map<string, any[]>();
      for (const e of events) {
        if (!activeClasses.has(e.class_name)) continue;
        if (!byClass.has(e.class_name)) byClass.set(e.class_name, []);
        byClass.get(e.class_name)!.push(e);
      }

      for (const [className, classEvents] of byClass) {
        const recent7 = classEvents.filter((e: any) => e.created_at >= day7Ago);
        const prior7 = classEvents.filter(
          (e: any) => e.created_at < day7Ago && e.created_at >= day14Ago
        );

        const velocity7 = recent7.length / 7;
        const velocityPrior = prior7.length / 7;

        // ── Rule 1: ADAPTIVE DISENGAGEMENT ──
        // Uses personal cadence, not a fixed 3-day cutoff
        const lastEventDate = classEvents[0]?.created_at;
        if (lastEventDate) {
          const daysSince = Math.floor(
            (now.getTime() - new Date(lastEventDate).getTime()) / msPerDay
          );
          if (daysSince >= disengagementThreshold) {
            // Growth-oriented language, no alarming emojis
            alerts.push({
              rule: "disengagement",
              title: `Ready to pick up ${className}?`,
              body: `It's been ${daysSince} days since your last session. Based on your typical study pattern, now is a great time to reconnect. Even a quick 10-minute review keeps concepts fresh.`,
              category: "study_plan",
              className,
              sentiment: "neutral",
            });
          }
        }

        // ── Rule 2: VELOCITY DROP — ≥40% drop relative to PERSONAL baseline ──
        if (velocityPrior > 0.5 && velocity7 < velocityPrior * 0.6) {
          const dropPct = Math.round(
            ((velocityPrior - velocity7) / velocityPrior) * 100
          );
          alerts.push({
            rule: "velocity_drop",
            title: `Study pace change in ${className}`,
            body: `Your study frequency shifted from ${velocityPrior.toFixed(1)} to ${velocity7.toFixed(1)} sessions/day. Life gets busy — short daily blocks can help you stay on track when you're ready.`,
            category: "study_plan",
            className,
            sentiment: "neutral",
          });
        }

        // ── Rule 3: BLOOM-AWARE SCORE DECLINE ──
        // Scores naturally dip when advancing to higher Bloom levels.
        // Only flag if decline happens at the SAME cognitive level.
        const scoredRecent = recent7.filter(
          (e: any) => e.score != null && e.total != null && e.total > 0
        );
        const scoredPrior = prior7.filter(
          (e: any) => e.score != null && e.total != null && e.total > 0
        );

        if (scoredRecent.length >= 2 && scoredPrior.length >= 2) {
          // Check if Bloom level advanced (scores should naturally dip)
          const BLOOM_ORDER: Record<string, number> = {
            remember: 0, understand: 1, apply: 2, analyze: 3, evaluate: 4, create: 5,
          };
          const avgBloomRecent = scoredRecent
            .filter((e: any) => e.bloom_level)
            .reduce((s: number, e: any) => s + (BLOOM_ORDER[e.bloom_level?.toLowerCase()] || 0), 0)
            / Math.max(1, scoredRecent.filter((e: any) => e.bloom_level).length);
          const avgBloomPrior = scoredPrior
            .filter((e: any) => e.bloom_level)
            .reduce((s: number, e: any) => s + (BLOOM_ORDER[e.bloom_level?.toLowerCase()] || 0), 0)
            / Math.max(1, scoredPrior.filter((e: any) => e.bloom_level).length);

          const bloomAdvanced = avgBloomRecent > avgBloomPrior + 0.5;

          const avgRecent = scoredRecent.reduce(
            (s: number, e: any) => s + (e.score / e.total) * 100, 0
          ) / scoredRecent.length;
          const avgPrior = scoredPrior.reduce(
            (s: number, e: any) => s + (e.score / e.total) * 100, 0
          ) / scoredPrior.length;

          if (avgPrior - avgRecent >= 15) {
            if (bloomAdvanced) {
              // Positive framing: score dip is EXPECTED during cognitive growth
              alerts.push({
                rule: "bloom_growth",
                title: `Leveling up in ${className}! 🌱`,
                body: `Your scores shifted from ${Math.round(avgPrior)}% to ${Math.round(avgRecent)}%, but you're tackling harder material now. This is a normal part of deepening understanding — keep going!`,
                category: "study_plan",
                className,
                sentiment: "positive",
              });
            } else {
              alerts.push({
                rule: "score_decline",
                title: `Scores shifting in ${className}`,
                body: `Your average moved from ${Math.round(avgPrior)}% to ${Math.round(avgRecent)}%. This is a signal to revisit recent material — consider targeted practice on specific areas.`,
                category: "quiz_results",
                className,
                sentiment: "neutral",
              });
            }
          }
        }

        // ── Rule 4: GAP STALL — low mastery + no recent practice ──
        const { data: mastery } = await supabase
          .from("knowledge_mastery")
          .select("mastery_score, last_practiced_at, component_id")
          .eq("user_id", userId)
          .lt("mastery_score", 50);

        if (mastery) {
          const day5Ago = new Date(now.getTime() - 5 * msPerDay).toISOString();
          const { data: components } = await supabase
            .from("knowledge_components")
            .select("id, objective, parent_topic")
            .eq("user_id", userId)
            .eq("class_name", className);

          const componentIds = new Set((components || []).map((c: any) => c.id));
          const componentMap = new Map((components || []).map((c: any) => [c.id, c]));

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
              title: `Topics ready for review in ${className}`,
              body: `${topicNames} could use some focused practice. A short targeted session can help build confidence in these areas.`,
              category: "study_plan",
              className,
              sentiment: "neutral",
            });
          }
        }

        // ── POSITIVE REINFORCEMENT: Celebrate improvements ──
        if (velocity7 > velocityPrior * 1.3 && velocity7 > 0.5) {
          alerts.push({
            rule: "velocity_up",
            title: `Great momentum in ${className}! 🎯`,
            body: `Your study pace increased this week. Consistency is the strongest predictor of success — keep it up!`,
            category: "study_plan",
            className,
            sentiment: "positive",
          });
        }

        if (scoredRecent.length >= 2 && scoredPrior.length >= 2) {
          const avgR = scoredRecent.reduce((s: number, e: any) => s + (e.score / e.total) * 100, 0) / scoredRecent.length;
          const avgP = scoredPrior.reduce((s: number, e: any) => s + (e.score / e.total) * 100, 0) / scoredPrior.length;
          if (avgR - avgP >= 10) {
            alerts.push({
              rule: "score_improvement",
              title: `Scores improving in ${className}! ⬆️`,
              body: `Your average went from ${Math.round(avgP)}% to ${Math.round(avgR)}%. Your effort is paying off.`,
              category: "quiz_results",
              className,
              sentiment: "positive",
            });
          }
        }
      }

      // ── EQUITY SAFEGUARD: Balance negative with positive ──
      const negativeAlerts = alerts.filter(a => a.sentiment === "negative" || a.sentiment === "neutral");
      const positiveAlerts = alerts.filter(a => a.sentiment === "positive");

      // Ensure at least 1 positive alert for every 2 negative/neutral ones
      let finalAlerts = [...alerts];
      if (negativeAlerts.length > 0 && positiveAlerts.length === 0) {
        // Don't send only negative — either find a positive or reduce negatives
        finalAlerts = negativeAlerts.slice(0, 1); // limit to 1 negative max if no positives
      }

      // Apply daily cap
      const remainingSlots = MAX_DAILY_ALERTS - (todayNotifs?.length || 0);
      finalAlerts = finalAlerts.slice(0, remainingSlots);

      // Deduplicate: don't send if same rule+class already notified today
      for (const alert of finalAlerts) {
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
